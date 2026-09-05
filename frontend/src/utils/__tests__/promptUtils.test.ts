import { describe, it, expect } from 'vitest'
import { prependToPrompt, appendToPrompt } from '../promptUtils'

describe('promptUtils', () => {
  describe('prependToPrompt', () => {
    it('prepends a prefix to an existing prompt with comma delimiter', () => {
      expect(prependToPrompt('1girl, blue eyes', 'masterpiece')).toBe('masterpiece, 1girl, blue eyes')
    })

    it('returns clean prefix when existing prompt is empty, spaces, or commas only', () => {
      expect(prependToPrompt('', 'masterpiece')).toBe('masterpiece')
      expect(prependToPrompt('   ', 'masterpiece')).toBe('masterpiece')
      expect(prependToPrompt(', , ,', 'masterpiece')).toBe('masterpiece')
    })

    it('returns clean existing prompt when prefix is empty, spaces, or commas only', () => {
      expect(prependToPrompt('1girl', '')).toBe('1girl')
      expect(prependToPrompt('1girl', '   ')).toBe('1girl')
      expect(prependToPrompt('1girl', ', , ')).toBe('1girl')
    })

    it('normalizes extra commas and spaces without producing duplicate commas', () => {
      expect(prependToPrompt(' , 1girl, blue eyes, ', ' , masterpiece, best quality, ')).toBe(
        'masterpiece, best quality, 1girl, blue eyes'
      )
    })
  })

  describe('appendToPrompt', () => {
    it('appends a suffix to an existing prompt with comma delimiter', () => {
      expect(appendToPrompt('masterpiece', '1girl, blue eyes')).toBe('masterpiece, 1girl, blue eyes')
    })

    it('returns clean suffix when existing prompt is empty, spaces, or commas only', () => {
      expect(appendToPrompt('', '1girl')).toBe('1girl')
      expect(appendToPrompt('   ', '1girl')).toBe('1girl')
      expect(appendToPrompt(' , , ', '1girl')).toBe('1girl')
    })

    it('returns clean existing prompt when suffix is empty, spaces, or commas only', () => {
      expect(appendToPrompt('1girl', '')).toBe('1girl')
      expect(appendToPrompt('1girl', '   ')).toBe('1girl')
      expect(appendToPrompt('1girl', ', ,')).toBe('1girl')
    })

    it('normalizes extra commas and spaces without producing duplicate commas', () => {
      expect(appendToPrompt(' , masterpiece, best quality, ', ' , 1girl, blue eyes, ')).toBe(
        'masterpiece, best quality, 1girl, blue eyes'
      )
    })
  })
})
