import { describe, it, expect } from 'vitest'
import {
  getDefaultPathPoints,
  flipPathPoints,
  clampTailApexOutsideBubble,
  getTailContactPositions,
  getTailBasePosition,
  sampleCurveArcLength,
} from '../bubbleGeometry'
import type { SpeechBubble } from '../../types/speechBubble'

describe('bubbleGeometry', () => {
  describe('getDefaultPathPoints', () => {
    it('returns default points for horizontal orientation', () => {
      const pts = getDefaultPathPoints('wave', 'horizontal')
      expect(pts.length).toBeGreaterThan(0)
      expect(pts[0].x).toBe(0.1)
    })

    it('returns default points for vertical orientation', () => {
      const pts = getDefaultPathPoints('wave', 'vertical')
      expect(pts.length).toBeGreaterThan(0)
      expect(pts[0].y).toBe(0.1)
    })

    it('returns arc presets correctly', () => {
      const pts = getDefaultPathPoints('arc', 'horizontal')
      expect(pts.length).toBe(3)
    })
  })

  describe('flipPathPoints', () => {
    it('flips points horizontally', () => {
      const pts = [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ]
      const flipped = flipPathPoints(pts, 'horizontal')
      expect(flipped[0].x).toBe(0.1)
      expect(flipped[0].y).toBe(0.8)
    })

    it('flips points vertically', () => {
      const pts = [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ]
      const flipped = flipPathPoints(pts, 'vertical')
      expect(flipped[0].x).toBe(0.9)
      expect(flipped[0].y).toBe(0.2)
    })
  })

  describe('clampTailApexOutsideBubble', () => {
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
    }

    it('does not modify tail if apex is already outside', () => {
      const outsideTail = { x: 150, y: 300 }
      const clamped = clampTailApexOutsideBubble(bubble, outsideTail.x, outsideTail.y)
      expect(clamped.x).toBe(outsideTail.x)
      expect(clamped.y).toBe(outsideTail.y)
    })

    it('pushes tail apex outside if it falls inside bubble bounding/oval', () => {
      const insideTail = { x: 150, y: 140 } // Center of bubble
      const clamped = clampTailApexOutsideBubble(bubble, insideTail.x, insideTail.y)
      expect(clamped.y).toBeGreaterThanOrEqual(140 + 40 * 1.05)
    })
  })

  describe('getTailContactPositions', () => {
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
      tail: { x: 150, y: 250 },
    }

    it('calculates 2 contact points for oval bubble', () => {
      const contacts = getTailContactPositions(bubble)
      expect(contacts).not.toBeNull()
      if (contacts) {
        expect(contacts.p1).toBeDefined()
        expect(contacts.p2).toBeDefined()
        expect(contacts.p1.x).not.toBe(contacts.p2.x)
      }
    })

    it('returns null if tail is missing', () => {
      const bubbleNoTail = { ...bubble, tail: undefined }
      const contacts = getTailContactPositions(bubbleNoTail)
      expect(contacts).toBeNull()
    })
  })

  describe('getTailBasePosition', () => {
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
      tail: { x: 150, y: 250 },
    }

    it('calculates midpoint between contact positions', () => {
      const basePos = getTailBasePosition(bubble)
      expect(basePos).not.toBeNull()
      if (basePos) {
        expect(basePos.x).toBeCloseTo(150, 0)
        expect(basePos.y).toBeCloseTo(180, 0)
      }
    })
  })

  describe('sampleCurveArcLength', () => {
    it('samples bezier curve and computes length', () => {
      const points = [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ]
      const sampled = sampleCurveArcLength('arc', points, 100, 100, 20)
      expect(sampled.totalLength).toBeGreaterThan(50)
    })
  })
})