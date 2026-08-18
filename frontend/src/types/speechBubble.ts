export type BubbleShapeType = 'oval' | 'rounded-rect' | 'burst' | 'cloud' | 'none'
export type TextOrientation = 'vertical' | 'horizontal'

export interface BubbleTail {
  x: number // 元画像座標系での尻尾先端X
  y: number // 元画像座標系での尻尾先端Y
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
