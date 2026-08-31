import React, { useEffect, type ReactNode } from 'react'

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
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
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
}: ModalProps) {
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnEsc, onClose])

  if (!isOpen) return null

  const sizeClass = sizeClasses[size] || sizeClasses['5xl']

  return (
    <div
      className={`modal-backdrop animate-fade-in ${className}`}
      onClick={() => {
        if (closeOnBackdropClick) {
          onClose()
        }
      }}
    >
      <div
        className={`bg-[#121316] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full ${sizeClass} max-h-full flex flex-col shadow-2xl overflow-hidden ${dialogClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
