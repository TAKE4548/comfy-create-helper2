import React, { useMemo } from 'react'
import { X, Trash2, Play, Clock } from 'lucide-react'
import { useGenerationStore } from '../store/useGenerationStore'

interface JobManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

export const JobManagementModal: React.FC<JobManagementModalProps> = ({ isOpen, onClose }) => {
  const {
    queueRunning,
    queuePending,
    clientId,
    filterOwnSession,
    cancelJob,
    clearPendingQueue,
    cancelAllJobs,
  } = useGenerationStore()

  // [FIX REQ-049] useMemo を早期リターンより前に移動（React Rules of Hooks 準拠）
  const visibleRunning = useMemo(
    () => queueRunning.filter((job: any) => !filterOwnSession || job[3]?.client_id === clientId),
    [queueRunning, filterOwnSession, clientId]
  )
  const visiblePending = useMemo(
    () => queuePending.filter((job: any) => !filterOwnSession || job[3]?.client_id === clientId),
    [queuePending, filterOwnSession, clientId]
  )

  if (!isOpen) return null

  const totalJobsCount = visibleRunning.length + visiblePending.length

  const handleCancelJob = async (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await cancelJob(promptId)
  }

  const handleClearQueueOnly = async () => {
    if (confirm(`待機中のキュー（${visiblePending.length}件）をクリアしますか？\n※現在生成中の1枚は中断せず最後まで生成されます。`)) {
      await clearPendingQueue()
      onClose()
    }
  }

  const handleCancelAll = async () => {
    if (confirm('実行中の生成を中断し、待機中のすべてのジョブを削除しますか？')) {
      await cancelAllJobs()
      onClose()
    }
  }

  const formatPromptId = (id: string) => {
    return id.substring(0, 8) + '...'
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-full lg:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-5 py-4 bg-surface">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#7C6FDD]/10 text-[#a99ef7]">
              <Clock size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-150">ジョブ管理</h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">ComfyUI 実行キューの監視とキャンセル</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-surface-2">
          {/* Active Job */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-350 mb-3 flex items-center gap-1.5">
              <Play size={12} className="text-accent-green fill-accent-green/20" />
              実行中のジョブ
            </h3>
            {visibleRunning.length === 0 ? (
              <div className="bg-surface border border-[rgba(255,255,255,0.04)] rounded-lg p-4 text-center text-xs text-zinc-450 italic">
                実行中のジョブはありません
              </div>
            ) : (
              visibleRunning.map((job) => {
                const promptId = job[1]
                const jobClientId = job[3]?.client_id
                const isOwn = jobClientId === clientId
                return (
                  <div 
                    key={promptId}
                    className="flex items-center justify-between bg-accent-green/5 border border-accent-green/20 rounded-lg p-3.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-accent-green">{formatPromptId(promptId)}</span>
                        {isOwn && (
                          <span className="text-[9px] font-semibold bg-accent-green/10 text-accent-green px-1.5 py-0.5 rounded-full border border-accent-green/20">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Client: {jobClientId || 'unknown'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleCancelJob(promptId, e)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all"
                      title="中断（生成を停止）"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Pending Jobs Queue */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-350 mb-3 flex items-center gap-1.5">
              <Clock size={12} className="text-[#a99ef7]" />
              待機中のキュー ({visiblePending.length})
            </h3>
            {visiblePending.length === 0 ? (
              <div className="bg-surface border border-[rgba(255,255,255,0.04)] rounded-lg p-4 text-center text-xs text-zinc-450 italic">
                待機中のジョブはありません
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                {visiblePending.map((job, index) => {
                  const promptId = job[1]
                  const jobClientId = job[3]?.client_id
                  const isOwn = jobClientId === clientId
                  return (
                    <div 
                      key={promptId}
                      className="flex items-center justify-between bg-surface border border-[rgba(255,255,255,0.06)] rounded-lg p-3 hover:border-[rgba(255,255,255,0.1)] transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium text-zinc-300">#{index + 1} {formatPromptId(promptId)}</span>
                          {isOwn && (
                            <span className="text-[9px] font-semibold bg-[#7C6FDD]/15 text-[#a99ef7] px-1.5 py-0.5 rounded-full border border-[#7C6FDD]/20">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-450 font-mono">
                          Client: {jobClientId || 'unknown'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleCancelJob(promptId, e)}
                        className="p-1.5 rounded bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-[rgba(255,255,255,0.04)] hover:border-red-500/20 transition-all"
                        title="キューから削除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[rgba(255,255,255,0.08)] bg-surface px-5 py-4 flex items-center justify-between">
          <div className="text-[10px] text-zinc-450">
            {filterOwnSession ? '※ 自セッションのジョブのみを表示中' : '※ すべてのセッションのジョブを表示中'}
          </div>
          <div className="flex gap-3">
            {visiblePending.length > 0 && (
              <button
                type="button"
                onClick={handleClearQueueOnly}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                キューのみクリア
              </button>
            )}
            {totalJobsCount > 0 && (
              <button
                type="button"
                onClick={handleCancelAll}
                className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                すべて中断
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.08)] text-zinc-300 text-xs font-semibold transition-all"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
