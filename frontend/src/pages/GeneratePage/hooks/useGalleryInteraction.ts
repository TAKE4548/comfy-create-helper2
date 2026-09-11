import type React from 'react'
import { useRef, useState, useCallback } from 'react'
import type { UseMultiSelectReturn } from '../../../hooks/useMultiSelect'

export interface UseGalleryInteractionOptions {
  isMobile?: boolean
  selectedImg: string | null
  setSelectedImg: (img: string | null) => void
  multiSelect: UseMultiSelectReturn<string>
  onOpenModalPreview?: (index: number) => void
  onLoadSnapshot?: (snapshotId: number) => void
}

export interface ThumbnailItemProps {
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
}

export interface UseGalleryInteractionReturn {
  handleThumbnailClick: (img: string, index: number, event: React.MouseEvent) => void
  getThumbnailItemProps: (img: string, index: number) => ThumbnailItemProps
  handleSnapshotClick: (snapshotId: number) => void
  hoverPreviewImg: string | null
  setHoverPreviewImg: (img: string | null) => void
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  handleWheelScroll: (e: React.WheelEvent<HTMLDivElement>) => void
}

export function useGalleryInteraction({
  isMobile = false,
  selectedImg: _selectedImg,
  setSelectedImg,
  multiSelect,
  onOpenModalPreview,
  onLoadSnapshot,
}: UseGalleryInteractionOptions): UseGalleryInteractionReturn {
  const [hoverPreviewImg, setHoverPreviewImg] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleThumbnailClick = useCallback(
    (img: string, index: number, event: React.MouseEvent) => {
      multiSelect.handleItemClick(img, event)
      if (
        !multiSelect.isMultiSelectMode &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        setSelectedImg(img)
        if (isMobile && onOpenModalPreview) {
          onOpenModalPreview(index)
        }
      }
    },
    [multiSelect, setSelectedImg, isMobile, onOpenModalPreview]
  )

  const getThumbnailItemProps = useCallback(
    (img: string, index: number): ThumbnailItemProps => {
      const longPressHandlers = multiSelect.getLongPressHandlers(img)
      return {
        onMouseDown: longPressHandlers.onMouseDown,
        onMouseUp: longPressHandlers.onMouseUp,
        onMouseLeave: longPressHandlers.onMouseLeave,
        onTouchStart: longPressHandlers.onTouchStart,
        onTouchEnd: longPressHandlers.onTouchEnd,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          if (longPressHandlers.onContextMenu) {
            longPressHandlers.onContextMenu(e)
          }
        },
        onClick: (e: React.MouseEvent) => handleThumbnailClick(img, index, e),
      }
    },
    [multiSelect, handleThumbnailClick]
  )

  const handleSnapshotClick = useCallback(
    (snapshotId: number) => {
      if (onLoadSnapshot) {
        onLoadSnapshot(snapshotId)
      }
    },
    [onLoadSnapshot]
  )

  const handleWheelScroll = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY
    }
  }, [])

  return {
    handleThumbnailClick,
    getThumbnailItemProps,
    handleSnapshotClick,
    hoverPreviewImg,
    setHoverPreviewImg,
    scrollContainerRef,
    handleWheelScroll,
  }
}
