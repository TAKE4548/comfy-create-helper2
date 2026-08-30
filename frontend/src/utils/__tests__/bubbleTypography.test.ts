import { describe, it, expect } from 'vitest'
import {
  verticalCharMap,
  layoutVerticalText,
  layoutHorizontalText,
  calculateCharacterTransform,
  calculateFitFontSize,
  calculateFitBubbleDimensions,
} from '../bubbleTypography'
import type { SpeechBubble } from '../../types/speechBubble'

describe('bubbleTypography', () => {
  describe('verticalCharMap', () => {
    it('maps horizontal punctuation to vertical punctuation', () => {
      expect(verticalCharMap['…']).toBe('⋮')
      expect(verticalCharMap['ー']).toBe('｜')
      expect(verticalCharMap['「']).toBe('﹁')
      expect(verticalCharMap['」']).toBe('﹂')
    })
  })

  describe('layoutVerticalText & layoutHorizontalText', () => {
    it('splits text into vertical columns correctly', () => {
      const columns = layoutVerticalText('あいうえおかきくけこ', 16, 50)
      expect(columns.length).toBeGreaterThan(1)
    })

    it('splits text into horizontal rows correctly', () => {
      const lines = layoutHorizontalText('あいうえおかきくけこ', 16, 50)
      expect(lines.length).toBeGreaterThan(1)
    })
  })

  describe('calculateCharacterTransform', () => {
    const bubble: SpeechBubble = {
      id: 'b-1',
      x: 100,
      y: 100,
      w: 100,
      h: 80,
      text: 'テスト',
      shape: 'oval',
      orientation: 'vertical',
      fontFamily: 'sans-serif',
      fontSize: 16,
      textColor: '#000000',
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      borderWidth: 2,
      effects: {
        scaleCurve: 'linear',
        scaleStart: 1.0,
        scaleEnd: 2.0,
        sizeJitter: 5,
      },
    }

    it('calculates rotation and scale curve correctly', () => {
      const transform = calculateCharacterTransform(2, 5, bubble)
      expect(transform.scale).toBeGreaterThan(1.0)
      expect(transform.scale).toBeLessThanOrEqual(2.0)
    })
  })

  describe('calculateFitFontSize', () => {
    const mockCtx = {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D

    it('finds optimal font size that fits in bubble width/height', () => {
      const fontSize = calculateFitFontSize(
        'こんにちは世界',
        100,
        100,
        'vertical',
        mockCtx
      )
      expect(fontSize).toBeGreaterThanOrEqual(8)
      expect(fontSize).toBeLessThanOrEqual(48)
    })
  })

  describe('calculateFitBubbleDimensions', () => {
    const mockCtx = {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as unknown as CanvasRenderingContext2D

    it('calculates enclosing bubble dimensions for given text and font size', () => {
      const dims = calculateFitBubbleDimensions(
        'テスト',
        20,
        'vertical',
        mockCtx
      )
      expect(dims.w).toBeGreaterThan(30)
      expect(dims.h).toBeGreaterThan(30)
    })
  })
})