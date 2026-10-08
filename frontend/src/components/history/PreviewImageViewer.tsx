import React from 'react'
import { Info, Maximize2 } from 'lucide-react'

export interface PreviewImageViewerProps {
  activeImage: string
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
  return (
    <div
      className={`w-full flex items-center justify-center bg-black/40 relative cursor-pointer min-h-0 ${
        isFullscreen ? 'absolute inset-0 z-0 w-full h-full' : (viewMode === 'full' ? 'flex-1' : 'shrink-0 md:flex-1')
      }`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onContainerClick}
    >
      {showControls && currentIndex > 0 && (
        <button
          disabled={isEditing || isSaving}
          onClick={(e) => {
            e.stopPropagation()
            onChangeIndex(currentIndex - 1)
          }}
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
        onClick={onImageClick}
      />
      {showControls && currentIndex < totalImages - 1 && (
        <button
          disabled={isEditing || isSaving}
          onClick={(e) => {
            e.stopPropagation()
            onChangeIndex(currentIndex + 1)
          }}
          className="absolute right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
        >
          &gt;
        </button>
      )}

      {/* Carousel indicators */}
      {showControls && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/60 px-3 py-1 rounded-full text-xs text-white/80 pointer-events-none">
          {currentIndex + 1} / {totalImages}
        </div>
      )}

      {showControls && !isFullscreen && (
        viewMode === 'full' ? (
          <button
            disabled={isEditing || isSaving}
            onClick={(e) => {
              e.stopPropagation()
              onSetViewMode('info')
            }}
            className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
            aria-label="Show info"
          >
            <Info size={20} />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSetViewMode('full')
            }}
            className="absolute bottom-4 right-4 z-10 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
            aria-label="Hide info"
          >
            <Maximize2 size={20} />
          </button>
        )
      )}
    </div>
  )
})

PreviewImageViewer.displayName = 'PreviewImageViewer'
