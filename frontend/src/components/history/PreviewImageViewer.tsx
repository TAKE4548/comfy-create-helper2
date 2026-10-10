import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Info, Maximize2 } from 'lucide-react'

export interface PreviewImageViewerProps {
  activeImage: string
  images: string[]
  currentIndex: number
  totalImages: number
  showControls: boolean
  isFullscreen: boolean
  viewMode: 'full' | 'info'
  isEditing: boolean
  isSaving: boolean
  onChangeIndex: (index: number) => void
  onImageClick: (e: React.MouseEvent) => void
  onSetViewMode: (mode: 'full' | 'info') => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onContainerClick: (e: React.MouseEvent) => void
}

export const PreviewImageViewer: React.FC<PreviewImageViewerProps> = React.memo(({
  activeImage,
  images,
  currentIndex,
  totalImages,
  showControls,
  isFullscreen,
  viewMode,
  isEditing,
  isSaving,
  onChangeIndex,
  onImageClick,
  onSetViewMode,
  onTouchStart,
  onTouchEnd,
  onContainerClick,
}) => {
  const [zoom, setZoom] = useState<'fit' | '100' | '200'>('fit')
  const [comparison, setComparison] = useState(false)
  const [comparisonA, setComparisonA] = useState(currentIndex)
  const [comparisonB, setComparisonB] = useState(Math.min(currentIndex + 1, images.length - 1))
  const [boundary, setBoundary] = useState(50)
  const [showB, setShowB] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const didPan = useRef(false)

  useEffect(() => {
    const ignoreTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement && !!target.closest('input,select,textarea,button,[contenteditable="true"]')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !comparison || ignoreTarget(event.target)) return
      event.preventDefault()
      setShowB(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setShowB(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [comparison])

  const setZoomLevel = (level: 'fit' | '100' | '200') => {
    setZoom(level)
    setOffset({ x: 0, y: 0 })
  }
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoom === 'fit' || !(event.target instanceof HTMLImageElement)) return
    dragStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
    didPan.current = false
  }
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || zoom === 'fit') return
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y
    if (!didPan.current && Math.abs(dx) + Math.abs(dy) > 2) {
      didPan.current = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }
    setOffset({ x: dragStart.current.offsetX + dx, y: dragStart.current.offsetY + dy })
  }
  const endPan = () => { dragStart.current = null }
  const handleViewerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (didPan.current) {
      didPan.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onContainerClick(event)
  }
  const cancelPan = () => {
    dragStart.current = null
    didPan.current = false
  }
  const imageTransform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom === '200' ? 2 : 1})`

  const renderImage = (src: string, alt: string, extraStyle?: React.CSSProperties) => (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`object-contain select-none ${zoom === 'fit' ? 'max-w-full max-h-full' : 'max-w-none max-h-none'}`}
      style={{ transform: imageTransform, transformOrigin: 'center', ...extraStyle }}
      onClick={(event) => {
        if (didPan.current) { didPan.current = false; return }
        onImageClick(event)
      }}
    />
  )

  return (
    <div
      className={`w-full flex items-center justify-center bg-black/40 relative cursor-pointer min-h-0 overflow-hidden ${
        isFullscreen ? 'absolute inset-0 z-0 w-full h-full' : (viewMode === 'full' ? 'flex-1' : 'shrink-0 md:flex-1')
      }`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={handleViewerClick}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={cancelPan}
      style={{ touchAction: zoom === 'fit' ? 'pan-y' : 'none' }}
    >
      {showControls && currentIndex > 0 && (
        <button
          disabled={isEditing || isSaving}
          aria-label="前の画像"
          onClick={(event) => { event.stopPropagation(); onChangeIndex(currentIndex - 1) }}
          className="absolute left-4 z-20 min-h-11 min-w-11 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white"
        ><ChevronLeft size={20} aria-hidden="true" /></button>
      )}

      {comparison && images.length > 0 ? (
        <div
          className="relative w-full h-full flex items-center justify-center overflow-hidden"
          data-testid="image-comparison"
          style={{ width: '100%', height: '100%' }}
        >
          {renderImage(images[comparisonA] || activeImage, 'Comparison A')}
          <div data-testid="comparison-b-layer" className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ clipPath: `inset(0 ${showB ? 0 : 100 - boundary}% 0 0)` }}>
            {renderImage(images[comparisonB] || activeImage, 'Comparison B')}
          </div>
          <div aria-hidden="true" className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ left: showB ? '100%' : `${boundary}%` }} />
        </div>
      ) : renderImage(activeImage, `Preview ${currentIndex + 1}`, {
        maxHeight: viewMode === 'info' && !isFullscreen ? '45vh' : '100%',
        width: isFullscreen ? '100%' : undefined,
        height: isFullscreen ? '100%' : undefined,
      })}

      {showControls && currentIndex < totalImages - 1 && (
        <button
          disabled={isEditing || isSaving}
          aria-label="次の画像"
          onClick={(event) => { event.stopPropagation(); onChangeIndex(currentIndex + 1) }}
          className="absolute right-4 z-20 min-h-11 min-w-11 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white"
        ><ChevronRight size={20} aria-hidden="true" /></button>
      )}

      {showControls && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-1 rounded-lg bg-black/70 p-1">
          <button type="button" aria-label="Fit" onClick={(event) => { event.stopPropagation(); setZoomLevel('fit') }} className="min-h-11 px-3 text-xs text-white">Fit</button>
          <button type="button" aria-label="100%" onClick={(event) => { event.stopPropagation(); setZoomLevel('100') }} className="min-h-11 px-3 text-xs text-white">100%</button>
          <button type="button" aria-label="200%" onClick={(event) => { event.stopPropagation(); setZoomLevel('200') }} className="min-h-11 px-3 text-xs text-white">200%</button>
          <button type="button" aria-label="画像比較" aria-pressed={comparison} onClick={(event) => { event.stopPropagation(); setComparison((value) => !value) }} className="min-h-11 px-3 text-xs text-white">比較</button>
          {comparison && (
            <>
              <select aria-label="A画像" value={comparisonA} onChange={(event) => setComparisonA(Number(event.target.value))} className="min-h-11 max-w-28 bg-slate-900 text-xs text-white">
                {images.map((_, index) => <option key={index} value={index}>A: {index + 1}</option>)}
              </select>
              <select aria-label="B画像" value={comparisonB} onChange={(event) => setComparisonB(Number(event.target.value))} className="min-h-11 max-w-28 bg-slate-900 text-xs text-white">
                {images.map((_, index) => <option key={index} value={index}>B: {index + 1}</option>)}
              </select>
              <input aria-label="比較境界" type="range" min={0} max={100} value={boundary} onChange={(event) => setBoundary(Number(event.target.value))} className="w-24" />
            </>
          )}
        </div>
      )}

      {showControls && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 pointer-events-none">
          {currentIndex + 1} / {totalImages}
        </div>
      )}

      {showControls && !isFullscreen && (
        viewMode === 'full' ? (
          <button disabled={isEditing || isSaving} onClick={(event) => { event.stopPropagation(); onSetViewMode('info') }} className="absolute bottom-4 right-4 z-20 min-h-11 min-w-11 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white" aria-label="Show info"><Info size={20} /></button>
        ) : (
          <button onClick={(event) => { event.stopPropagation(); onSetViewMode('full') }} className="absolute bottom-4 right-4 z-20 min-h-11 min-w-11 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white" aria-label="Hide info"><Maximize2 size={20} /></button>
        )
      )}
    </div>
  )
})

PreviewImageViewer.displayName = 'PreviewImageViewer'
