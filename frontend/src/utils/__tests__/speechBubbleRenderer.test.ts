import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  verticalCharMap,
  getDefaultPathPoints,
  layoutVerticalText,
  layoutHorizontalText,
  calculateFitFontSize,
  calculateCharacterTransform,
  drawMultiStrokes,
  applyTextFill,
  drawBubbleShape,
  drawBubbleText,
  drawSpeechBubble,
  speechBubbleRenderer
} from '../speechBubbleRenderer'
import { SpeechBubble, MangaTextEffectConfig } from '../../types/speechBubble'

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

  describe('calculateCharacterTransform', () => {
    const dummyBubble: SpeechBubble = {
      id: 'b-1',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      text: 'ABC',
      shape: 'oval',
      orientation: 'vertical',
      fontFamily: 'sans-serif',
      fontSize: 16,
      textColor: '#000',
      backgroundColor: '#fff',
      borderColor: '#000',
      borderWidth: 2,
    }

    it('calculates scale curves correctly', () => {
      const fxLinear: MangaTextEffectConfig = { scaleCurve: 'linear', scaleStart: 1.0, scaleEnd: 2.0 }
      const t0 = calculateCharacterTransform(0, 3, dummyBubble, fxLinear)
      const t1 = calculateCharacterTransform(1, 3, dummyBubble, fxLinear)
      const t2 = calculateCharacterTransform(2, 3, dummyBubble, fxLinear)
      expect(t0.scale).toBeCloseTo(1.0)
      expect(t1.scale).toBeCloseTo(1.5)
      expect(t2.scale).toBeCloseTo(2.0)

      const fxEaseIn: MangaTextEffectConfig = { scaleCurve: 'ease-in', scaleStart: 1.0, scaleEnd: 3.0 }
      const te1 = calculateCharacterTransform(1, 3, dummyBubble, fxEaseIn)
      // t = 0.5 -> 1.0 + (2.0) * (0.25) = 1.5
      expect(te1.scale).toBeCloseTo(1.5)

      const fxBezier: MangaTextEffectConfig = { scaleCurve: 'bezier', scaleStart: 1.0, scaleEnd: 3.0 }
      const tb1 = calculateCharacterTransform(1, 3, dummyBubble, fxBezier)
      expect(tb1.scale).toBeCloseTo(2.0) // t = 0.5, bezier t*t*(3-2t) = 0.25*2 = 0.5 -> 1.0 + 2.0*0.5 = 2.0
    })

    it('handles rotate90Indices for vertical text', () => {
      const fx: MangaTextEffectConfig = { rotate90Indices: [1] }
      const t0 = calculateCharacterTransform(0, 3, dummyBubble, fx, 0)
      const t1 = calculateCharacterTransform(1, 3, dummyBubble, fx, 1)
      expect(t0.rotateRad).toBe(0)
      expect(t1.rotateRad).toBeCloseTo(Math.PI / 2)
    })

    it('calculates shear angle and baseline jitter', () => {
      const fx: MangaTextEffectConfig = { shearAngle: 15, baselineJitter: 5 }
      const t0 = calculateCharacterTransform(0, 3, dummyBubble, fx, 0)
      expect(t0.shearAngle).toBe(15)
      expect(t0.offsetX).not.toBe(0)
      expect(t0.offsetY).not.toBe(0)
    })

    it('calculates path preset coordinates and tangents', () => {
      const fxLine: MangaTextEffectConfig = {
        pathPreset: 'line',
        pathPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      }
      const tLine = calculateCharacterTransform(1, 3, dummyBubble, fxLine)
      expect(tLine.pathPos).toBeDefined()
      expect(tLine.pathPos?.x).toBeCloseTo(0.5)
      expect(tLine.pathPos?.y).toBeCloseTo(0.5)

      const fxArc: MangaTextEffectConfig = {
        pathPreset: 'arc',
        pathPoints: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }],
      }
      const tArc = calculateCharacterTransform(1, 3, dummyBubble, fxArc)
      expect(tArc.pathPos?.x).toBeCloseTo(0.5)
      expect(tArc.pathPos?.y).toBeCloseTo(0.5) // (1-0.5)^2*0 + 2*0.5*0.5*1 + 0.25*0 = 0.5

      const fxStepped: MangaTextEffectConfig = {
        pathPreset: 'stepped',
        pathPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        pathSteppedCount: 2,
      }
      const tStep = calculateCharacterTransform(0, 4, dummyBubble, fxStepped)
      expect(tStep.pathPos?.x).toBeCloseTo(0.25)
    })

    it('uses vertical default path points when pathPoints is not specified for vertical text', () => {
      const vertBubble: SpeechBubble = { ...dummyBubble, orientation: 'vertical' }
      const tLine = calculateCharacterTransform(1, 3, vertBubble, { pathPreset: 'line' })
      expect(tLine.pathPos).toBeDefined()
      expect(tLine.pathPos?.x).toBeCloseTo(0.5)
      expect(tLine.pathPos?.y).toBeCloseTo(0.5)
      // Tangent for vertical line (dx=0, dy=0.8) -> Math.PI / 2
      expect(tLine.pathPos?.tangentAngle).toBeCloseTo(Math.PI / 2)

      const tArc = calculateCharacterTransform(1, 3, vertBubble, { pathPreset: 'arc' })
      expect(tArc.pathPos).toBeDefined()
      expect(tArc.pathPos?.x).toBeCloseTo(0.5) // 0.7 * 0.25 + 0.3 * 0.5 + 0.7 * 0.25 = 0.5
      expect(tArc.pathPos?.y).toBeCloseTo(0.5)

      const tWave = calculateCharacterTransform(0, 3, vertBubble, { pathPreset: 'wave' })
      expect(tWave.pathPos).toBeDefined()
      expect(tWave.pathPos?.x).toBeCloseTo(0.5)
      expect(tWave.pathPos?.y).toBeCloseTo(0.1)

      const tStepped = calculateCharacterTransform(0, 3, vertBubble, { pathPreset: 'stepped' })
      expect(tStepped.pathPos).toBeDefined()
      expect(tStepped.pathPos?.x).toBeCloseTo(0.7 - (0.4) * (1 / 6))
    })

    it('uses horizontal default path points when pathPoints is not specified for horizontal text', () => {
      const horizBubble: SpeechBubble = { ...dummyBubble, orientation: 'horizontal' }
      const tLine = calculateCharacterTransform(1, 3, horizBubble, { pathPreset: 'line' })
      expect(tLine.pathPos).toBeDefined()
      expect(tLine.pathPos?.x).toBeCloseTo(0.5)
      expect(tLine.pathPos?.y).toBeCloseTo(0.5)
      expect(tLine.pathPos?.tangentAngle).toBeCloseTo(0)
    })
  })

  describe('getDefaultPathPoints', () => {
    it('returns default path points for vertical orientation', () => {
      expect(getDefaultPathPoints('line', 'vertical')).toEqual([
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ])
      expect(getDefaultPathPoints('arc', 'vertical')).toEqual([
        { x: 0.7, y: 0.1 },
        { x: 0.3, y: 0.5 },
        { x: 0.7, y: 0.9 },
      ])
      expect(getDefaultPathPoints('wave', 'vertical')).toEqual([
        { x: 0.5, y: 0.1 },
        { x: 0.2, y: 0.35 },
        { x: 0.8, y: 0.65 },
        { x: 0.5, y: 0.9 },
      ])
      expect(getDefaultPathPoints('stepped', 'vertical')).toEqual([
        { x: 0.7, y: 0.1 },
        { x: 0.3, y: 0.9 },
      ])
      expect(getDefaultPathPoints('none', 'vertical')).toEqual([])
    })

    it('returns default path points for horizontal orientation', () => {
      expect(getDefaultPathPoints('line', 'horizontal')).toEqual([
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ])
      expect(getDefaultPathPoints('arc', 'horizontal')).toEqual([
        { x: 0.1, y: 0.7 },
        { x: 0.5, y: 0.3 },
        { x: 0.9, y: 0.7 },
      ])
      expect(getDefaultPathPoints('wave', 'horizontal')).toEqual([
        { x: 0.1, y: 0.5 },
        { x: 0.35, y: 0.2 },
        { x: 0.65, y: 0.8 },
        { x: 0.9, y: 0.5 },
      ])
      expect(getDefaultPathPoints('stepped', 'horizontal')).toEqual([
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ])
      expect(getDefaultPathPoints('none', 'horizontal')).toEqual([])
    })
  })

  describe('drawMultiStrokes and applyTextFill', () => {
    let mockCtx: any

    beforeEach(() => {
      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        strokeText: vi.fn(),
        setLineDash: vi.fn(),
        createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
        createPattern: vi.fn().mockReturnValue({}),
      }
    })

    it('draws multiple stroke layers from outermost to innermost', () => {
      const layers = [
        { id: '1', width: 2, color: 'blue', opacity: 0.8, offsetX: 0, offsetY: 0 },
        { id: '2', width: 6, color: 'red', opacity: 1.0, lineStyle: 'dashed' as const, offsetX: 0, offsetY: 0 },
      ]
      drawMultiStrokes(mockCtx, 'A', 10, 20, layers)
      expect(mockCtx.strokeText).toHaveBeenCalledTimes(2)
      expect(mockCtx.setLineDash).toHaveBeenCalledWith([4, 4])
    })

    it('applies gradient and solid fills', () => {
      const dummyBubble: SpeechBubble = {
        id: 'b-1',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        text: 'A',
        shape: 'oval',
        orientation: 'vertical',
        fontFamily: 'sans-serif',
        fontSize: 16,
        textColor: '#000000',
        backgroundColor: '#ffffff',
        borderColor: '#000000',
        borderWidth: 2,
      }
      // Solid
      applyTextFill(mockCtx, dummyBubble, 50, 50, 100, 100, { fillMode: 'solid' })
      expect(mockCtx.fillStyle).toBe('#000000')

      // Linear Gradient
      applyTextFill(mockCtx, dummyBubble, 50, 50, 100, 100, {
        fillMode: 'gradient',
        gradientType: 'linear',
        gradientAngle: 90,
      })
      expect(mockCtx.createLinearGradient).toHaveBeenCalled()

      // Radial Gradient
      applyTextFill(mockCtx, dummyBubble, 50, 50, 100, 100, {
        fillMode: 'gradient',
        gradientType: 'radial',
      })
      expect(mockCtx.createRadialGradient).toHaveBeenCalled()
    })
  })

  describe('calculateFitFontSize', () => {
    it('returns maxSize if text is empty', () => {
      expect(calculateFitFontSize('', 100, 100, 'vertical')).toBe(48)
    })

    it('calculates font size within min/max bounds', () => {
      const size = calculateFitFontSize('あいうえお', 100, 100, 'vertical', undefined, undefined, 8, 48)
      expect(size).toBeGreaterThanOrEqual(8)
      expect(size).toBeLessThanOrEqual(48)
    })

    it('gives smaller font size for longer text', () => {
      const shortSize = calculateFitFontSize('短文', 80, 80, 'horizontal', undefined, undefined, 8, 48)
      const longSize = calculateFitFontSize('これは非常に長い文章であり吹き出しに収めるために縮小される必要があります。', 80, 80, 'horizontal', undefined, undefined, 8, 48)
      expect(longSize).toBeLessThan(shortSize)
    })

    it('accounts for effects like scaleCurve and multiStrokes', () => {
      const normalSize = calculateFitFontSize('テスト', 100, 100, 'vertical')
      const scaledSize = calculateFitFontSize('テスト', 100, 100, 'vertical', {
        scaleCurve: 'linear',
        scaleStart: 1.0,
        scaleEnd: 2.0,
        multiStrokes: [{ id: 's1', width: 10, color: '#000', opacity: 1, offsetX: 0, offsetY: 0 }],
      })
      expect(scaledSize).toBeLessThanOrEqual(normalSize)
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
        strokeText: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        transform: vi.fn(),
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

    it('draws text with path preset and effects', () => {
      const fxBubble: SpeechBubble = {
        ...baseBubble,
        effects: {
          pathPreset: 'wave',
          pathFollowRotation: true,
          scaleCurve: 'ease-out',
          scaleStart: 1.0,
          scaleEnd: 1.5,
          shearAngle: 10,
          multiStrokes: [{ id: '1', width: 2, color: 'red', opacity: 1, offsetX: 1, offsetY: 1 }],
        }
      }
      drawBubbleText(mockCtx, fxBubble)
      expect(mockCtx.translate).toHaveBeenCalled()
      expect(mockCtx.rotate).toHaveBeenCalled()
      expect(mockCtx.transform).toHaveBeenCalled()
      expect(mockCtx.strokeText).toHaveBeenCalled()
      expect(mockCtx.fillText).toHaveBeenCalled()
    })

    it('draws selection indicators when isSelected is true', () => {
      drawSpeechBubble(mockCtx, baseBubble, true)
      expect(mockCtx.strokeRect).toHaveBeenCalled()
      expect(mockCtx.arc).toHaveBeenCalled()
    })

    it('applies center rotation when rotation is specified in drawSpeechBubble', () => {
      const rotBubble: SpeechBubble = { ...baseBubble, rotation: 45 }
      drawSpeechBubble(mockCtx, rotBubble)
      // cx = (10 + 100/2) * 1 = 60, cy = (20 + 80/2) * 1 = 60
      expect(mockCtx.translate).toHaveBeenCalledWith(60, 60)
      expect(mockCtx.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180)
      expect(mockCtx.translate).toHaveBeenCalledWith(-60, -60)
      expect(mockCtx.save).toHaveBeenCalled()
      expect(mockCtx.restore).toHaveBeenCalled()
    })

    it('does not apply rotation transformation when rotation is 0 or undefined', () => {
      mockCtx.rotate.mockClear()
      drawSpeechBubble(mockCtx, { ...baseBubble, rotation: 0 })
      expect(mockCtx.rotate).not.toHaveBeenCalled()
    })

    it('exports all functions on speechBubbleRenderer object', () => {
      expect(speechBubbleRenderer.drawSpeechBubble).toBeDefined()
      expect(speechBubbleRenderer.getDefaultPathPoints).toBeDefined()
      expect(speechBubbleRenderer.layoutVerticalText).toBeDefined()
      expect(speechBubbleRenderer.layoutHorizontalText).toBeDefined()
      expect(speechBubbleRenderer.calculateCharacterTransform).toBeDefined()
      expect(speechBubbleRenderer.drawMultiStrokes).toBeDefined()
      expect(speechBubbleRenderer.applyTextFill).toBeDefined()
      expect(speechBubbleRenderer.calculateFitBubbleDimensions).toBeDefined()
    })

    it('compensates rotation with -PI/2 for vertical orientation with pathFollowRotation', () => {
      const vertFxBubble: SpeechBubble = {
        ...baseBubble,
        orientation: 'vertical',
        effects: {
          pathPreset: 'line', // vertical line tangentAngle is PI / 2
          pathFollowRotation: true,
        },
      }
      drawBubbleText(mockCtx, vertFxBubble)
      // Tangent is PI / 2, rotation for vertical is tangent - PI / 2 = 0
      // If rot is 0, ctx.rotate is not called for non-zero rot, or if called with non-zero
      // Let's test arc preset where tangent varies
      mockCtx.rotate.mockClear()
      const vertArcBubble: SpeechBubble = {
        ...baseBubble,
        orientation: 'vertical',
        effects: {
          pathPreset: 'arc',
          pathFollowRotation: true,
        },
      }
      drawBubbleText(mockCtx, vertArcBubble)
      expect(mockCtx.rotate).toHaveBeenCalled()
    })

    it('calculates fit bubble dimensions for vertical and horizontal text with effects', () => {
      const vertDim = speechBubbleRenderer.calculateFitBubbleDimensions('こんにちは\n世界', 20, 'vertical')
      expect(vertDim.w).toBeGreaterThan(50)
      expect(vertDim.h).toBeGreaterThan(50)

      const vertFxDim = speechBubbleRenderer.calculateFitBubbleDimensions('こんにちは\n世界', 20, 'vertical', {
        shearAngle: 20,
        multiStrokes: [{ id: 's1', width: 8, color: '#000', opacity: 1, offsetX: 0, offsetY: 0 }],
      })
      expect(vertFxDim.w).toBeGreaterThan(vertDim.w)

      const horizDim = speechBubbleRenderer.calculateFitBubbleDimensions('Hello World', 20, 'horizontal')
      expect(horizDim.w).toBeGreaterThan(50)
      expect(horizDim.h).toBeGreaterThan(50)
    })
  })
})


