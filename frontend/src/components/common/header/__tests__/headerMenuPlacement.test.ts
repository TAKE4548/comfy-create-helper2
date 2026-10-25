// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeHeaderMenuPlacement,
  HEADER_MENU_GAP_PX,
  HEADER_MENU_EDGE_MARGIN_PX,
  HEADER_MENU_MIN_HEIGHT_PX,
  type HeaderMenuPlacementInput,
  type RectLike,
} from '../headerMenuPlacement'

const GAP = HEADER_MENU_GAP_PX
const EDGE = HEADER_MENU_EDGE_MARGIN_PX
const MIN_H = HEADER_MENU_MIN_HEIGHT_PX

const viewportArb = fc.record({
  width: fc.integer({ min: 200, max: 2400 }),
  height: fc.integer({ min: 200, max: 2400 }),
})

const anchorArb = (vp: { width: number; height: number }): fc.Arbitrary<RectLike> =>
  fc
    .tuple(
      fc.integer({ min: -50, max: vp.height + 50 }),
      fc.integer({ min: 0, max: 120 }),
      fc.integer({ min: -50, max: vp.width + 50 }),
      fc.integer({ min: 0, max: 300 }),
    )
    .map(([top, h, left, w]) => ({ top, bottom: top + h, left, right: left + w }))

const inputArb: fc.Arbitrary<HeaderMenuPlacementInput> = viewportArb.chain((viewport) =>
  fc.record({
    anchor: anchorArb(viewport),
    panelWidth: fc.integer({ min: 0, max: 600 }),
    viewport: fc.constant(viewport),
    align: fc.constantFrom('start' as const, 'end' as const),
  }),
)

const inputWithHeaderArb: fc.Arbitrary<HeaderMenuPlacementInput> = inputArb.chain((input) =>
  fc
    .option(fc.integer({ min: -100, max: 2600 }), { nil: undefined })
    .map((headerBottom) => ({ ...input, headerBottom })),
)

// Independent oracle for the shouldClose / maxHeight contract.
function oracleOffscreen(a: RectLike, vp: { width: number; height: number }): boolean {
  return a.bottom < 0 || a.top > vp.height || a.right < 0 || a.left > vp.width
}
function oracleMaxHeight(a: RectLike, vp: { width: number; height: number }): number {
  return Math.max(0, vp.height - (a.bottom + GAP) - EDGE)
}
// Header-aware oracle: the reference bottom is the larger of the trigger bottom and a finite headerBottom.
function oracleHeaderMaxHeight(
  a: RectLike,
  vp: { width: number; height: number },
  headerBottom: number | undefined,
): number {
  const refBottom =
    headerBottom !== undefined && Number.isFinite(headerBottom)
      ? Math.max(a.bottom, headerBottom)
      : a.bottom
  return Math.max(0, vp.height - (refBottom + GAP) - EDGE)
}

describe('headerMenuPlacement pure function', () => {
  describe('fixed examples', () => {
    const vp = { width: 375, height: 667 }
    const anchor: RectLike = { top: 11, bottom: 39, left: 300, right: 330 }

    it('[REQ-346/AC-5] align start clamps left to viewport right edge limit (375x667, panel 240)', () => {
      const r = computeHeaderMenuPlacement({ anchor, panelWidth: 240, viewport: vp, align: 'start' })
      expect(r.top).toBe(45)
      expect(r.left).toBe(127)
      expect(r.maxHeight).toBe(614)
      expect(r.shouldClose).toBe(false)
    })

    it('[REQ-346/AC-5] align end aligns panel right edge to anchor right (375x667, panel 240)', () => {
      const r = computeHeaderMenuPlacement({ anchor, panelWidth: 240, viewport: vp, align: 'end' })
      expect(r.left).toBe(90)
      expect(r.top).toBe(45)
    })

    it('[REQ-346/AC-3] maxHeight follows viewport height (height 360)', () => {
      const r = computeHeaderMenuPlacement({
        anchor,
        panelWidth: 240,
        viewport: { width: 375, height: 360 },
        align: 'start',
      })
      expect(r.maxHeight).toBe(307)
      expect(r.shouldClose).toBe(false)
    })

    it('[REQ-346/AC-6] zero rect is not treated as offscreen (jsdom getBoundingClientRect)', () => {
      const r = computeHeaderMenuPlacement({
        anchor: { top: 0, bottom: 0, left: 0, right: 0 },
        panelWidth: 240,
        viewport: vp,
        align: 'start',
      })
      expect(r.shouldClose).toBe(false)
      expect(r.top).toBe(6)
    })

    it('[REQ-346/AC-5] Red Team: align end with anchor near left edge clamps left to edge margin', () => {
      const r = computeHeaderMenuPlacement({
        anchor: { top: 11, bottom: 39, left: 0, right: 20 },
        panelWidth: 240,
        viewport: vp,
        align: 'end',
      })
      expect(r.left).toBe(EDGE)
    })

    it('[REQ-346/AC-5] Red Team: viewport narrower than panel yields left === edge margin', () => {
      const r = computeHeaderMenuPlacement({
        anchor,
        panelWidth: 600,
        viewport: { width: 200, height: 667 },
        align: 'start',
      })
      expect(r.left).toBe(EDGE)
    })

    it('[REQ-346/AC-1] headerBottom below the trigger wins: top === headerBottom + 6 (375x667, anchor.bottom 39, headerBottom 118 -> top 124, maxHeight 535)', () => {
      const r = computeHeaderMenuPlacement({
        anchor,
        headerBottom: 118,
        panelWidth: 240,
        viewport: vp,
        align: 'start',
      })
      expect(r.top).toBe(124)
      expect(r.maxHeight).toBe(535)
    })

    it('[REQ-346/AC-1] trigger bottom wins when it is below the header bottom (hit-slop overflow): anchor.bottom 44, headerBottom 40 -> top 50', () => {
      const r = computeHeaderMenuPlacement({
        anchor: { ...anchor, bottom: 44 },
        headerBottom: 40,
        panelWidth: 240,
        viewport: vp,
        align: 'start',
      })
      expect(r.top).toBe(50)
    })

    it('[REQ-346/AC-1] headerBottom undefined, NaN and Infinity fall back to the trigger bottom (top 45)', () => {
      for (const headerBottom of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
        const r = computeHeaderMenuPlacement({
          anchor,
          headerBottom,
          panelWidth: 240,
          viewport: vp,
          align: 'start',
        })
        expect(r.top).toBe(45)
      }
    })

    it('[REQ-346/AC-6] zero header rect (headerBottom 0) with a zero anchor does not close and gives top 6', () => {
      const r = computeHeaderMenuPlacement({
        anchor: { top: 0, bottom: 0, left: 0, right: 0 },
        headerBottom: 0,
        panelWidth: 240,
        viewport: vp,
        align: 'start',
      })
      expect(r.shouldClose).toBe(false)
      expect(r.top).toBe(6)
    })

    it('[REQ-346/AC-6] header bottom beyond the viewport yields maxHeight 0 and shouldClose true', () => {
      const r = computeHeaderMenuPlacement({
        anchor,
        headerBottom: 400,
        panelWidth: 240,
        viewport: { width: 375, height: 360 },
        align: 'start',
      })
      expect(r.maxHeight).toBe(0)
      expect(r.shouldClose).toBe(true)
    })

    it('[REQ-346/AC-3] mobile wrapped header: 375x360 open, 375x228 open at the threshold, 375x227 closes', () => {
      const wrappedAnchor: RectLike = { top: 43, bottom: 71, left: 300, right: 330 }
      const at360 = computeHeaderMenuPlacement({
        anchor: wrappedAnchor,
        headerBottom: 118,
        panelWidth: 240,
        viewport: { width: 375, height: 360 },
        align: 'start',
      })
      expect(at360.maxHeight).toBe(228)
      expect(at360.shouldClose).toBe(false)

      const at228 = computeHeaderMenuPlacement({
        anchor: wrappedAnchor,
        headerBottom: 118,
        panelWidth: 240,
        viewport: { width: 375, height: 228 },
        align: 'start',
      })
      expect(at228.maxHeight).toBe(96)
      expect(at228.shouldClose).toBe(false)

      const at227 = computeHeaderMenuPlacement({
        anchor: wrappedAnchor,
        headerBottom: 118,
        panelWidth: 240,
        viewport: { width: 375, height: 227 },
        align: 'start',
      })
      expect(at227.shouldClose).toBe(true)
    })
  })

  describe('property-based', () => {
    it('[REQ-346/AC-1] top is always at least anchor.bottom + 6', () => {
      fc.assert(
        fc.property(inputArb, (input) => {
          const r = computeHeaderMenuPlacement(input)
          expect(r.top).toBeGreaterThanOrEqual(input.anchor.bottom + GAP)
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-3] top + maxHeight never exceeds viewport.height - 8 (maxHeight >= 0)', () => {
      fc.assert(
        fc.property(inputArb, (input) => {
          const r = computeHeaderMenuPlacement(input)
          expect(r.maxHeight).toBeGreaterThanOrEqual(0)
          if (r.top <= input.viewport.height - EDGE) {
            expect(r.top + r.maxHeight).toBeLessThanOrEqual(input.viewport.height - EDGE)
          } else {
            // Anchor bottom is below the usable area: no vertical room at all.
            expect(r.maxHeight).toBe(0)
          }
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-5] left stays within [8, viewport.width - width - 8] when the panel fits', () => {
      fc.assert(
        fc.property(inputArb, (input) => {
          const vw = input.viewport.width
          fc.pre(input.panelWidth <= vw - 2 * EDGE)
          const r = computeHeaderMenuPlacement(input)
          const width = input.panelWidth
          expect(r.left).toBeGreaterThanOrEqual(EDGE)
          expect(r.left).toBeLessThanOrEqual(vw - width - EDGE)
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-5] left equals 8 when panelWidth exceeds the usable width', () => {
      fc.assert(
        fc.property(inputArb, (input) => {
          const vw = input.viewport.width
          fc.pre(input.panelWidth > vw - 2 * EDGE)
          const r = computeHeaderMenuPlacement(input)
          expect(r.left).toBe(EDGE)
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-6] maxHeight is non-increasing when viewport.height shrinks (same anchor)', () => {
      fc.assert(
        fc.property(
          inputArb,
          fc.integer({ min: 0, max: 800 }),
          (input, shrink) => {
            const smaller = {
              ...input,
              viewport: { ...input.viewport, height: Math.max(0, input.viewport.height - shrink) },
            }
            const big = computeHeaderMenuPlacement(input)
            const small = computeHeaderMenuPlacement(smaller)
            expect(small.maxHeight).toBeLessThanOrEqual(big.maxHeight)
            return true
          },
        ),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-6] shouldClose is true iff offscreen or maxHeight < 96', () => {
      fc.assert(
        fc.property(inputArb, (input) => {
          const r = computeHeaderMenuPlacement(input)
          const expected =
            oracleOffscreen(input.anchor, input.viewport) ||
            oracleMaxHeight(input.anchor, input.viewport) < MIN_H
          expect(r.shouldClose).toBe(expected)
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-1] top >= headerBottom + 6 whenever headerBottom is finite, and top equals the larger of the two candidates', () => {
      fc.assert(
        fc.property(inputWithHeaderArb, (input) => {
          const r = computeHeaderMenuPlacement(input)
          const hb = input.headerBottom
          const candidates = [input.anchor.bottom + GAP]
          if (hb !== undefined && Number.isFinite(hb)) {
            expect(r.top).toBeGreaterThanOrEqual(hb + GAP)
            candidates.push(hb + GAP)
          }
          expect(r.top).toBe(Math.max(...candidates))
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-5] left does not depend on headerBottom', () => {
      fc.assert(
        fc.property(inputWithHeaderArb, (input) => {
          const withHeader = computeHeaderMenuPlacement(input)
          const absent = computeHeaderMenuPlacement({ ...input, headerBottom: undefined })
          const other = computeHeaderMenuPlacement({ ...input, headerBottom: 0 })
          expect(withHeader.left).toBe(absent.left)
          expect(withHeader.left).toBe(other.left)
          return true
        }),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-6] maxHeight is non-increasing as headerBottom increases (same anchor and viewport)', () => {
      fc.assert(
        fc.property(
          inputArb,
          fc.integer({ min: -100, max: 2600 }),
          fc.integer({ min: 0, max: 2600 }),
          (input, hb, delta) => {
            const lower = computeHeaderMenuPlacement({ ...input, headerBottom: hb })
            const higher = computeHeaderMenuPlacement({ ...input, headerBottom: hb + delta })
            expect(higher.maxHeight).toBeLessThanOrEqual(lower.maxHeight)
            return true
          },
        ),
        { numRuns: 300 },
      )
    })

    it('[REQ-346/AC-6] shouldClose is true iff offscreen or maxHeight < 96, with the header-aware oracle', () => {
      fc.assert(
        fc.property(inputWithHeaderArb, (input) => {
          const r = computeHeaderMenuPlacement(input)
          const expected =
            oracleOffscreen(input.anchor, input.viewport) ||
            oracleHeaderMaxHeight(input.anchor, input.viewport, input.headerBottom) < MIN_H
          expect(r.shouldClose).toBe(expected)
          return true
        }),
        { numRuns: 300 },
      )
    })
  })
})
