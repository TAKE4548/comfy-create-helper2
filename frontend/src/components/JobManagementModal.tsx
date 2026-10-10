import React, { useMemo, useRef, useState } from 'react'
import { X, Trash2, Play, Clock } from 'lucide-react'
import { useGenerationStore } from '../store/useGenerationStore'
import type { CancelOperation, CancelResult, CancelScope } from '../api/domains/generation'

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
  const [bulkScope, setBulkScope] = useState<CancelScope>('all')
  const [busy, setBusy] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const busyRef = useRef(false)

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

  const handleCancelJob = async (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResultMessage(null)
    try {
      const result: CancelResult = await cancelJob(promptId)
      if (result.outcome !== 'cancelled' && result.outcome !== 'already_terminal') {
        setResultMessage(result.message || '選択したジョブの取消を確認できませんでした。')
      }
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : '選択したジョブの取消結果を確認できませんでした。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const hasConfirmedAllEffects = (operation: CancelOperation) => {
    const completedItems = operation.items.every((item) => item.outcome === 'cancelled' || item.outcome === 'already_terminal')
    const clearConfirmed = operation.upstream_clear === 'confirmed' || operation.upstream_clear === 'not_requested'
    const interruptConfirmed = operation.upstream_interrupt === 'confirmed' || operation.upstream_interrupt === 'not_requested'
    return completedItems && clearConfirmed && interruptConfirmed
  }

  const showOperationResult = (operation: CancelOperation) => {
    if (hasConfirmedAllEffects(operation)) {
      onClose()
      return
    }
    const confirmedCount = operation.items.filter((item) => item.outcome === 'cancelled' || item.outcome === 'already_terminal').length
    const unresolvedItems = operation.items.length - confirmedCount
    const unresolvedEffects = [operation.upstream_clear, operation.upstream_interrupt]
      .filter((outcome) => outcome !== 'confirmed' && outcome !== 'not_requested').length
    const unresolvedCount = unresolvedItems + unresolvedEffects
    const skippedReason = operation.upstream_interrupt === 'skipped'
      ? '。保護対象があるため通常実行中の取消を見送りました。全取消完了扱いではありません'
      : ''
    setResultMessage(`${operation.message || '一括取消の結果を確認してください。'}（確認済み: ${confirmedCount}件、未確認: ${unresolvedCount}件）${skippedReason}`)
  }

  const handleClearQueueOnly = async () => {
    const scopeDescription = bulkScope === 'all'
      ? '全セッションの通常生成・Studio・未分類および外部キュー'
      : '全セッションの識別済み通常生成のみ（Studio・未分類は保持）'
    if (!confirm(`待機中の${scopeDescription}をクリアしますか？\n※実行中の生成は中断しません。`)) return
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResultMessage(null)
    try {
      showOperationResult(await clearPendingQueue(bulkScope))
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : 'キュー取消の結果を確認できませんでした。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleCancelAll = async () => {
    const scopeDescription = bulkScope === 'all'
      ? '全セッションの通常生成・Studio・未分類・外部キューを削除し、実行中の生成も中断'
      : '全セッションの識別済み通常生成のみを取消（Studio・未分類は保持）'
    const protectionNote = bulkScope === 'normal'
      ? '\n※Studioまたは未分類の実行中・待機中ジョブを保護するため、通常生成の実行中取消を見送る場合があります。'
      : ''
    if (!confirm(`${scopeDescription}しますか？${protectionNote}`)) return
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResultMessage(null)
    try {
      showOperationResult(await cancelAllJobs(bulkScope))
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : '一括取消の結果を確認できませんでした。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const formatPromptId = (id: string) => {
    return id.substring(0, 8) + '...'
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="w-full min-w-0 max-w-2xl max-h-[calc(100dvh-1rem)] bg-surface-2 border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-y-auto flex flex-col lg:max-h-[85vh]"
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
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-surface-2">
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
                      disabled={busy}
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
                        disabled={busy}
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
        <div className="shrink-0 border-t border-[rgba(255,255,255,0.08)] bg-surface px-4 sm:px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-[10px] text-zinc-450">
            <p>{filterOwnSession ? '※ 自セッションのジョブのみを表示中' : '※ すべてのセッションのジョブを表示中'}</p>
            {resultMessage && <div role="status" className="mt-2 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] leading-relaxed text-amber-300">{resultMessage}</div>}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-[10px] text-zinc-300 sm:flex-row sm:items-center sm:gap-2">
              一括取消範囲
              <select
                aria-label="一括取消範囲"
                value={bulkScope}
                onChange={(event) => setBulkScope(event.target.value as CancelScope)}
                disabled={busy}
                className="w-full min-w-0 rounded bg-zinc-800 border border-zinc-700 px-2 py-2 sm:w-auto sm:py-1"
              >
                <option value="all">全生成（Studioを含む）</option>
                <option value="normal">通常生成のみ</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <button
                type="button"
                onClick={handleClearQueueOnly}
                disabled={busy}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                キューのみクリア
              </button>
              <button
                type="button"
                onClick={handleCancelAll}
                disabled={busy}
                className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                すべて中断
              </button>
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
    </div>
  )
}
