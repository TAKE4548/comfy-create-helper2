import { generateChipId } from './idGenerator';

export interface ParsedTagWeight {
  baseText: string;
  weight: number | null;
}

export type TagChip = {
  id: string;
  text: string;
  enabled: boolean;
};

export interface UseChipParserReturn {
  parseToChips: (text: string, isAnimaMode?: boolean) => TagChip[];
  chipsToString: (chips: TagChip[], isAnimaMode?: boolean) => string;
  splitTags: (text: string, isAnimaMode?: boolean) => string[];
  parseTagWeight: (text: string) => ParsedTagWeight;
  formatTagWeight: (baseText: string, weight: number | null, isAnimaMode?: boolean) => string;
  adjustWeight: (currentWeight: number | null, delta: number) => number;
}

/**
 * テキストを指定のルールに従ってタグ文字列配列に分割します。
 * - 括弧深度 (), [], {} を管理し、深度1以上の場合はカンマやピリオドで分割しない。
 * - 深度0のとき、カンマは常に区切り（カンマ自体は除外）。
 * - 深度0のとき、isAnimaMode: true の場合はピリオドも区切りとする。
 *   ただし直前と直後が数字の場合は小数点として保護し分割しない。
 *   区切りとなったピリオドはトークン末尾に保持する。
 * - ピリオドやカンマ、空白のみの空トークンは除外する。
 */
export const splitTags = (text: string, isAnimaMode: boolean = false): string[] => {
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

    if (!inNest) {
      if (char === ',') {
        const trimmed = current.trim();
        if (trimmed.replace(/[.,\s]/g, '').length > 0) {
          tokens.push(trimmed);
        }
        current = '';
        continue;
      }

      if (isAnimaMode && char === '.') {
        const isPrevDigit = /\d$/.test(current);
        const nextChar = i + 1 < text.length ? text[i + 1] : '';
        const isNextDigit = /\d/.test(nextChar);

        if (isPrevDigit && isNextDigit) {
          // 小数点として保護
          current += char;
          continue;
        } else {
          // ピリオド区切り: トークン末尾にピリオドを保持
          current += '.';
          const trimmed = current.trim();
          if (trimmed.replace(/[.,\s]/g, '').length > 0) {
            tokens.push(trimmed);
          }
          current = '';
          continue;
        }
      }
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.replace(/[.,\s]/g, '').length > 0) {
    tokens.push(trimmed);
  }

  return tokens;
};

/**
 * 文字列をパースしてTagChipの配列に変換します。
 * 空文字は除外され、各チップにはランダムなユニークIDが付与されます。
 */
export const parseToChips = (text: string, isAnimaMode: boolean = false): TagChip[] => {
  if (!text) return [];
  const tags = splitTags(text, isAnimaMode);
  return tags.map((item) => ({
    id: generateChipId(),
    text: item,
    enabled: true,
  }));
};

/**
 * 有効な（enabled === true）チップのみを抽出し、文字列に連結します。
 * isAnimaMode が true の場合、直前のチップがピリオドで終わっていれば半角スペース、そうでなければカンマ空白で連結します。
 */
export const chipsToString = (chips: TagChip[], isAnimaMode: boolean = false): string => {
  const enabledChips = chips.filter((chip) => chip.enabled);
  if (enabledChips.length === 0) return '';

  if (!isAnimaMode) {
    return enabledChips.map((chip) => chip.text).join(', ');
  }

  let result = '';
  for (let i = 0; i < enabledChips.length; i++) {
    const text = enabledChips[i].text;
    if (i === 0) {
      result = text;
    } else {
      const prevText = enabledChips[i - 1].text;
      if (prevText.endsWith('.')) {
        result += ' ' + text;
      } else {
        result += ', ' + text;
      }
    }
  }

  return result;
};

/**
 * タグ文字列からベーステキストと強度を抽出します。
 * 例: "(1girl:1.2)" -> { baseText: "1girl", weight: 1.2 }
 * 例: "(1girl:1.2)." -> { baseText: "1girl.", weight: 1.2 }
 * 例: "1girl" -> { baseText: "1girl", weight: null }
 */
export function parseTagWeight(text: string): ParsedTagWeight {
  const trimmed = text.trim();
  const match = trimmed.match(/^\((.+):([0-9.]+)\)\.?$/);
  if (match) {
    const rawBase = match[1].trim();
    const weightNum = parseFloat(match[2]);
    if (!isNaN(weightNum)) {
      const hasPeriod = trimmed.endsWith('.') || rawBase.endsWith('.');
      const cleanBase = rawBase.replace(/\.+$/, '');
      const baseText = hasPeriod ? `${cleanBase}.` : cleanBase;
      return { baseText, weight: weightNum };
    }
  }
  return { baseText: trimmed, weight: null };
}

/**
 * ベーステキストと強度からSD形式のタグ文字列を整形します。
 * weightがnullまたは1.0の場合はベーステキストのみを返します。
 * baseText が明示的にピリオド終わりの場合に末尾ピリオドを維持します。
 */
export function formatTagWeight(
  baseText: string,
  weight: number | null,
  _isAnimaMode: boolean = false
): string {
  const trimmedBase = baseText.trim();
  const hasPeriod = trimmedBase.endsWith('.');
  const cleanBase = trimmedBase.replace(/\.+$/, '');

  if (weight === null || isNaN(weight) || weight === 1) {
    return hasPeriod ? `${cleanBase}.` : cleanBase;
  }
  const rounded = parseFloat(weight.toFixed(2));
  if (rounded === 1) {
    return hasPeriod ? `${cleanBase}.` : cleanBase;
  }
  return hasPeriod ? `(${cleanBase}:${rounded}).` : `(${cleanBase}:${rounded})`;
}

/**
 * 現在の強度に対してdeltaを加算・調整します（0未満にはならないよう保護）。
 */
export function adjustWeight(currentWeight: number | null, delta: number): number {
  const base = currentWeight ?? 1.0;
  const next = Math.max(0, base + delta);
  return parseFloat(next.toFixed(2));
}

/**
 * カスタムフック形式でのエクスポート
 */
export const useChipParser = (): UseChipParserReturn => {
  return {
    parseToChips,
    chipsToString,
    splitTags,
    parseTagWeight,
    formatTagWeight,
    adjustWeight,
  };
};
