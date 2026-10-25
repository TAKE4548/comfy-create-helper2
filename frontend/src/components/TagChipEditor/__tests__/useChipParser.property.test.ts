// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { parseToChips, chipsToString, parseTagWeight, formatTagWeight, adjustWeight } from '../useChipParser'

describe('useChipParser property-based tests (fast-check)', () => {
  it('Property 1 (No-crash): parseToChips and chipsToString never throw on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (str) => {
        const chips = parseToChips(str)
        expect(Array.isArray(chips)).toBe(true)
        const backToString = chipsToString(chips)
        expect(typeof backToString).toBe('string')
        return true
      }),
      { numRuns: 100 }
    )
  })

  it('Property 2 (Round-trip & Preservation): Non-empty comma-free items are preserved across parse and serialization', () => {
    // Arbitrary array of strings that do not contain commas or whitespace-only
    const isBalancedParens = (str: string): boolean => {
      let depth = 0;
      for (const ch of str) {
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth < 0) return false;
        }
      }
      return depth === 0;
    };

    const cleanTagArbitrary = fc
      .stringMatching(/^[a-zA-Z0-9_\-:()]{1,30}$/)
      .filter((s) => s.trim().length > 0 && !s.includes(',') && isBalancedParens(s))

    fc.assert(
      fc.property(fc.array(cleanTagArbitrary, { minLength: 1, maxLength: 15 }), (tags) => {
        const rawJoined = tags.join(', ')
        const chips = parseToChips(rawJoined)
        expect(chips.length).toBe(tags.length)
        const serialized = chipsToString(chips)
        expect(serialized).toBe(rawJoined)
        return true
      }),
      { numRuns: 100 }
    )
  })

  it('Property 3 (Weight Parsing & Invariant): Formatted tag weight correctly parses back baseText and weight', () => {
    const baseTextArbitrary = fc
      .stringMatching(/^[a-zA-Z0-9_ ]{1,20}$/)
      .filter((s) => s.trim().length > 0 && !s.includes(':') && !s.includes('(') && !s.includes(')') && !s.includes('\n') && !s.includes('\r'))
    const weightArbitrary = fc.double({ min: 0.1, max: 5.0, noNaN: true }).filter((w) => Math.abs(w - 1.0) > 0.05)

    fc.assert(
      fc.property(baseTextArbitrary, weightArbitrary, (baseText, weight) => {
        const cleanBase = baseText.trim()
        const formatted = formatTagWeight(cleanBase, weight)
        const parsed = parseTagWeight(formatted)

        expect(parsed.baseText).toBe(cleanBase)
        expect(parsed.weight).not.toBeNull()
        expect(Math.abs((parsed.weight ?? 0) - Math.round(weight * 100) / 100)).toBeLessThan(0.01)
        return true
      }),
      { numRuns: 100 }
    )
  })
})
