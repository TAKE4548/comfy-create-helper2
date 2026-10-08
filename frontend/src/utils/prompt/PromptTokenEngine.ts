import { PromptToken, DecoupleOptions } from './types';

/**
 * Split raw prompt text by comma or newline outside of nested brackets/parentheses.
 */
function splitPromptElements(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') parenDepth++;
    else if (char === ')' && parenDepth > 0) parenDepth--;
    else if (char === '[') bracketDepth++;
    else if (char === ']' && bracketDepth > 0) bracketDepth--;
    else if (char === '{') braceDepth++;
    else if (char === '}' && braceDepth > 0) braceDepth--;

    const inNest = parenDepth > 0 || bracketDepth > 0 || braceDepth > 0;
    if (!inNest && (char === ',' || char === '\n' || char === '\r')) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        tokens.push(trimmed);
      }
      current = '';
      continue;
    }
    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    tokens.push(trimmed);
  }
  return tokens;
}

/**
 * Parse a single token string into PromptToken structure.
 */
function parseSingleToken(rawToken: string): PromptToken {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return {
      raw: rawToken,
      text: '',
      weight: 1.0,
      bracketDepth: 0,
      enabled: true,
    };
  }

  // Check weighted syntax: (text:weight)
  const weightedMatch = trimmed.match(/^\(+([^:()]+):([0-9]+(?:\.[0-9]+)?)\)+$/);
  if (weightedMatch) {
    const innerText = weightedMatch[1].trim();
    const weightVal = parseFloat(weightedMatch[2]);
    let openCount = 0;
    while (openCount < trimmed.length && trimmed[openCount] === '(') {
      openCount++;
    }
    return {
      raw: trimmed,
      text: innerText,
      weight: isNaN(weightVal) ? 1.0 : Math.round(weightVal * 100) / 100,
      bracketDepth: openCount,
      enabled: true,
    };
  }

  // Check purely nested parentheses without colon weight: e.g. (((tag)))
  let openParens = 0;
  let closeParens = 0;
  let startIdx = 0;
  let endIdx = trimmed.length;

  while (startIdx < endIdx && trimmed[startIdx] === '(') {
    openParens++;
    startIdx++;
  }
  while (endIdx > startIdx && trimmed[endIdx - 1] === ')') {
    closeParens++;
    endIdx--;
  }

  const matchedParens = Math.min(openParens, closeParens);
  if (matchedParens > 0 && openParens === closeParens) {
    const inner = trimmed.slice(matchedParens, trimmed.length - matchedParens).trim();
    return {
      raw: trimmed,
      text: inner,
      weight: 1.0,
      bracketDepth: matchedParens,
      enabled: true,
    };
  }

  return {
    raw: trimmed,
    text: trimmed,
    weight: 1.0,
    bracketDepth: 0,
    enabled: true,
  };
}

export class PromptTokenEngine {
  /**
   * Tokenize raw prompt string into structured PromptTokens.
   */
  static tokenize(promptText: string | null | undefined): PromptToken[] {
    if (!promptText || typeof promptText !== 'string') {
      return [];
    }

    const elements = splitPromptElements(promptText);
    const result: PromptToken[] = [];

    for (const el of elements) {
      const cleanEl = el.replace(/^[\s,]+|[\s,]+$/g, '').trim();
      if (!cleanEl) continue;
      const token = parseSingleToken(cleanEl);
      if (token.text.length > 0) {
        result.push(token);
      }
    }

    return result;
  }

  /**
   * Serialize PromptTokens back to ComfyUI formatted prompt string.
   */
  static serializeToComfyPrompt(tokens: PromptToken[]): string {
    if (!tokens || tokens.length === 0) {
      return '';
    }

    const serializedParts: string[] = [];

    for (const token of tokens) {
      if (!token.enabled || !token.text.trim()) {
        continue;
      }

      const text = token.text.trim();
      if (token.weight !== 1.0) {
        serializedParts.push(`(${text}:${token.weight})`);
      } else if (token.bracketDepth > 0) {
        const open = '('.repeat(token.bracketDepth);
        const close = ')'.repeat(token.bracketDepth);
        serializedParts.push(`${open}${text}${close}`);
      } else {
        serializedParts.push(text);
      }
    }

    return serializedParts.join(', ');
  }

  /**
   * Decouple tags: remove specified tags (case/whitespace-insensitive) and inject triggers.
   */
  static decoupleTags(
    tokens: PromptToken[],
    removeTags: string[] = [],
    injectTrigger?: string | string[],
    options?: DecoupleOptions
  ): PromptToken[] {
    const removeSet = new Set(
      removeTags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
    );

    let result = tokens.filter(tok => {
      const normalized = tok.text.trim().toLowerCase();
      return !removeSet.has(normalized);
    });

    let triggers: string[] = [];
    if (typeof injectTrigger === 'string') {
      triggers = [injectTrigger];
    } else if (Array.isArray(injectTrigger)) {
      triggers = injectTrigger;
    }

    const injectedTokens: PromptToken[] = [];
    for (const trig of triggers) {
      const parsed = this.tokenize(trig);
      for (const t of parsed) {
        t.category = 'trigger';
        injectedTokens.push(t);
      }
    }

    if (injectedTokens.length > 0) {
      if (options?.position === 'append') {
        result = [...result, ...injectedTokens];
      } else {
        result = [...injectedTokens, ...result];
      }
    }

    return result;
  }

  /**
   * Adjust weight by delta (clamp at 0, rounded to 2 decimals).
   */
  static adjustWeight(token: PromptToken, delta: number): PromptToken {
    const newWeight = Math.max(0, Math.round((token.weight + delta) * 100) / 100);
    return {
      ...token,
      weight: newWeight,
    };
  }
}
