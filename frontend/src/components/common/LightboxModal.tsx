import React, { useEffect } from 'react'

export interface LightboxModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  ariaLabel?: string
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  isOpen,
  onClose,
  children,
  ariaLabel = 'Lightbox',
}) => {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center select-none"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 text-zinc-400 hover:text-white rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors cursor-pointer"
      >
        <span className="text-xl leading-none">✕</span>
      </button>
      <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export default LightboxModal
