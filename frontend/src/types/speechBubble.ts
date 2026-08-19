export type BubbleShapeType = 'oval' | 'rounded-rect' | 'burst' | 'cloud' | 'none'
export type TextOrientation = 'vertical' | 'horizontal'

export interface BubbleTail {
  x: number // 元画像座標系での尻尾先端X
  y: number // 元画像座標系での尻尾先端Y
}

export interface BubbleStyleConfig {
  shape: BubbleShapeType
  orientation: TextOrientation
  fontFamily: string
  fontSize?: number // 0 または未指定時は自動フィット
  textColor: string // rgba(r,g,b,a)
  backgroundColor: string // rgba(r,g,b,a)
  borderColor: string // rgba(r,g,b,a)
  borderWidth: number // px
}

export const DEFAULT_BUBBLE_STYLE: BubbleStyleConfig = {
  shape: 'oval',
  orientation: 'vertical',
  fontFamily: 'sans-serif',
  fontSize: 0,
  textColor: 'rgba(0, 0, 0, 1)',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderColor: 'rgba(0, 0, 0, 1)',
  borderWidth: 2,
}

export const DEFAULT_BUBBLE_BOUNDS = {
  w: 160,
  h: 140,
}

export const LAST_USED_STYLE_STORAGE_KEY = 'speech_bubble_last_used_style'

/**
 * 吹き出しオブジェクトから装飾スタイルプロパティのみを抽出する。
 * undefined のプロパティは除外し、明示的に設定された値のみを浅くマージする。
 */
export function extractBubbleStyle(bubble: Partial<SpeechBubble>): Partial<BubbleStyleConfig> {
  const style: Partial<BubbleStyleConfig> = {}
  if (bubble.shape !== undefined) style.shape = bubble.shape
  if (bubble.orientation !== undefined) style.orientation = bubble.orientation
  if (bubble.fontFamily !== undefined) style.fontFamily = bubble.fontFamily
  if (bubble.fontSize !== undefined) style.fontSize = bubble.fontSize
  if (bubble.textColor !== undefined) style.textColor = bubble.textColor
  if (bubble.backgroundColor !== undefined) style.backgroundColor = bubble.backgroundColor
  if (bubble.borderColor !== undefined) style.borderColor = bubble.borderColor
  if (bubble.borderWidth !== undefined) style.borderWidth = bubble.borderWidth
  return style
}

/**
 * localStorage から直前に保存された装飾スタイル設定を読み込む。
 * SSR環境、localStorage無効、JSONパースエラー等の例外時は DEFAULT_BUBBLE_STYLE を安全に返す。
 */
export function loadLastUsedBubbleStyle(): BubbleStyleConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_BUBBLE_STYLE
  }
  try {
    const saved = localStorage.getItem(LAST_USED_STYLE_STORAGE_KEY)
    if (!saved) return DEFAULT_BUBBLE_STYLE
    const parsed = JSON.parse(saved)
    return {
      ...DEFAULT_BUBBLE_STYLE,
      ...extractBubbleStyle(parsed),
    }
  } catch {
    return DEFAULT_BUBBLE_STYLE
  }
}

/**
 * 現在の装飾スタイル設定を localStorage に保存する。
 * 既存の設定に対して渡されたスタイルをマージして永続化する。
 * QuotaExceededError や SecurityError など発生時はエラーを握り潰し安全に終了する。
 */
export function saveLastUsedBubbleStyle(style: Partial<BubbleStyleConfig>): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const current = loadLastUsedBubbleStyle()
    const merged = { ...current, ...extractBubbleStyle(style) }
    localStorage.setItem(LAST_USED_STYLE_STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // QuotaExceededError やプライベートモードでの保存エラーは無視
  }
}

export interface SpeechBubble {
  id: string
  x: number // 元画像座標系でのバウンディングボックスX
  y: number // 元画像座標系でのバウンディングボックスY
  w: number // 元画像座標系での幅
  h: number // 元画像座標系での高さ
  text: string
  shape: BubbleShapeType
  orientation: TextOrientation
  fontFamily: string
  fontSize?: number // 0 または未指定時は自動フィット
  textColor: string // rgba(r,g,b,a)
  backgroundColor: string // rgba(r,g,b,a)
  borderColor: string // rgba(r,g,b,a)
  borderWidth: number // px
  tail?: BubbleTail
}
