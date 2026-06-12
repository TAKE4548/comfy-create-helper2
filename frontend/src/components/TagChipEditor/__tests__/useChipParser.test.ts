import { describe, it, expect } from 'vitest';
import { parseToChips, chipsToString } from '../useChipParser';

describe('useChipParser', () => {
  describe('parseToChips', () => {
    it('should return empty array for empty string', () => {
      expect(parseToChips('')).toEqual([]);
      expect(parseToChips('   ')).toEqual([]);
    });

    it('should parse comma-separated string to active chips with random IDs', () => {
      const result = parseToChips('a,b,c');
      expect(result).toHaveLength(3);
      
      expect(result[0].text).toBe('a');
      expect(result[0].enabled).toBe(true);
      expect(result[0].id).toBeDefined();

      expect(result[1].text).toBe('b');
      expect(result[1].enabled).toBe(true);
      expect(result[1].id).toBeDefined();

      expect(result[2].text).toBe('c');
      expect(result[2].enabled).toBe(true);
      expect(result[2].id).toBeDefined();

      // Ensure IDs are unique
      expect(result[0].id).not.toBe(result[1].id);
      expect(result[1].id).not.toBe(result[2].id);
    });

    it('should trim whitespace and filter out empty elements', () => {
      const result = parseToChips('  apple  , , banana ,  ');
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('apple');
      expect(result[1].text).toBe('banana');
    });
  });

  describe('chipsToString', () => {
    it('should join only enabled chips with comma and space', () => {
      const chips = [
        { id: '1', text: 'apple', enabled: true },
        { id: '2', text: 'banana', enabled: false },
        { id: '3', text: 'cherry', enabled: true },
      ];
      expect(chipsToString(chips)).toBe('apple, cherry');
    });

    it('should return empty string if no chips are enabled', () => {
      const chips = [
        { id: '1', text: 'apple', enabled: false },
        { id: '2', text: 'banana', enabled: false },
      ];
      expect(chipsToString(chips)).toBe('');
    });
  });
});
