/**
 * useImageNavigation — handles keyboard arrow key navigation
 * between images in the thumbnail strip.
 */

import { useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'

export interface GenerateKeyboardShortcutOptions {
  onGenerate: () => void | Promise<unknown>
  onSave: () => void
  onOpenPreview: () => void
  hasSelectedImage: boolean
  modalOpen: boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable || target.getAttribute('contenteditable') === 'true'
}

function hasMountedModal(): boolean {
  return document.querySelector('.modal-backdrop, [role="dialog"]') !== null
}

export function useGenerateKeyboardShortcuts(options: GenerateKeyboardShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return
      const modalOpen = options.modalOpen || hasMountedModal()

      if (event.key === 'Enter' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        if (modalOpen) return
        event.preventDefault()
        void options.onGenerate()
        return
      }

      if (modalOpen || !options.hasSelectedImage || isEditableTarget(event.target)) return
      const focused = document.activeElement
      if (isEditableTarget(focused)) return
      const preview = focused instanceof Element
        ? focused.closest('[data-testid="generate-parallel-preview"]')
        : null
      if (!preview) return

      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        options.onSave()
      } else if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        event.stopPropagation()
        options.onOpenPreview()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [options])
}

export function useImageNavigation(displayImages: string[]) {
  const { selectedImg, setSelectedImg } = useGenerationStore()

  const handlePrevImg = () => {
    if (!displayImages || displayImages.length === 0) return
    const curIdx = displayImages.indexOf(selectedImg || '')
    if (curIdx > 0) {
      setSelectedImg(displayImages[curIdx - 1])
    }
  }

  const handleNextImg = () => {
    if (!displayImages || displayImages.length === 0) return
    const curIdx = displayImages.indexOf(selectedImg || '')
    if (curIdx !== -1 && curIdx < displayImages.length - 1) {
      setSelectedImg(displayImages[curIdx + 1])
    }
  }

  // Arrow key listener — disabled when focus is on an input/textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || hasMountedModal()) return
      const activeEl = document.activeElement
      if (isEditableTarget(e.target) || isEditableTarget(activeEl)) return
      if (e.key === 'ArrowLeft') handlePrevImg()
      else if (e.key === 'ArrowRight') handleNextImg()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImg, displayImages])

  return { handlePrevImg, handleNextImg }
}
