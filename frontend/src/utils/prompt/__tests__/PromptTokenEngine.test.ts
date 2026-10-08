import { describe, it, expect } from 'vitest';
import { PromptTokenEngine } from '../PromptTokenEngine';
import { PromptToken } from '../types';

describe('PromptTokenEngine', () => {
  describe('tokenize (AC-1)', () => {
    it('should return empty array for empty, whitespace, or null/undefined input', () => {
      expect(PromptTokenEngine.tokenize('')).toEqual([]);
      expect(PromptTokenEngine.tokenize('   ')).toEqual([]);
      // @ts-expect-error test null/undefined safety
      expect(PromptTokenEngine.tokenize(null)).toEqual([]);
      // @ts-expect-error test null/undefined safety
      expect(PromptTokenEngine.tokenize(undefined)).toEqual([]);
    });

    it('should tokenize simple comma-separated tags', () => {
      const tokens = PromptTokenEngine.tokenize('1girl, solo, smile');
      expect(tokens).toHaveLength(3);
      expect(tokens[0]).toMatchObject({ text: '1girl', weight: 1.0, bracketDepth: 0, enabled: true });
      expect(tokens[1]).toMatchObject({ text: 'solo', weight: 1.0, bracketDepth: 0, enabled: true });
      expect(tokens[2]).toMatchObject({ text: 'smile', weight: 1.0, bracketDepth: 0, enabled: true });
    });

    it('should parse weighted syntax (tag:weight)', () => {
      const tokens = PromptTokenEngine.tokenize('(masterpiece:1.2), (score_9:0.8)');
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({ text: 'masterpiece', weight: 1.2, enabled: true });
      expect(tokens[1]).toMatchObject({ text: 'score_9', weight: 0.8, enabled: true });
    });

    it('should parse nested parentheses depth (((tag)))', () => {
      const tokens = PromptTokenEngine.tokenize('(((masterpiece))), ((detailed))');
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({ text: 'masterpiece', weight: 1.0, bracketDepth: 3 });
      expect(tokens[1]).toMatchObject({ text: 'detailed', weight: 1.0, bracketDepth: 2 });
    });

    it('should not split commas inside nested parentheses', () => {
      const tokens = PromptTokenEngine.tokenize('(tag1, tag2:1.2), tag3');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].text).toBe('tag1, tag2');
      expect(tokens[0].weight).toBe(1.2);
      expect(tokens[1].text).toBe('tag3');
    });
  });

  describe('serializeToComfyPrompt (AC-2)', () => {
    it('should return empty string for empty array', () => {
      expect(PromptTokenEngine.serializeToComfyPrompt([])).toBe('');
    });

    it('should serialize simple tokens with comma separation', () => {
      const tokens: PromptToken[] = [
        { raw: '1girl', text: '1girl', weight: 1.0, bracketDepth: 0, enabled: true },
        { raw: 'solo', text: 'solo', weight: 1.0, bracketDepth: 0, enabled: true },
      ];
      expect(PromptTokenEngine.serializeToComfyPrompt(tokens)).toBe('1girl, solo');
    });

    it('should omit disabled tokens', () => {
      const tokens: PromptToken[] = [
        { raw: '1girl', text: '1girl', weight: 1.0, bracketDepth: 0, enabled: true },
        { raw: 'bad_hands', text: 'bad_hands', weight: 1.0, bracketDepth: 0, enabled: false },
        { raw: 'smile', text: 'smile', weight: 1.0, bracketDepth: 0, enabled: true },
      ];
      expect(PromptTokenEngine.serializeToComfyPrompt(tokens)).toBe('1girl, smile');
    });

    it('should serialize weighted tokens and bracket nested tokens correctly', () => {
      const tokens: PromptToken[] = [
        { raw: '(masterpiece:1.2)', text: 'masterpiece', weight: 1.2, bracketDepth: 1, enabled: true },
        { raw: '((smile))', text: 'smile', weight: 1.0, bracketDepth: 2, enabled: true },
      ];
      expect(PromptTokenEngine.serializeToComfyPrompt(tokens)).toBe('(masterpiece:1.2), ((smile))');
    });
  });

  describe('decoupleTags (AC-3)', () => {
    it('should remove specified tags case-insensitively and trim spaces', () => {
      const tokens = PromptTokenEngine.tokenize('1girl, SOLO, white shirt, smile');
      const decoupled = PromptTokenEngine.decoupleTags(tokens, ['solo', ' White Shirt ']);
      expect(decoupled.map(t => t.text)).toEqual(['1girl', 'smile']);
    });

    it('should inject trigger tokens at prepend position by default', () => {
      const tokens = PromptTokenEngine.tokenize('1girl, smile');
      const decoupled = PromptTokenEngine.decoupleTags(tokens, [], 'cosplay_char, anime');
      expect(decoupled.map(t => t.text)).toEqual(['cosplay_char', 'anime', '1girl', 'smile']);
      expect(decoupled[0].category).toBe('trigger');
    });

    it('should inject trigger tokens at append position when specified', () => {
      const tokens = PromptTokenEngine.tokenize('1girl, smile');
      const decoupled = PromptTokenEngine.decoupleTags(tokens, [], 'bonus_tag', { position: 'append' });
      expect(decoupled.map(t => t.text)).toEqual(['1girl', 'smile', 'bonus_tag']);
    });
  });

  describe('adjustWeight', () => {
    it('should adjust weight and clamp at 0', () => {
      const token: PromptToken = { raw: 'tag', text: 'tag', weight: 1.0, bracketDepth: 0, enabled: true };
      const increased = PromptTokenEngine.adjustWeight(token, 0.1);
      expect(increased.weight).toBe(1.1);

      const decreased = PromptTokenEngine.adjustWeight(token, -1.5);
      expect(decreased.weight).toBe(0);
    });
  });

  describe('Red Team Boundary Tests (RT-1 to RT-3)', () => {
    it('RT-1: should safely skip consecutive commas and newlines', () => {
      const tokens = PromptTokenEngine.tokenize(',,, \n  ,,  tag1,,, tag2,  \n\n  ,,');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].text).toBe('tag1');
      expect(tokens[1].text).toBe('tag2');
    });

    it('RT-2: should gracefully fallback on malformed / unclosed brackets without throwing', () => {
      expect(() => {
        const tokens = PromptTokenEngine.tokenize('((tag:1.2, tag2, [unclosed');
        expect(tokens.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('RT-3: should reliably remove mixed-case tags', () => {
      const tokens = PromptTokenEngine.tokenize('WhItE ShIrT, 1girl');
      const decoupled = PromptTokenEngine.decoupleTags(tokens, ['white shirt']);
      expect(decoupled.map(t => t.text)).toEqual(['1girl']);
    });
  });
});
