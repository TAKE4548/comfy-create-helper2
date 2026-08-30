export type BubbleShapeType = 'oval' | 'rounded-rect' | 'burst' | 'cloud' | 'none'
export type TextOrientation = 'vertical' | 'horizontal'

export type ScaleCurveType = 'none' | 'linear' | 'ease-in' | 'ease-out' | 'bezier'
export type PathPresetType = 'none' | 'line' | 'arc' | 'wave' | 'stepped'
export type FillModeType = 'solid' | 'gradient' | 'hollow' | 'tone'
export type GradientType = 'linear' | 'radial'
export type TonePatternType = 'dots' | 'noise' | 'none'
export type StrokeLineJoin = 'round' | 'miter' | 'bevel'
export type StrokeLineStyle = 'solid' | 'dashed'

export interface PathPoint {
  x: number // 0.0 ~ 1.0 (吹き出し内相対X)
  y: number // 0.0 ~ 1.0 (吹き出し内相対Y)
}

export interface GradientStop {
  color: string
  offset: number // 0.0 ~ 1.0
}

export interface MultiStrokeLayer {
  id: string
  width: number // px (外側への追加太さ)
  color: string // rgba(r,g,b,a)
  opacity: number // 0.0 ~ 1.0
  offsetX: number // px (影・立体ずらし)
  offsetY: number // px
  lineJoin?: StrokeLineJoin // default: 'round'
  lineStyle?: StrokeLineStyle // default: 'solid'
  roughness?: number // 0 ~ 10 (かすれ・手描きジッター)
}

export interface MangaTextEffectConfig {
  // 1. タイポグラフィ変形 & 簡易回転（縦中横）
  rotate90Indices?: number[] // 縦書き時に90度回転させる文字インデックス配列（縦中横）
  letterSpacing?: number // 文字間ピクセル (px, default: 0)
  lineHeightRatio?: number // 行間倍率 (default: 1.15 for vertical, 1.25 for horizontal)
  shearAngle?: number // 傾斜・シアー角度 (度数法 -45 ~ 45, default: 0)

  // 2. ダイナミックスケール & 感情揺らぎ
  scaleCurve?: ScaleCurveType // default: 'none'
  scaleStart?: number // 開始文字倍率 (0.5 ~ 3.0, default: 1.0)
  scaleEnd?: number // 終了文字倍率 (0.5 ~ 3.0, default: 1.0)
  sizeJitter?: number // 文字サイズランダム揺らぎ (0 ~ 100%, default: 0)

  // 3. パス・軌道レイアウト（固定ハンドル方式: 2〜4制御点）
  pathPreset?: PathPresetType // default: 'none'
  pathPoints?: PathPoint[] // 軌道タイプに応じた2〜4個の制御点（相対座標）
  pathFollowRotation?: boolean // パス接線方向への文字回転追従 (default: false)
  pathSteppedCount?: number // 階段状ステップ数 (default: 3)
  baselineJitter?: number // 文字ベースラインのランダム上下左右ガタつき (0 ~ 20px, default: 0)

  // 4. カラー・塗り・テクスチャ
  fillMode?: FillModeType // default: 'solid'
  gradientType?: GradientType // default: 'linear'
  gradientAngle?: number // 線形グラデーション角度 (度数法 0 ~ 360, default: 0)
  gradientStops?: GradientStop[] // カラーストップ
  tonePattern?: TonePatternType // スクリーントーン風パターン (default: 'none')

  // 5. 多重フチ（多層アウトライン）
  multiStrokes?: MultiStrokeLayer[] // 外側フチ取りレイヤー配列
  strokeRoughness?: number // 全体のアウトラインラフネス (0 ~ 10, default: 0)
}

export const DEFAULT_MANGA_EFFECTS: MangaTextEffectConfig = {
  rotate90Indices: [],
  letterSpacing: 0,
  lineHeightRatio: 1.15,
  shearAngle: 0,
  scaleCurve: 'none',
  scaleStart: 1.0,
  scaleEnd: 1.0,
  sizeJitter: 0,
  pathPreset: 'none',
  pathPoints: [],
  pathFollowRotation: false,
  pathSteppedCount: 3,
  baselineJitter: 0,
  fillMode: 'solid',
  gradientType: 'linear',
  gradientAngle: 0,
  gradientStops: [
    { color: 'rgba(0, 0, 0, 1)', offset: 0 },
    { color: 'rgba(100, 100, 100, 1)', offset: 1 },
  ],
  tonePattern: 'none',
  multiStrokes: [],
  strokeRoughness: 0,
}

export interface BubbleTail {
  x: number // 元画像座標系での尻尾先端X
  y: number // 元画像座標系での尻尾先端Y
  baseAngle1?: number // 1点目の接点角度 (rad, -PI ~ PI)
  baseAngle2?: number // 2点目の接点角度 (rad, -PI ~ PI)
  baseAngleOffset?: number // (後方互換用) 旧・本体接点中心角度オフセット (rad, default: 0)
  baseSpreadRatio?: number // (後方互換用) 旧・接点幅倍率 (0.2 ~ 3.0, default: 1.0)
  isFineTuning?: boolean // 微調整モード有効フラグ (default: false)
}

export interface BubbleStyleConfig {
  shape: BubbleShapeType
  orientation: TextOrientation
  fontFamily: string
  fontSize?: number // 0 または未指定時は自動フィット
  textColor: string // rgba(r,g,b,a)
  backgroundColor: string // rgba(255, 255, 255, 0.95)
  borderColor: string // rgba(0, 0, 0, 1)
  borderWidth: number // px
  rotation?: number // 度数法 -180 ~ 180 (default: 0)
  effects?: MangaTextEffectConfig
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
  rotation: 0,
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
  if (bubble.rotation !== undefined) style.rotation = bubble.rotation
  if (bubble.effects !== undefined) style.effects = bubble.effects
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

export interface SpeechBubble extends BubbleStyleConfig {
  id: string
  x: number // 元画像座標系でのバウンディングボックスX
  y: number // 元画像座標系でのバウンディングボックスY
  w: number // 元画像座標系での幅
  h: number // 元画像座標系での高さ
  text: string
  tail?: BubbleTail
}
