import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi, albumsApi } from '../api/client'
import type { Snapshot } from '../api/types'
import { getMetadataView, resolveRecordedMetadata } from '../utils/promptRecord'
import { PreviewHeader } from './history/PreviewHeader'
import { PreviewImageViewer } from './history/PreviewImageViewer'
import { SnapshotMetadataTab } from './history/SnapshotMetadataTab'

// Fullscreen APIのTypeScript型拡張（Safari/iOS等の互換対応）
interface DocumentWithFullscreen extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface HTMLElementWithFullscreen extends HTMLDivElement {
  webkitRequestFullscreen?: () => void;
}

interface HistoryModalPreviewProps {
  isOpen: boolean
  onClose: () => void
  images: string[]
  currentIndex: number
  onChangeIndex: (index: number) => void
  snapshotIds?: (number | null)[]
  previewAutoFollow?: boolean
  onToggleAutoFollow?: () => void
}

export function HistoryModalPreview({
  isOpen,
  onClose,
  images,
  currentIndex,
  onChangeIndex,
  snapshotIds,
  previewAutoFollow = true,
  onToggleAutoFollow,
}: HistoryModalPreviewProps) {
  const [viewMode, setViewMode] = useState<'full' | 'info'>('full')
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [showControls, setShowControls] = useState<boolean>(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lockedTarget, setLockedTarget] = useState<{ image: string; snapshotId: number | null } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)
  const controlsTimeoutRef = useRef<any>(null)

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }, [])

  useEffect(() => {
    if (isOpen) {
      resetControlsTimeout()
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [isOpen, resetControlsTimeout])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if ((e.nativeEvent as any).pointerType === 'touch') return
    resetControlsTimeout()
  }, [resetControlsTimeout])

  const handleToggleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isEditing || isSaving) return
    const element = containerRef.current as HTMLElementWithFullscreen
    const doc = document as DocumentWithFullscreen
    if (!element) return

    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (element.requestFullscreen) {
        element.requestFullscreen()
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen()
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen()
      }
    }
  }, [isEditing, isSaving])

  const handleClose = useCallback(() => {
    if (isSaving) return
    const doc = document as DocumentWithFullscreen
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen()
      }
    } else {
      onClose()
    }
  }, [isSaving, onClose])

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!showControls) {
      e.stopPropagation()
      resetControlsTimeout()
      return
    }
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [showControls, resetControlsTimeout, handleClose])

  const handleImageClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!showControls) {
      resetControlsTimeout()
      return
    }
    handleToggleFullscreen(e)
  }, [showControls, resetControlsTimeout, handleToggleFullscreen])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as DocumentWithFullscreen
      const isCurrentlyFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement)
      setIsFullscreen(isCurrentlyFullscreen)

      // Bパターン: 全画面が解除されたことを検知した際、プレビューモーダルが開いている状態 (isOpen) ならば onClose() を呼び出す
      if (!isCurrentlyFullscreen && isOpen && !isSaving) {
        onClose()
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [isOpen, onClose, isSaving])

  const queryClient = useQueryClient()
  const activeSnapshotId = lockedTarget ? lockedTarget.snapshotId : snapshotIds?.[currentIndex] ?? null
  const activeImage = lockedTarget?.image ?? images[currentIndex]

  const promptId = useMemo(() => {
    if (!activeImage) return null
    try {
      const match = activeImage.match(/[?&]t=([^&]+)/)
      return match ? decodeURIComponent(match[1]) : null
    } catch {
      return null
    }
  }, [activeImage])

  const { data: recordedMetadata, isLoading: isServerMetaLoading } = useQuery({
    queryKey: ['prompt-metadata', promptId],
    queryFn: () => resolveRecordedMetadata(promptId),
    enabled: !!promptId && !activeSnapshotId && isOpen,
    staleTime: 1000 * 60 * 10,
  })

  // Fetch snapshot metadata if snapshot ID exists
  const { data: snapshot, isLoading } = useQuery<Snapshot>({
    queryKey: ['snapshot', activeSnapshotId],
    queryFn: () => snapshotsApi.get(activeSnapshotId!) as Promise<Snapshot>,
    enabled: !!activeSnapshotId && isOpen,
  })

  const effectiveParams = activeSnapshotId ? snapshot?.params ?? null : recordedMetadata?.paramValues ?? null
  const view = getMetadataView(effectiveParams)
  const { data: albums, isError: albumsError } = useQuery({
    queryKey: ['albums'], queryFn: () => albumsApi.list(), enabled: !!activeSnapshotId && isOpen,
  })
  const onEditingChange = useCallback((editing: boolean, saving: boolean) => {
    setIsEditing(editing); setIsSaving(saving)
    setLockedTarget(editing || saving ? { image: activeImage, snapshotId: activeSnapshotId } : null)
  }, [activeImage, activeSnapshotId])
  const onPersisted = useCallback((saved: Snapshot) => {
    queryClient.setQueryData(['snapshot', saved.id], saved)
    void queryClient.invalidateQueries({ queryKey: ['snapshots'] })
  }, [queryClient])

  useEffect(() => {
    setViewMode('full'); setIsEditing(false); setIsSaving(false); setLockedTarget(null)
  }, [isOpen])

  // キーボードイベント監視 (ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing || isSaving || (e.target instanceof HTMLElement && e.target.closest('input,select,textarea,[contenteditable="true"]'))) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        resetControlsTimeout()
        if (e.key === 'ArrowLeft') {
          if (currentIndex > 0) onChangeIndex(currentIndex - 1)
        } else if (e.key === 'ArrowRight') {
          if (currentIndex < images.length - 1) onChangeIndex(currentIndex + 1)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, images.length, onChangeIndex, resetControlsTimeout, isEditing, isSaving])

  if (!isOpen || images.length === 0) return null

  // Swipe gesture handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isEditing || isSaving) { touchStartX.current = null; return }
    if (touchStartX.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX.current - touchEndX

    if (diff > 50) {
      // Swipe left -> Next image
      if (currentIndex < images.length - 1) {
        onChangeIndex(currentIndex + 1)
      }
    } else if (diff < -50) {
      // Swipe right -> Prev image
      if (currentIndex > 0) {
        onChangeIndex(currentIndex - 1)
      }
    }
    touchStartX.current = null
  }

  return (
    <div
      ref={containerRef}
      className="modal-backdrop flex flex-col"
      onClick={handleContainerClick}
      onMouseMove={handleMouseMove}
    >
      <PreviewHeader
        showControls={showControls}
        viewMode={viewMode}
        isFullscreen={isFullscreen}
        activeSnapshotId={activeSnapshotId}
        activeImage={activeImage}
        onClose={handleClose}
        isSaving={isSaving}
        isEditing={isEditing}
        previewAutoFollow={previewAutoFollow}
        onToggleAutoFollow={onToggleAutoFollow}
      />

      <div className={`flex-1 min-h-0 ${viewMode === 'info' && !isFullscreen ? 'flex flex-col md:flex-row overflow-auto' : 'flex'}`}>
        <PreviewImageViewer
          activeImage={activeImage}
          currentIndex={currentIndex}
          totalImages={images.length}
          showControls={showControls}
          isFullscreen={isFullscreen}
          viewMode={viewMode}
          isEditing={isEditing}
          isSaving={isSaving}
          onChangeIndex={onChangeIndex}
          onImageClick={handleImageClick}
          onSetViewMode={setViewMode}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContainerClick={handleContainerClick}
        />

        {viewMode === 'info' && !isFullscreen && (
          <SnapshotMetadataTab
            activeImage={activeImage}
            activeSnapshotId={activeSnapshotId}
            promptId={promptId}
            isLoading={isLoading}
            isServerMetaLoading={isServerMetaLoading}
            view={view}
            recordedMetadata={recordedMetadata}
            snapshot={snapshot}
            albums={albums}
            albumsError={!!albumsError}
            onPersisted={onPersisted}
            onEditingChange={onEditingChange}
          />
        )}
      </div>
    </div>
  )
}

