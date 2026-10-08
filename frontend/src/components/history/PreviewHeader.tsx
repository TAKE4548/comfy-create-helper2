import React from 'react'
import { Download, Play, Pause, X } from 'lucide-react'

export interface PreviewHeaderProps {
  showControls: boolean
  viewMode: 'full' | 'info'
  isFullscreen: boolean
  activeSnapshotId: number | null
  activeImage: string
  onClose: () => void
  isSaving: boolean
  isEditing: boolean
  previewAutoFollow?: boolean
  onToggleAutoFollow?: () => void
}

export const PreviewHeader: React.FC<PreviewHeaderProps> = React.memo(({
  showControls,
  viewMode,
  isFullscreen,
  activeSnapshotId,
  activeImage,
  onClose,
  isSaving,
  isEditing,
  previewAutoFollow,
  onToggleAutoFollow,
}) => {
  if (!showControls && viewMode !== 'info') {
    return null
  }

  return (
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
          onClick={onClose}
          disabled={isSaving}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
          aria-label="Close preview"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  )
})

PreviewHeader.displayName = 'PreviewHeader'
