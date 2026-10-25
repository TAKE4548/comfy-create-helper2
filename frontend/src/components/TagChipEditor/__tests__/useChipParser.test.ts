// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseToChips, chipsToString, splitTags, parseTagWeight, formatTagWeight, adjustWeight, useChipParser } from '../useChipParser';

describe('useChipParser', () => {
  describe('splitTags', () => {
    it('should split by comma in standard mode', () => {
      expect(splitTags('apple, banana, cherry')).toEqual(['apple', 'banana', 'cherry']);
      expect(splitTags('1girl. red dress', false)).toEqual(['1girl. red dress']);
    });

    it('should split by period and comma in anima mode, preserving trailing period', () => {
      expect(splitTags('1girl, solo. red dress. (tag:1.2), masterpiece', true)).toEqual([
        '1girl',
        'solo.',
        'red dress.',
        '(tag:1.2)',
        'masterpiece',
      ]);
    });

    it('should protect periods inside parentheses, brackets, or braces', () => {
      expect(splitTags('(tag:1.2), ((nested:1.5)), [tag:1.3], {tag:1.4}', true)).toEqual([
        '(tag:1.2)',
        '((nested:1.5))',
        '[tag:1.3]',
        '{tag:1.4}',
      ]);
      expect(splitTags('(girl. solo), tag.', true)).toEqual(['(girl. solo)', 'tag.']);
    });

    it('should protect decimals between digits (RT-2)', () => {
      expect(splitTags('width 1.5 ratio. height 2.0 meter.', true)).toEqual([
        'width 1.5 ratio.',
        'height 2.0 meter.',
      ]);
    });

    it('should handle repeated delimiters without creating empty chips (RT-1)', () => {
      expect(splitTags('hello.... world,,  ..  ,, .  test.', true)).toEqual([
        'hello.',
        'world',
        'test.',
      ]);
    });

    it('should handle unbalanced parentheses safely without infinite loops or errors (RT-3)', () => {
      expect(() => splitTags('((tag:1.2. unfinished bracket', true)).not.toThrow();
      const result = splitTags('((tag:1.2. unfinished bracket', true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

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

    it('should parse period delimiters when isAnimaMode is true', () => {
      const result = parseToChips('1girl. solo. red dress.', true);
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('1girl.');
      expect(result[1].text).toBe('solo.');
      expect(result[2].text).toBe('red dress.');
    });
  });

  describe('chipsToString', () => {
    it('should join only enabled chips with comma and space in non-anima mode', () => {
      const chips = [
        { id: '1', text: 'apple', enabled: true },
        { id: '2', text: 'banana', enabled: false },
        { id: '3', text: 'cherry', enabled: true },
      ];
      expect(chipsToString(chips)).toBe('apple, cherry');
      expect(chipsToString(chips, false)).toBe('apple, cherry');
    });

    it('should join with space if previous chip ends with period in anima mode (AC-4, AC-5)', () => {
      const chips = [
        { id: '1', text: 'masterpiece', enabled: true },
        { id: '2', text: '1girl.', enabled: true },
        { id: '3', text: 'bad tag', enabled: false },
        { id: '4', text: 'red dress.', enabled: true },
      ];
      expect(chipsToString(chips, true)).toBe('masterpiece, 1girl. red dress.');
    });

    it('round-trips chip separators from an explicit period to a comma after period removal', () => {
      const dottedChips = [
        { id: '1', text: 'word.', enabled: true },
        { id: '2', text: 'next', enabled: true },
      ];
      const undottedChips = [
        { id: '1', text: 'word', enabled: true },
        { id: '2', text: 'next', enabled: true },
      ];

      expect(chipsToString(undottedChips, true)).toBe('word, next');
      expect(parseToChips(chipsToString(undottedChips, true), true).map((chip) => chip.text)).toEqual(['word', 'next']);
      expect(chipsToString(dottedChips, true)).toBe('word. next');
    });

    it('should return empty string if no chips are enabled (RT-4)', () => {
      const chips = [
        { id: '1', text: 'apple', enabled: false },
        { id: '2', text: 'banana', enabled: false },
      ];
      expect(chipsToString(chips)).toBe('');
      expect(chipsToString(chips, true)).toBe('');
      expect(chipsToString([], true)).toBe('');
    });
  });

  describe('parseTagWeight', () => {
    it('should parse SD weighted tag format (tag:weight)', () => {
      expect(parseTagWeight('(1girl:1.2)')).toEqual({
        baseText: '1girl',
        weight: 1.2,
      });
      expect(parseTagWeight(' (solo:0.8) ')).toEqual({
        baseText: 'solo',
        weight: 0.8,
      });
    });

    it('should return null weight for unweighted tags', () => {
      expect(parseTagWeight('1girl')).toEqual({
        baseText: '1girl',
        weight: null,
      });
      expect(parseTagWeight('(masterpiece)')).toEqual({
        baseText: '(masterpiece)',
        weight: null,
      });
    });

    it('should parse weighted tags with period outside or inside parentheses', () => {
      expect(parseTagWeight('(1girl:1.2).')).toEqual({
        baseText: '1girl.',
        weight: 1.2,
      });
      expect(parseTagWeight('(1girl.:1.2)')).toEqual({
        baseText: '1girl.',
        weight: 1.2,
      });
      expect(parseTagWeight('(1girl..:1.2)')).toEqual({
        baseText: '1girl.',
        weight: 1.2,
      });
    });
  });

  describe('formatTagWeight', () => {
    it('should format tag with weight when weight is not 1 or null', () => {
      expect(formatTagWeight('1girl', 1.2)).toBe('(1girl:1.2)');
      expect(formatTagWeight('solo', 0.8)).toBe('(solo:0.8)');
    });

    it('should return plain text when weight is 1.0 or null', () => {
      expect(formatTagWeight('1girl', 1.0)).toBe('1girl');
      expect(formatTagWeight('1girl', 1)).toBe('1girl');
      expect(formatTagWeight('1girl', null)).toBe('1girl');
    });

    it('should preserve only an explicitly entered trailing period in anima mode', () => {
      expect(formatTagWeight('1girl.', 1.2, true)).toBe('(1girl:1.2).');
      expect(formatTagWeight('1girl', 1.2, true)).toBe('(1girl:1.2)');
      expect(formatTagWeight('1girl.', 1.0, true)).toBe('1girl.');
      expect(formatTagWeight('1girl', 1.0, true)).toBe('1girl');
      expect(formatTagWeight('1girl.', null, true)).toBe('1girl.');
      expect(formatTagWeight('1girl', null, true)).toBe('1girl');
      expect(formatTagWeight('1girl...', 1.3, true)).toBe('(1girl:1.3).');
    });

    it('should keep a trailing period in anima mode and join with space in chipsToString (AC)', () => {
      const formatted = formatTagWeight('1girl.', 1.2, true);
      expect(formatted).toBe('(1girl:1.2).');

      const chips = [
        { id: '1', text: formatted, enabled: true },
        { id: '2', text: 'solo.', enabled: true },
      ];
      expect(chipsToString(chips, true)).toBe('(1girl:1.2). solo.');
    });

    it('should retain non-anima formatting compatibility', () => {
      expect(formatTagWeight('1girl', 1.3, false)).toBe('(1girl:1.3)');
      expect(formatTagWeight('1girl.', 1.3, false)).toBe('(1girl:1.3).');
      expect(formatTagWeight('1girl...', null, false)).toBe('1girl.');
    });
  });

  describe('adjustWeight', () => {
    it('should adjust weight with delta using default 1.0 base if null', () => {
      expect(adjustWeight(null, 0.1)).toBe(1.1);
      expect(adjustWeight(null, -0.1)).toBe(0.9);
    });

    it('should adjust existing weight with delta and round to 2 decimals', () => {
      expect(adjustWeight(1.2, 0.1)).toBe(1.3);
      expect(adjustWeight(1.2, -0.1)).toBe(1.1);
      expect(adjustWeight(0.05, -0.1)).toBe(0);
    });
  });

  describe('useChipParser hook', () => {
    it('should return all utility functions', () => {
      const hook = useChipParser();
      expect(typeof hook.parseToChips).toBe('function');
      expect(typeof hook.chipsToString).toBe('function');
      expect(typeof hook.splitTags).toBe('function');
      expect(typeof hook.parseTagWeight).toBe('function');
      expect(typeof hook.formatTagWeight).toBe('function');
      expect(typeof hook.adjustWeight).toBe('function');
    });
  });
});
