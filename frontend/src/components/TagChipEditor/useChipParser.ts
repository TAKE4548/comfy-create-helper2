export type TagChip = {
  id: string;
  text: string;
  enabled: boolean;
};

/**
 * カンマ区切りの文字列をパースしてTagChipの配列に変換します。
 * 空文字は除外され、各チップにはランダムなユニークIDが付与されます。
 */
export const parseToChips = (text: string): TagChip[] => {
  if (!text) return [];
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => ({
      id: Math.random().toString(36).substring(2, 9),
      text: item,
      enabled: true,
    }));
};

/**
 * 有効な（enabled === true）チップのみを抽出し、カンマと半角スペースで連結した文字列を返します。
 */
export const chipsToString = (chips: TagChip[]): string => {
  return chips
    .filter((chip) => chip.enabled)
    .map((chip) => chip.text)
    .join(', ');
};

/**
 * カスタムフック形式でのエクスポート
 */
export const useChipParser = () => {
  return {
    parseToChips,
    chipsToString,
  };
};
