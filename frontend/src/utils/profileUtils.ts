export interface ParsedProfileName {
  baseName: string;
  separator: string;
  num: number | null;
}

/**
 * プロファイル名からベース名、区切り文字、末尾数値を解析する
 * （日本語/Unicode文字列、記号入りベース名にも完全対応）
 */
export function parseProfileName(name: string): ParsedProfileName {
  const trimmed = name.trim();
  const match = trimmed.match(/^(.*?)([\s_-]*)(\d+)$/);
  if (match) {
    const baseName = match[1].trim();
    if (!baseName) {
      return { baseName: trimmed, separator: ' ', num: null };
    }
    const separator = match[2] || '';
    const num = parseInt(match[3], 10);
    return { baseName, separator, num };
  }
  return { baseName: trimmed, separator: ' ', num: null };
}

/**
 * コピー元名称と既存プロファイル名一覧（string[]）から、次のプロファイル名を自動生成する
 */
export function generateNextProfileName(sourceName: string, existingNames: string[]): string {
  if (!sourceName || !sourceName.trim()) {
    return 'Set 1';
  }

  const { baseName, separator, num } = parseProfileName(sourceName);
  const sep = separator;

  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedBase}(?:[\\s_-]*(\\d+))?$`, 'i');

  let maxNum = num ?? 1;

  for (const name of existingNames) {
    const m = name.trim().match(pattern);
    if (m) {
      if (m[1]) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > maxNum) {
          maxNum = n;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${baseName}${sep}${nextNum}`;
}
