/**
 * useImageNavigation — handles keyboard arrow key navigation
 * between images in the thumbnail strip.
 */

import { useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'

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
      const activeEl = document.activeElement
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase()
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ) {
          return
        }
      }
      if (e.key === 'ArrowLeft') handlePrevImg()
      else if (e.key === 'ArrowRight') handleNextImg()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImg, displayImages])

  return { handlePrevImg, handleNextImg }
}
