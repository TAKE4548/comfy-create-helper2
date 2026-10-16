export const HEADER_MENU_GAP_PX = 6
export const HEADER_MENU_EDGE_MARGIN_PX = 8
export const HEADER_MENU_MIN_HEIGHT_PX = 96
/** PageHeader ルート要素の目印。HeaderDropdown が anchor.closest() でヘッダー下端を取得する（T13 が属性を付与）。 */
export const PAGE_HEADER_ROOT_SELECTOR = '[data-page-header-root]'

export interface RectLike {
  top: number
  bottom: number
  left: number
  right: number
}

export type HeaderMenuAlign = 'start' | 'end'

export interface HeaderMenuPlacementInput {
  anchor: RectLike
  /** PageHeader ルートの bottom（ビューポート座標）。未指定・非有限（NaN/Infinity）は無視してトリガー基準へ縮退。 */
  headerBottom?: number
  /** Measured offsetWidth (px). Unmeasured = 0. */
  panelWidth: number
  /** visualViewport ?? window.inner* */
  viewport: { width: number; height: number }
  align: HeaderMenuAlign
}

export interface HeaderMenuPlacement {
  top: number
  left: number
  maxHeight: number
  shouldClose: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Pure placement computation for the header dropdown (DOM-independent).
 * Boundaries use strict inequalities so zero rects (jsdom) are not treated as offscreen.
 */
export function computeHeaderMenuPlacement(input: HeaderMenuPlacementInput): HeaderMenuPlacement {
  const { anchor, headerBottom, panelWidth, viewport, align } = input
  const EDGE = HEADER_MENU_EDGE_MARGIN_PX

  const refBottom =
    headerBottom !== undefined && Number.isFinite(headerBottom)
      ? Math.max(anchor.bottom, headerBottom)
      : anchor.bottom
  const top = refBottom + HEADER_MENU_GAP_PX
  const maxHeight = Math.max(0, viewport.height - top - EDGE)
  const offscreen =
    anchor.bottom < 0 ||
    anchor.top > viewport.height ||
    anchor.right < 0 ||
    anchor.left > viewport.width
  const shouldClose = offscreen || maxHeight < HEADER_MENU_MIN_HEIGHT_PX

  const width = Math.max(0, Math.min(panelWidth, viewport.width - 2 * EDGE))
  const rawLeft = align === 'end' ? anchor.right - width : anchor.left
  const left = clamp(rawLeft, EDGE, Math.max(EDGE, viewport.width - width - EDGE))

  return { top, left, maxHeight, shouldClose }
}
