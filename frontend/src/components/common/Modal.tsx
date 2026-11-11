import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '4xl' | '5xl' | '7xl' | 'full'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  dialogClassName?: string
  size?: ModalSize
  closeOnBackdropClick?: boolean
  closeOnEsc?: boolean
  ariaLabel?: string
  /** Mobile bottom-sheet max-height utility class. Empty/undefined falls back to the default. */
  sheetMaxHeightClass?: string
  /** Optional opt-out for mobile swipe down to close gesture (e.g. forms with unsaved changes). Defaults to false. */
  disableSwipeToClose?: boolean
}

const DEFAULT_SHEET_MAX_HEIGHT_CLASS = 'max-h-[calc(100dvh-env(safe-area-inset-top))]'
const SWIPE_THRESHOLD = 80
const FLICK_VELOCITY = 0.5
const FLICK_MIN_DISTANCE = 30

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-full md:max-w-[min(90vw,36.25rem)] lg:max-w-[36.25rem]',
  md: 'max-w-full md:max-w-[min(90vw,40rem)] lg:max-w-[40rem]',
  lg: 'max-w-full md:max-w-[min(90vw,42.5rem)] lg:max-w-[42.5rem]',
  xl: 'max-w-full md:max-w-[min(90vw,42.5rem)] lg:max-w-[42.5rem]',
  '4xl': 'max-w-full md:max-w-[min(90vw,42.5rem)] lg:max-w-[42.5rem]',
  '5xl': 'max-w-full md:max-w-[min(90vw,42.5rem)] lg:max-w-[42.5rem]',
  '7xl': 'max-w-full md:max-w-[min(90vw,42.5rem)] lg:max-w-[42.5rem]',
  full: 'max-w-full',
}

let activeModalCount = 0
let originalOverflow: string | null = null

function lockBodyScroll() {
  if (typeof document === 'undefined') return
  if (activeModalCount === 0) {
    originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  activeModalCount += 1
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return
  activeModalCount = Math.max(0, activeModalCount - 1)
  if (activeModalCount === 0) {
    document.body.style.overflow = originalOverflow ?? ''
    originalOverflow = null
  }
}

export function Modal({
  isOpen,
  onClose,
  children,
  className = '',
  dialogClassName = '',
  size = '5xl',
  closeOnBackdropClick = true,
  closeOnEsc = true,
  ariaLabel = 'Dialog',
  sheetMaxHeightClass,
  disableSwipeToClose = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef<number | null>(null)
  const startXRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const canDragRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      setTranslateY(0)
      setIsDragging(false)
      canDragRef.current = false
      startYRef.current = null
      startXRef.current = null
    }
  }, [isOpen])

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (disableSwipeToClose) return
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return
    if (event.touches.length !== 1) return

    if (isScrolledDown(event.target as HTMLElement | null, dialogRef.current)) {
      canDragRef.current = false
      return
    }

    const touch = event.touches[0]
    startYRef.current = touch.clientY
    startXRef.current = touch.clientX
    startTimeRef.current = Date.now()
    canDragRef.current = true
    setIsDragging(true)
  }

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!canDragRef.current || startYRef.current === null || startXRef.current === null) return
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    const deltaY = touch.clientY - startYRef.current
    const deltaX = touch.clientX - startXRef.current

    // Horizontal swipe priority: cancel drag if horizontal movement is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
      canDragRef.current = false
      setIsDragging(false)
      setTranslateY(0)
      return
    }

    // Clamp upward drag to 0
    const currentTranslateY = Math.max(0, deltaY)
    setTranslateY(currentTranslateY)
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!canDragRef.current) {
      setIsDragging(false)
      setTranslateY(0)
      return
    }

    const touch = event.changedTouches?.[0]
    const currentY = touch ? touch.clientY : (startYRef.current ?? 0) + translateY
    const deltaY = startYRef.current !== null ? Math.max(0, currentY - startYRef.current) : translateY
    const elapsed = Math.max(1, Date.now() - startTimeRef.current)
    const velocity = deltaY / elapsed

    const shouldClose = deltaY >= SWIPE_THRESHOLD || (velocity > FLICK_VELOCITY && deltaY > FLICK_MIN_DISTANCE)

    canDragRef.current = false
    setIsDragging(false)
    setTranslateY(0)
    startYRef.current = null
    startXRef.current = null

    if (shouldClose) {
      onCloseRef.current()
    }
  }

  const handleTouchCancel = () => {
    canDragRef.current = false
    setIsDragging(false)
    setTranslateY(0)
    startYRef.current = null
    startXRef.current = null
  }

  useLayoutEffect(() => {
    if (!isOpen) return

    lockBodyScroll()
    return () => {
      unlockBodyScroll()
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusableElements = getFocusableElements(dialogRef.current)
    ;(focusableElements[0] ?? dialogRef.current)?.focus()

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (event.key === 'Escape' && closeOnEsc) {
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialogRef.current)
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (!first || !last) {
        event.preventDefault()
        dialogRef.current?.focus()
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEsc])

  if (!isOpen) return null

  const sizeClass = sizeClasses[size] || sizeClasses['5xl']
  const maxHeightClass = sheetMaxHeightClass || DEFAULT_SHEET_MAX_HEIGHT_CLASS
  const sheetMaxHeightValue = parseSheetMaxHeightValue(sheetMaxHeightClass)

  return (
    <div
      className={`modal-backdrop animate-fade-in items-end md:items-center p-0 md:p-4 overscroll-contain ${className}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && closeOnBackdropClick && !event.defaultPrevented) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-radius-exempt
        data-sheet-max-height={sheetMaxHeightValue ? '' : undefined}
        style={{
          ...(sheetMaxHeightValue ? ({ '--modal-sheet-max-height': sheetMaxHeightValue } as CSSProperties) : {}),
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
          transition: isDragging ? 'none' : translateY === 0 ? undefined : 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        tabIndex={-1}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Escape' && closeOnEsc && !event.defaultPrevented) {
            // Keep nested popovers in control of their Escape event.
            event.stopPropagation()
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className={`bg-surface-3 border border-[rgba(255,255,255,0.1)] rounded-t-2xl rounded-b-none md:rounded-2xl w-full ${sizeClass} ${maxHeightClass} md:max-h-[90dvh] lg:max-h-full flex flex-col shadow-2xl overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:pb-0 ${dialogClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" data-testid="modal-sheet-handle" className="mx-auto mt-2 mb-1 h-1 w-10 flex-shrink-0 rounded-full bg-white/30 md:hidden touch-none" />
        {children}
      </div>
    </div>
  )
}

/**
 * Extracts the value of an arbitrary-value `max-h-[...]` utility so the mobile sheet CSS can
 * apply it (the unlayered sheet rule in index.css otherwise beats the Tailwind utility).
 * Other class strings are not parsed and keep the default sheet max-height on mobile.
 */
function parseSheetMaxHeightValue(sheetMaxHeightClass?: string): string | null {
  const match = /^\s*max-h-\[([^\]\s]+)\]\s*$/.exec(sheetMaxHeightClass ?? '')
  return match ? match[1].replace(/_/g, ' ') : null
}

function getFocusableElements(dialog: HTMLDivElement | null): HTMLElement[] {
  if (!dialog) return []

  const selector = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
  return Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.matches(':disabled') || element.tabIndex < 0 || element.closest('[hidden], [aria-hidden="true"]')) return false

    let ancestor: HTMLElement | null = element
    while (ancestor && dialog.contains(ancestor)) {
      const style = window.getComputedStyle(ancestor)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      ancestor = ancestor.parentElement
    }

    return true
  })
}

function isScrolledDown(target: HTMLElement | null, boundary: HTMLElement | null): boolean {
  let el = target
  while (el && boundary && (boundary === el || boundary.contains(el))) {
    if (el.scrollTop > 0) return true
    if (el === boundary) break
    el = el.parentElement
  }
  return false
}
