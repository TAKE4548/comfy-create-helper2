export interface AspectRatioPreset {
  id: string
  label: string
  ratioStr: string // e.g. "3 / 4"
  numericRatio: number // width / height (e.g. 0.75)
}

export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: '1:1', label: '1:1 (正方形)', ratioStr: '1 / 1', numericRatio: 1 },
  { id: '3:4', label: '3:4 (縦長・標準)', ratioStr: '3 / 4', numericRatio: 3 / 4 },
  { id: '4:3', label: '4:3 (横長・標準)', ratioStr: '4 / 3', numericRatio: 4 / 3 },
  { id: '2:3', label: '2:3 (縦長・写真)', ratioStr: '2 / 3', numericRatio: 2 / 3 },
  { id: '3:2', label: '3:2 (横長・写真)', ratioStr: '3 / 2', numericRatio: 3 / 2 },
  { id: '9:16', label: '9:16 (縦長・スマホ)', ratioStr: '9 / 16', numericRatio: 9 / 16 },
  { id: '16:9', label: '16:9 (横長・ワイド)', ratioStr: '16 / 9', numericRatio: 16 / 9 },
  { id: 'custom', label: 'カスタム入力', ratioStr: '', numericRatio: 1 },
]

export const DEFAULT_ASPECT_RATIO_ID = '3:4'

export interface ParsedAspectRatio {
  presetId: string
  ratioStr: string
  numericRatio: number
}

export function parseAspectRatio(presetId: string, customRatio?: string): ParsedAspectRatio {
  if (presetId !== 'custom') {
    const found = ASPECT_RATIO_PRESETS.find((p) => p.id === presetId)
    if (found && found.id !== 'custom') {
      return {
        presetId: found.id,
        ratioStr: found.ratioStr,
        numericRatio: found.numericRatio,
      }
    }
  }

  // Handle custom ratio
  if (customRatio && customRatio.trim()) {
    const raw = customRatio.trim().replace(/\s+/g, '')
    // Match "W:H" or "W/H"
    const match = raw.match(/^(\d+(?:\.\d+)?)(?:[:/])(\d+(?:\.\d+)?)$/)
    if (match) {
      const w = parseFloat(match[1])
      const h = parseFloat(match[2])
      if (w > 0 && h > 0) {
        return {
          presetId: 'custom',
          ratioStr: `${w} / ${h}`,
          numericRatio: w / h,
        }
      }
    }
    // Match decimal number
    const dec = parseFloat(raw)
    if (!isNaN(dec) && dec > 0) {
      return {
        presetId: 'custom',
        ratioStr: `${dec} / 1`,
        numericRatio: dec,
      }
    }
  }

  // Fallback to default
  return {
    presetId: '3:4',
    ratioStr: '3 / 4',
    numericRatio: 3 / 4,
  }
}