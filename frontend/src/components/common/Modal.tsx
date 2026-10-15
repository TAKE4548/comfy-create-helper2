import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

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
}

const DEFAULT_SHEET_MAX_HEIGHT_CLASS = 'max-h-[calc(100dvh-env(safe-area-inset-top))]'

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
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

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
        style={sheetMaxHeightValue ? ({ '--modal-sheet-max-height': sheetMaxHeightValue } as CSSProperties) : undefined}
        tabIndex={-1}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Escape' && closeOnEsc && !event.defaultPrevented) {
            // Keep nested popovers in control of their Escape event.
            event.stopPropagation()
          }
        }}
        className={`bg-surface-3 border border-[rgba(255,255,255,0.1)] rounded-t-2xl rounded-b-none md:rounded-2xl w-full ${sizeClass} ${maxHeightClass} md:max-h-[90dvh] lg:max-h-full flex flex-col shadow-2xl overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] md:pb-0 ${dialogClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden="true" data-testid="modal-sheet-handle" className="mx-auto mt-2 mb-1 h-1 w-10 flex-shrink-0 rounded-full bg-white/30 md:hidden" />
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
