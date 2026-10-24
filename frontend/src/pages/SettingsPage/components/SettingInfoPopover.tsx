import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsMobile } from '../hooks/useSettingsMobile'

const INFO_POPOVER_OPEN_EVENT = 'settings-info-popover-open'
const MANAGEMENT_MENU_OPEN_EVENT = 'settings-management-menu-open'

type SettingInfoPopoverProps = { label: string; children: ReactNode }
type PopoverPosition = { top: number; left: number; width: number; maxHeight: number }

function readViewport() {
  const viewport = window.visualViewport
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  }
}

function getPosition(trigger: HTMLElement): PopoverPosition {
  const rect = trigger.getBoundingClientRect()
  const viewport = readViewport()
  const width = Math.max(0, Math.min(320, viewport.width - 16))
  const maxHeight = Math.max(0, Math.min(320, viewport.height - 16))
  const left = Math.max(viewport.left + 8, Math.min(rect.left, viewport.left + viewport.width - width - 8))
  const below = rect.bottom + 8
  const top = below + maxHeight <= viewport.top + viewport.height - 8
    ? below
    : Math.max(viewport.top + 8, rect.top - maxHeight - 8)
  return { top, left, width, maxHeight }
}

export function SettingInfoPopover({ label, children }: SettingInfoPopoverProps): React.JSX.Element {
  const isMobile = useSettingsMobile()
  const generatedId = useId()
  const popoverId = `setting-info-${generatedId.replace(/:/g, '')}`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open || !isMobile || !triggerRef.current) return
    setPosition(getPosition(triggerRef.current))
    window.dispatchEvent(new CustomEvent(INFO_POPOVER_OPEN_EVENT, { detail: popoverId }))

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
      }
    }
    const handleScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Node && popoverRef.current?.contains(target)) return
      close()
    }
    const handleViewportChange = () => close()
    const handleOtherPopover = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== popoverId) close()
    }
    const handleManagementMenu = () => close()

    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)
    window.addEventListener(INFO_POPOVER_OPEN_EVENT, handleOtherPopover)
    window.addEventListener(MANAGEMENT_MENU_OPEN_EVENT, handleManagementMenu)

    const panel = triggerRef.current.closest('[role="tabpanel"]')
    const observer = panel ? new MutationObserver(() => {
      if (panel.hasAttribute('hidden')) close()
    }) : null
    observer?.observe(panel as Element, { attributes: true, attributeFilter: ['hidden'] })

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
      window.removeEventListener(INFO_POPOVER_OPEN_EVENT, handleOtherPopover)
      window.removeEventListener(MANAGEMENT_MENU_OPEN_EVENT, handleManagementMenu)
      observer?.disconnect()
    }
  }, [isMobile, open, popoverId])

  if (!isMobile) {
    return <span className="text-xs text-zinc-500">{children}</span>
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`説明: ${label}`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C6FDD] touch-manipulation"
      >
        <span aria-hidden="true" className="text-base">ⓘ</span>
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label={label}
          className="fixed z-[70] overflow-y-auto overscroll-contain rounded-lg border border-zinc-700 bg-[#18181b] p-3 text-sm text-[#f4f4f5] shadow-xl"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: `${position.width}px`,
            maxWidth: `${position.width}px`,
            maxHeight: `${position.maxHeight}px`,
            backgroundColor: '#18181b',
            color: '#f4f4f5',
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
