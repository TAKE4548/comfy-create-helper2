import React from 'react'

export interface BenchmarkCell {
  axisId: 'decoupling' | 'bake_in' | 'pose' | 'angle'
  weight: 0.6 | 0.8 | 1.0
  imageUrl?: string
  status: 'PENDING' | 'PASS' | 'WARN' | 'FAIL'
  prompt: string
  seed?: number
}

export interface BenchmarkCellModalProps {
  cell: BenchmarkCell | null
  onClose: () => void
}

const AXIS_LABELS: Record<string, string> = {
  decoupling: '衣装分離 (Decoupling)',
  bake_in: '衣装再現 (Bake-in)',
  pose: 'ポーズ追従 (Pose)',
  angle: 'アングル追従 (Angle)',
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  PENDING: { label: '生成待機中', className: 'bg-zinc-700 text-zinc-300' },
  PASS: { label: 'PASS (合格)', className: 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/50' },
  WARN: { label: 'WARN (注意)', className: 'bg-amber-600/30 text-amber-400 border border-amber-500/50' },
  FAIL: { label: 'FAIL (破綻)', className: 'bg-rose-600/30 text-rose-400 border border-rose-500/50' },
}

export const BenchmarkCellModal: React.FC<BenchmarkCellModalProps> = ({ cell, onClose }) => {
  if (!cell) return null

  const statusInfo = STATUS_BADGES[cell.status] ?? STATUS_BADGES.PENDING

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="benchmark-cell-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-zinc-100 text-base">
              {AXIS_LABELS[cell.axisId] ?? cell.axisId}
            </h3>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              強度: {cell.weight}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.className}`}>
              {statusInfo.label}
            </span>
          </div>
          <button
            type="button"
            data-testid="modal-close-btn"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Image Display */}
          <div className="w-full flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-800/80 min-h-[300px] max-h-[440px] overflow-hidden">
            {cell.imageUrl ? (
              <img
                src={cell.imageUrl}
                alt={`${cell.axisId} - weight ${cell.weight}`}
                data-testid="modal-cell-image"
                className="max-h-[440px] w-auto object-contain"
              />
            ) : (
              <div className="text-zinc-500 text-sm flex flex-col items-center gap-2 py-16">
                <span>画像未生成</span>
                <span className="text-xs text-zinc-600">テスト実行後に表示されます</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-1">
                生成プロンプト
              </label>
              <div
                data-testid="modal-prompt-text"
                className="p-3 bg-zinc-950 rounded-lg text-xs font-mono text-zinc-300 border border-zinc-800/80 break-words select-all"
              >
                {cell.prompt}
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-zinc-400 pt-1">
              <div>
                <span className="text-zinc-500">LoRA強度: </span>
                <span className="font-mono text-zinc-200 font-semibold">{cell.weight}</span>
              </div>
              {cell.seed !== undefined && (
                <div>
                  <span className="text-zinc-500">シード: </span>
                  <span className="font-mono text-zinc-200 font-semibold">{cell.seed}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
