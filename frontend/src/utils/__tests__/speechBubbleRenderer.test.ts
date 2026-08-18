import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  verticalCharMap,
  layoutVerticalText,
  layoutHorizontalText,
  calculateFitFontSize,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
  speechBubbleRenderer
} from '../speechBubbleRenderer'
import { SpeechBubble } from '../../types/speechBubble'

describe('speechBubbleRenderer', () => {
  describe('verticalCharMap and layoutVerticalText', () => {
    it('maps vertical punctuation correctly', () => {
      expect(verticalCharMap['ー']).toBe('｜')
      expect(verticalCharMap['「']).toBe('﹁')
      expect(verticalCharMap['」']).toBe('﹂')
      expect(verticalCharMap['…']).toBe('⋮')
    })

    it('returns empty array for empty text', () => {
      expect(layoutVerticalText('', 16, 200)).toEqual([])
    })

    it('splits text into vertical columns when maxHeight is exceeded', () => {
      const text = '吾輩は猫である。名前はまだ無い。'
      // maxHeight = 50, fontSize = 16 -> maxCharsPerCol = Math.floor(50 / (16 * 1.15)) = 2
      const cols = layoutVerticalText(text, 16, 50)
      expect(cols.length).toBeGreaterThan(1)
      expect(cols[0].length).toBeLessThanOrEqual(2)
      // verify punctuation replacement
      expect(cols.some(c => c.includes('︒'))).toBe(true)
    })

    it('respects manual line breaks in vertical text', () => {
      const text = 'こんにちは\n世界'
      const cols = layoutVerticalText(text, 16, 500)
      expect(cols).toEqual(['こんにちは', '世界'])
    })
  })

  describe('layoutHorizontalText', () => {
    it('returns empty array for empty text', () => {
      expect(layoutHorizontalText('', 16, 200)).toEqual([])
    })

    it('handles explicit newlines', () => {
      const text = 'Hello\nWorld'
      const lines = layoutHorizontalText(text, 16, 300)
      expect(lines).toEqual(['Hello', 'World'])
    })

    it('wraps lines based on approximate maxWidth when no context is provided', () => {
      const text = 'あいうえおかきくけこさしすせそ'
      // fontSize = 10 -> 1 char is 10px approx. maxWidth = 50 -> approx 5 chars per line
      const lines = layoutHorizontalText(text, 10, 50)
      expect(lines.length).toBeGreaterThan(1)
    })
  })

  describe('calculateFitFontSize', () => {
    it('returns maxSize if text is empty', () => {
      expect(calculateFitFontSize('', 100, 100, 'vertical')).toBe(48)
    })

    it('calculates font size within min/max bounds', () => {
      const size = calculateFitFontSize('あいうえお', 100, 100, 'vertical', undefined, 8, 48)
      expect(size).toBeGreaterThanOrEqual(8)
      expect(size).toBeLessThanOrEqual(48)
    })

    it('gives smaller font size for longer text', () => {
      const shortSize = calculateFitFontSize('短文', 80, 80, 'horizontal', undefined, 8, 48)
      const longSize = calculateFitFontSize('これは非常に長い文章であり吹き出しに収めるために縮小される必要があります。', 80, 80, 'horizontal', undefined, 8, 48)
      expect(longSize).toBeLessThan(shortSize)
    })
  })

  describe('draw functions with mock context', () => {
    let mockCtx: any

    beforeEach(() => {
      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        closePath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        roundRect: vi.fn(),
        strokeRect: vi.fn(),
        quadraticCurveTo: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        setLineDash: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 50 }),
      }
    })


    const baseBubble: SpeechBubble = {
      id: 'b-1',
      x: 10,
      y: 20,
      w: 100,
      h: 80,
      text: 'テスト',
      shape: 'oval',
      orientation: 'vertical',
      fontFamily: 'sans-serif',
      fontSize: 14,
      textColor: '#000000',
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      borderWidth: 2,
      tail: { x: 5, y: 110 }
    }

    it('draws oval shape with tail', () => {
      drawBubbleShape(mockCtx, baseBubble)
      expect(mockCtx.ellipse).toHaveBeenCalled()
      expect(mockCtx.fill).toHaveBeenCalled()
      expect(mockCtx.stroke).toHaveBeenCalled()
    })

    it('draws rounded-rect shape', () => {
      const rectBubble: SpeechBubble = { ...baseBubble, shape: 'rounded-rect' }
      drawBubbleShape(mockCtx, rectBubble)
      expect(mockCtx.lineTo).toHaveBeenCalled()
      expect(mockCtx.fill).toHaveBeenCalled()
    })

    it('draws burst shape', () => {
      const burstBubble: SpeechBubble = { ...baseBubble, shape: 'burst' }
      drawBubbleShape(mockCtx, burstBubble)
      expect(mockCtx.lineTo).toHaveBeenCalled()
    })

    it('draws cloud shape', () => {
      const cloudBubble: SpeechBubble = { ...baseBubble, shape: 'cloud' }
      drawBubbleShape(mockCtx, cloudBubble)
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalled()
      expect(mockCtx.fill).toHaveBeenCalled()
    })


    it('draws none shape by skipping drawing', () => {
      const noneBubble: SpeechBubble = { ...baseBubble, shape: 'none' }
      drawBubbleShape(mockCtx, noneBubble)
      expect(mockCtx.ellipse).not.toHaveBeenCalled()
    })

    it('draws vertical text', () => {
      drawBubbleText(mockCtx, baseBubble)
      expect(mockCtx.fillText).toHaveBeenCalled()
    })

    it('draws horizontal text', () => {
      const horizBubble: SpeechBubble = { ...baseBubble, orientation: 'horizontal' }
      drawBubbleText(mockCtx, horizBubble)
      expect(mockCtx.fillText).toHaveBeenCalled()
    })

    it('draws selection indicators when isSelected is true', () => {
      drawSpeechBubble(mockCtx, baseBubble, true)
      expect(mockCtx.strokeRect).toHaveBeenCalled()
      expect(mockCtx.arc).toHaveBeenCalled() // tail handle
    })

    it('exports all functions on speechBubbleRenderer object', () => {
      expect(speechBubbleRenderer.drawSpeechBubble).toBeDefined()
      expect(speechBubbleRenderer.layoutVerticalText).toBeDefined()
      expect(speechBubbleRenderer.layoutHorizontalText).toBeDefined()
      expect(speechBubbleRenderer.calculateFitBubbleDimensions).toBeDefined()
    })

    it('calculates fit bubble dimensions for vertical and horizontal text', () => {
      const vertDim = speechBubbleRenderer.calculateFitBubbleDimensions('こんにちは\n世界', 20, 'vertical')
      expect(vertDim.w).toBeGreaterThan(50)
      expect(vertDim.h).toBeGreaterThan(50)

      const horizDim = speechBubbleRenderer.calculateFitBubbleDimensions('Hello World', 20, 'horizontal')
      expect(horizDim.w).toBeGreaterThan(50)
      expect(horizDim.h).toBeGreaterThan(50)
    })
  })
})

