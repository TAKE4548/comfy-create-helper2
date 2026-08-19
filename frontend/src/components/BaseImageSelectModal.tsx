import React, { useState, useEffect } from 'react'
import { X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { snapshotsApi } from '../api/client'
import type { SnapshotSummary } from '../api/types'

export type CloseCallback = () => void
export type SelectSnapshotCallback = (snapshot: SnapshotSummary) => void

export interface BaseImageSelectModalProps {
  workflowId: number
  currentSnapshotId: number
  onClose: CloseCallback
  onSelect: SelectSnapshotCallback
}

export function BaseImageSelectModal({
  workflowId,
  currentSnapshotId,
  onClose,
  onSelect,
}: BaseImageSelectModalProps) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect(() => {
    setIsLoading(true)
    snapshotsApi.list({ workflow_id: workflowId })
      .then((data: SnapshotSummary[]) => {
        setSnapshots(data || [])
      })
      .catch((err: unknown) => {
        console.error('Failed to list snapshots:', err)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [workflowId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#18181C] border border-[rgba(255,255,255,0.08)] rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-accent-green" />
            <h3 className="text-base font-semibold text-white">生成履歴からベース画像を差し替え</h3>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-zinc-400 gap-2">
              <Loader2 className="animate-spin" size={24} />
              <span>生成履歴を読み込み中...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              利用可能なスナップショットが見つかりませんでした
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {snapshots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s)}
                  className={`group relative rounded-lg overflow-hidden border transition-all text-left aspect-square bg-zinc-900 flex flex-col ${
                    s.id === currentSnapshotId
                      ? 'border-accent-green ring-2 ring-accent-green/30'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <img
                    src={s.thumbnail_path || s.image_path || ''}
                    alt={`Snapshot ${s.id}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {s.id === currentSnapshotId && (
                    <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-accent-green text-black font-bold text-[9px]">
                      現在
                    </span>
                  )}
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-300 truncate">
                    #{s.id}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
