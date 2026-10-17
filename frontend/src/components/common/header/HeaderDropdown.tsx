import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AriaRole, ReactNode, RefObject } from 'react'
import {
  computeHeaderMenuPlacement,
  PAGE_HEADER_ROOT_SELECTOR,
  type HeaderMenuAlign,
  type RectLike,
} from './headerMenuPlacement'

export interface HeaderDropdownProps {
  open: boolean
  onClose: () => void
  /** Wrapper that contains the trigger. Used for inside-click detection and rect base. */
  anchorRef: RefObject<HTMLElement | null>
  align?: HeaderMenuAlign
  role?: AriaRole
  /** Visual classes only (width/background/border/padding/animation). No position, height or z-index. */
  className?: string
  /** hover 型用。トリガー下端〜パネル上端を埋める透明ブリッジを描画する */
  hoverBridge?: boolean
  closeOnEsc?: boolean
  'data-testid'?: string
  children: ReactNode
}

interface BridgeRect {
  left: number
  top: number
  width: number
  height: number
}

interface PanelPosition {
  top: number
  left: number
  maxHeight: number
  bridge: BridgeRect | null
}

function sameBridge(a: BridgeRect | null, b: BridgeRect | null): boolean {
  if (a === b) return true
  return !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

function samePosition(a: PanelPosition | null, b: PanelPosition): boolean {
  return !!a && a.top === b.top && a.left === b.left && a.maxHeight === b.maxHeight && sameBridge(a.bridge, b.bridge)
}

/** 水平・top はラッパー rect。bottom のみ「ラッパー」と「直接子要素（ヒットスロップ -m-2 等）」の最大（ケバブ根本原因 R3）。 */
function measureAnchor(el: HTMLElement): RectLike {
  const r = el.getBoundingClientRect()
  let bottom = r.bottom
  for (const child of Array.from(el.children)) bottom = Math.max(bottom, child.getBoundingClientRect().bottom)
  return { top: r.top, bottom, left: r.left, right: r.right }
}

/**
 * Controlled, trigger-agnostic header dropdown primitive.
 * Portals to document.body with position fixed, anchored below the trigger wrapper.
 */
export function HeaderDropdown({
  open,
  onClose,
  anchorRef,
  align = 'start',
  role,
  className = '',
  hoverBridge = false,
  closeOnEsc = true,
  'data-testid': testId,
  children,
}: HeaderDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bridgeRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [pos, setPos] = useState<PanelPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const measure = () => {
      const anchorEl = anchorRef.current
      const panel = panelRef.current
      if (!anchorEl || !panel) return
      const header = anchorEl.closest(PAGE_HEADER_ROOT_SELECTOR) // 毎回引き直す（sticky／再親子付けに強い）
      const anchor = measureAnchor(anchorEl)
      const panelWidth = panel.offsetWidth
      const vv = window.visualViewport
      const p = computeHeaderMenuPlacement({
        anchor,
        headerBottom: header?.getBoundingClientRect().bottom,
        panelWidth,
        align,
        viewport: { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight },
      })
      if (p.shouldClose) {
        onCloseRef.current()
        return
      }
      const bridge: BridgeRect | null =
        hoverBridge && panelWidth > 0
          ? {
              left: anchor.left,
              top: anchor.bottom,
              width: Math.max(0, anchor.right - anchor.left),
              height: Math.max(0, p.top - anchor.bottom) + 1,
            }
          : null
      const next: PanelPosition = { top: p.top, left: p.left, maxHeight: p.maxHeight, bridge }
      setPos((prev) => (samePosition(prev, next) ? prev : next))
    }
    measure()
    const headerEl = anchorRef.current?.closest(PAGE_HEADER_ROOT_SELECTOR) ?? null
    const ro = headerEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
    if (ro && headerEl) ro.observe(headerEl)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [open, align, anchorRef, hoverBridge])

  useEffect(() => {
    if (!open) return
    const onOutside = (e: Event) => {
      const t = e.target as Node | null
      if (
        !t ||
        panelRef.current?.contains(t) ||
        bridgeRef.current?.contains(t) ||
        anchorRef.current?.contains(t)
      )
        return
      onCloseRef.current()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onCloseRef.current()
      }
    }
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('mousedown', onOutside)
    if (closeOnEsc) {
      document.addEventListener('keydown', onKeyDown)
    }
    return () => {
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('mousedown', onOutside)
      if (closeOnEsc) {
        document.removeEventListener('keydown', onKeyDown)
      }
    }
  }, [open, anchorRef, closeOnEsc])

  if (!open) return null
  return createPortal(
    <>
      {pos?.bridge && (
        <div
          ref={bridgeRef}
          aria-hidden="true"
          data-header-menu-bridge=""
          data-testid={testId ? `${testId}-bridge` : undefined}
          className="z-[var(--z-header-menu)]"
          style={{
            position: 'fixed',
            top: pos.bridge.top,
            left: pos.bridge.left,
            width: pos.bridge.width,
            height: pos.bridge.height,
          }}
        />
      )}
      <div
        ref={panelRef}
        role={role}
        data-testid={testId}
        data-header-menu-panel=""
        data-placement="below-anchor"
        className={`overflow-y-auto overscroll-contain custom-scrollbar z-[var(--z-header-menu)] ${className}`}
        style={{
          position: 'fixed',
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          maxHeight: pos?.maxHeight,
          maxWidth: 'calc(100vw - 16px)',
          touchAction: 'pan-y',
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
