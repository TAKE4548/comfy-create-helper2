import React, { useState, useRef, useEffect } from 'react'

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxHeight?: string // default: '85dvh'
  className?: string
  closeOnBackdropClick?: boolean
}

const SWIPE_THRESHOLD = 80

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeight = '85dvh',
  className = '',
  closeOnBackdropClick = true,
}) => {
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef<number | null>(null)
  const translateYRef = useRef<number>(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Reset state when sheet opens or closes
  useEffect(() => {
    if (isOpen) {
      setTranslateY(0)
      translateYRef.current = 0
      setIsDragging(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length > 0) {
      startYRef.current = e.touches[0].clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current === null || e.touches.length === 0) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - startYRef.current

    // Suppress upward dragging (deltaY < 0), allow downward dragging
    const clampedDeltaY = Math.max(0, deltaY)
    translateYRef.current = clampedDeltaY
    setTranslateY(clampedDeltaY)
  }

  const handleTouchEnd = () => {
    if (startYRef.current === null) return

    setIsDragging(false)
    if (translateYRef.current >= SWIPE_THRESHOLD) {
      onClose()
    }

    translateYRef.current = 0
    setTranslateY(0)
    startYRef.current = null
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="bottom-sheet-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end"
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        data-testid="bottom-sheet-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          maxHeight,
        }}
        className={`w-full bg-surface-3 rounded-t-2xl border-t border-white/10 flex flex-col overscroll-contain pb-[env(safe-area-inset-bottom)] ${className}`}
      >
        {/* Drag Handle */}
        <div
          data-testid="bottom-sheet-drag-handle"
          className="mx-auto my-2.5 h-1.5 w-12 rounded-full bg-zinc-600 flex-shrink-0 cursor-grab active:cursor-grabbing"
        />
        {title && (
          <div
            data-testid="bottom-sheet-title"
            className="px-4 py-2 text-sm font-bold text-white border-b border-white/5 flex-shrink-0"
          >
            {title}
          </div>
        )}
        <div
          data-testid="bottom-sheet-content"
          className="flex-1 overflow-y-auto px-4 py-3 min-h-0"
        >
          {children}
        </div>
        {footer && (
          <div
            data-testid="bottom-sheet-footer"
            className="sticky bottom-0 bg-surface-3 border-t border-white/10 p-3 flex-shrink-0"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
