import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Loader2, Info, Maximize2, Download, Play, Pause } from 'lucide-react'
import { snapshotsApi, albumsApi } from '../api/client'
import type { Snapshot } from '../api/types'
import { getMetadataView, resolveRecordedMetadata } from '../utils/promptRecord'
import { GenerationMetadataPanel } from './GenerationMetadataPanel'
import { SnapshotTagAssociationsPanel } from './SnapshotTagAssociationsPanel'

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

  const handleToggleFullscreen = (e: React.MouseEvent) => {
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
  }

  const handleClose = () => {
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
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!showControls) {
      e.stopPropagation()
      resetControlsTimeout()
      return
    }
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!showControls) {
      resetControlsTimeout()
      return
    }
    handleToggleFullscreen(e)
  }

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
      {/* Header with Close & Format Download Buttons */}
      {(showControls || viewMode === 'info') && (
        <div 
          className={`${isFullscreen ? 'absolute top-0 left-0 right-0 z-10' : 'relative'} h-12 flex items-center justify-between px-4 z-50`} 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            {activeSnapshotId ? (
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur rounded-lg px-2.5 py-1 border border-[rgba(255,255,255,0.1)] text-xs">
                <span className="text-zinc-400 font-medium text-[11px] flex items-center gap-1">
                  <Download size={12} /> DL:
                </span>
                <a
                  href={`/api/snapshots/${activeSnapshotId}/download?format=webp`}
                  download
                  className="px-2 py-0.5 rounded bg-surface-2 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors"
                >
                  WebP
                </a>
                <a
                  href={`/api/snapshots/${activeSnapshotId}/download?format=png`}
                  download
                  className="px-2 py-0.5 rounded bg-surface-2 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors"
                >
                  PNG
                </a>
                <a
                  href={`/api/snapshots/${activeSnapshotId}/download?format=jpeg`}
                  download
                  className="px-2 py-0.5 rounded bg-surface-2 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold transition-colors"
                >
                  JPEG
                </a>
              </div>
            ) : activeImage ? (
              <a
                href={activeImage}
                download
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-black/60 backdrop-blur border border-[rgba(255,255,255,0.1)] text-zinc-200 text-xs font-semibold hover:bg-black/80 transition-colors"
              >
                <Download size={12} /> Download
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {onToggleAutoFollow && (
              <button
                type="button"
                id="preview-autofollow-toggle-modal"
                disabled={isEditing || isSaving}
                onClick={onToggleAutoFollow}
                className={`p-2 rounded-lg transition-colors flex items-center justify-center ${
                  previewAutoFollow
                    ? 'bg-accent-green/10 border border-accent-green/40 hover:bg-accent-green/20 text-accent-green fill-accent-green'
                    : 'bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700/80 text-zinc-400 hover:text-white'
                }`}
                title={previewAutoFollow ? '最新画像を自動追従中（クリックで固定）' : '現在の画像に固定中（クリックで自動追従）'}
                aria-label={previewAutoFollow ? '最新画像を自動追従中（クリックで固定）' : '現在の画像に固定中（クリックで自動追従）'}
              >
                {previewAutoFollow ? <Play size={16} className="fill-accent-green" /> : <Pause size={16} />}
              </button>
            )}
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
              aria-label="Close preview"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Image Display Area */}
      <div className={`flex-1 min-h-0 ${viewMode === 'info' && !isFullscreen ? 'flex flex-col md:flex-row overflow-auto' : 'flex'}`}>
      <div
        className={`w-full flex items-center justify-center bg-black/40 relative cursor-pointer min-h-0 ${
          isFullscreen ? 'absolute inset-0 z-0 w-full h-full' : (viewMode === 'full' ? 'flex-1' : 'shrink-0 md:flex-1')
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleContainerClick}
      >
        {showControls && currentIndex > 0 && (
          <button
            disabled={isEditing || isSaving}
            onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex - 1) }}
            className="absolute left-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            &lt;
          </button>
        )}
        <img
          src={activeImage}
          alt={`Preview ${currentIndex + 1}`}
          className={`max-w-full object-contain select-none ${viewMode === 'info' && !isFullscreen ? 'max-h-[45vh] md:max-h-full' : 'max-h-full'} ${
            isFullscreen ? 'cursor-zoom-out w-full h-full' : 'cursor-zoom-in'
          }`}
          onClick={handleImageClick}
        />
        {showControls && currentIndex < images.length - 1 && (
          <button
            disabled={isEditing || isSaving}
            onClick={(e) => { e.stopPropagation(); onChangeIndex(currentIndex + 1) }}
            className="absolute right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
          >
            &gt;
          </button>
        )}

        {/* Carousel indicators */}
        {showControls && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 pointer-events-none">
            {currentIndex + 1} / {images.length}
          </div>
        )}

        {showControls && !isFullscreen && (
          viewMode === 'full' ? (
            <button
              disabled={isEditing || isSaving}
              onClick={(e) => { e.stopPropagation(); setViewMode('info') }}
              className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Show info"
            >
              <Info size={20} />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setViewMode('full') }}
              className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
              aria-label="Hide info"
            >
              <Maximize2 size={20} />
            </button>
          )
        )}
      </div>

      {/* Metadata Panel */}
      {viewMode === 'info' && !isFullscreen && (
        <div
          className="w-full md:w-[min(48%,640px)] shrink-0 overflow-y-auto p-5 bg-surface border-t md:border-l border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {(activeSnapshotId && isLoading) || isServerMetaLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-zinc-400 text-xs">
              <Loader2 size={16} className="animate-spin text-accent-green" />
              <span>Loading metadata...</span>
            </div>
          ) : (
            <div className="space-y-4 text-xs text-zinc-300">
              <GenerationMetadataPanel key={activeImage} imageUrl={activeImage} promptId={promptId ?? view.record?.prompt_id ?? null} {...view}
                header={{ workflowId: view.workflowId, workflowName: view.workflowName, queuedAt: view.queuedAt,
                  metadataSavedAt: activeSnapshotId ? null : recordedMetadata?.metadataSavedAt ?? null,
                  imageSavedAt: snapshot?.created_at ?? null,
                  albums: albums?.filter(a => a.items?.some(i => i.snapshot_id === activeSnapshotId)).map(a => a.name) ?? [] }}
                associationPanel={snapshot ? <SnapshotTagAssociationsPanel key={snapshot.id} snapshot={snapshot}
                  onPersisted={onPersisted} onEditingChange={onEditingChange} /> : <p>保存済み画像でタグ関連を編集できます。現在は読み取り専用です。</p>} />
              {snapshot && !view.record && <p>保存時の関連Workflow ID: {snapshot.workflow_id}</p>}
              {albumsError && <p role="alert">現在のアルバムを取得できませんでした。</p>}
            </div>
          )}
        </div>
      )}
      </div>

    </div>
  )
}
