import { describe, it, expect } from 'vitest'
import { parseProfileName, generateNextProfileName } from '../profileUtils'

describe('profileUtils', () => {
  describe('parseProfileName', () => {
    it('parses space-separated number', () => {
      expect(parseProfileName('Scene 1')).toEqual({
        baseName: 'Scene',
        separator: ' ',
        num: 1,
      })
    })

    it('parses underscore-separated number', () => {
      expect(parseProfileName('Scene_1')).toEqual({
        baseName: 'Scene',
        separator: '_',
        num: 1,
      })
    })

    it('parses hyphen-separated number', () => {
      expect(parseProfileName('Scene-1')).toEqual({
        baseName: 'Scene',
        separator: '-',
        num: 1,
      })
    })

    it('parses attached number with no separator', () => {
      expect(parseProfileName('Scene1')).toEqual({
        baseName: 'Scene',
        separator: '',
        num: 1,
      })
    })

    it('parses name without trailing number', () => {
      expect(parseProfileName('Scene')).toEqual({
        baseName: 'Scene',
        separator: ' ',
        num: null,
      })
    })

    it('handles numeric-only string as non-empty baseName fallback', () => {
      expect(parseProfileName('123')).toEqual({
        baseName: '123',
        separator: ' ',
        num: null,
      })
    })
  })

  describe('generateNextProfileName', () => {
    it('generates next name with space separator', () => {
      expect(generateNextProfileName('Scene 1', ['Scene 1'])).toBe('Scene 2')
    })

    it('generates next name with underscore separator', () => {
      expect(generateNextProfileName('Scene_1', ['Scene_1', 'Scene_2'])).toBe('Scene_3')
    })

    it('generates next name with hyphen separator', () => {
      expect(generateNextProfileName('Scene-1', ['Scene-1'])).toBe('Scene-2')
    })

    it('generates next name with no separator', () => {
      expect(generateNextProfileName('Scene1', ['Scene1'])).toBe('Scene2')
    })

    it('generates next name when source has no number suffix', () => {
      expect(generateNextProfileName('Scene', ['Scene'])).toBe('Scene 2')
    })

    it('finds max existing number + 1 among multiple presets', () => {
      expect(generateNextProfileName('Scene 1', ['Scene 1', 'Scene 5', 'Scene 2'])).toBe('Scene 6')
    })

    it('handles names with symbols/parentheses properly', () => {
      expect(generateNextProfileName('Char (Hero) 1', ['Char (Hero) 1'])).toBe('Char (Hero) 2')
    })

    it('handles Japanese Unicode names properly', () => {
      expect(generateNextProfileName('キャラ設定 1', ['キャラ設定 1'])).toBe('キャラ設定 2')
    })

    it('handles empty string / default fallback', () => {
      expect(generateNextProfileName('', ['Set 1', 'Set 2'])).toBe('Set 1')
    })

    it('handles "Set" with existing sets', () => {
      expect(generateNextProfileName('Set', ['Set 1', 'Set 2'])).toBe('Set 3')
    })
  })
})
