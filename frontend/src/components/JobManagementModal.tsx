import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2, Play, Clock } from 'lucide-react'
import { useGenerationStore } from '../store/useGenerationStore'
import { generationApi } from '../api/domains/generation'
import type { CancelOperation, CancelResult, CancelScope } from '../api/domains/generation'
import { Modal } from './common/Modal'
import { selectReleasedJobs, selectUnconfirmedJobs } from '../utils/generationSelectors'

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
    generationSnapshot,
    fetchQueue,
    releaseUnconfirmed,
  } = useGenerationStore()
  const [bulkScope, setBulkScope] = useState<CancelScope>('all')
  const [busy, setBusy] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ mode: 'queued' | 'all'; scope: CancelScope } | null>(null)
  const [confirmationCounts, setConfirmationCounts] = useState<{ pending: number; running: number } | null>(null)
  const [runningConfirmation, setRunningConfirmation] = useState<string | null>(null)
  const [queuedReservation, setQueuedReservation] = useState<string | null>(null)
  const busyRef = useRef(false)
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // [FIX REQ-049] useMemo を早期リターンより前に移動（React Rules of Hooks 準拠）
  const visibleRunning = useMemo(
    () => queueRunning.filter((job: any) => !filterOwnSession || job[3]?.client_id === clientId),
    [queueRunning, filterOwnSession, clientId]
  )
  const visiblePending = useMemo(
    () => queuePending.filter((job: any) => !filterOwnSession || job[3]?.client_id === clientId),
    [queuePending, filterOwnSession, clientId]
  )
  const [releaseConfirmation, setReleaseConfirmation] = useState<string[] | null>(null)
  const sessionFilter = filterOwnSession ? clientId : null
  const unconfirmedJobs = useMemo(
    () => (generationSnapshot ? selectUnconfirmedJobs(generationSnapshot, sessionFilter) : []),
    [generationSnapshot, sessionFilter]
  )
  const releasedJobs = useMemo(
    () => (generationSnapshot ? selectReleasedJobs(generationSnapshot, sessionFilter, 10) : []),
    [generationSnapshot, sessionFilter]
  )


  const clearReservation = () => {
    if (cancelTimer.current !== null) clearTimeout(cancelTimer.current)
    cancelTimer.current = null
    setQueuedReservation(null)
  }

  const closeModal = () => {
    if (busyRef.current) return
    clearReservation()
    setConfirmation(null)
    setRunningConfirmation(null)
    setReleaseConfirmation(null)
    onClose()
  }

  useEffect(() => () => {
    if (cancelTimer.current !== null) clearTimeout(cancelTimer.current)
  }, [])

  useEffect(() => {
    if (!isOpen) clearReservation()
  }, [isOpen])

  if (!isOpen) return null

  const handleCancelJob = async (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRunningConfirmation(promptId)
  }

  const confirmRunningCancel = async (promptId: string) => {
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
      setRunningConfirmation(null)
    }
  }

  const cancelUnconfirmed = async (jobId: string) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setResultMessage(null)
    try {
      const result = await cancelJob(jobId)
      setResultMessage(result.outcome === 'cancelled'
        ? '取消を確認しました。'
        : `取消を確認できません（状態未確認のままです）: ${result.message}`)
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : '取消結果を確認できませんでした。')
    } finally { busyRef.current = false; setBusy(false) }
  }

  const confirmRelease = async () => {
    const ids = releaseConfirmation
    setReleaseConfirmation(null)
    if (!ids || ids.length === 0 || busyRef.current) return
    busyRef.current = true; setBusy(true); setResultMessage(null)
    try {
      const operation = await releaseUnconfirmed(ids)
      const released = operation.items.filter((item) => item.outcome === 'released' || item.outcome === 'already_released').length
      const notReleased = operation.items.length - released
      setResultMessage(`解除しました: ${released}件（上流の取消確認ではありません）` +
        (notReleased > 0 ? `／解除できなかった記録: ${notReleased}件（状態が更新されたか、状態未確認ではありません）` : ''))
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : '解除結果を確認できませんでした。')
    } finally { busyRef.current = false; setBusy(false) }
  }

  const reserveQueuedCancel = (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (busyRef.current) return
    if (cancelTimer.current !== null) clearTimeout(cancelTimer.current)
    setResultMessage(null)
    setQueuedReservation(promptId)
    cancelTimer.current = setTimeout(async () => {
      cancelTimer.current = null
      setQueuedReservation(null)
      busyRef.current = true
      setBusy(true)
      try {
        const result = await generationApi.cancelJob(promptId, false, true)
        if (result.outcome === 'cancelled' || result.outcome === 'already_terminal') {
          setResultMessage(`取消結果を確認しました: ${result.prompt_id || result.job_id || promptId}`)
        } else {
          setResultMessage(`取消できません: ${result.prompt_id || result.job_id || promptId}（${result.message}）`)
        }
        await fetchQueue()
      } catch (error) {
        setResultMessage(`取消できません: ${promptId}（${error instanceof Error ? error.message : '状態を確認できません'}）`)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    }, 3000)
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
    const affectedIds = operation.items.map((item) => item.prompt_id || item.job_id).filter(Boolean).join(', ')
    const hasUnconfirmed = operation.items.some((item) => item.outcome === 'unconfirmed')
    const releaseHint = hasUnconfirmed ? '。状態未確認の記録は「状態未確認の記録」欄から解除できます' : ''
    setResultMessage(`${operation.message || '一括取消の結果を確認してください。'}（確認済み: ${confirmedCount}件、未確認: ${unresolvedCount}件${affectedIds ? `、対象: ${affectedIds}` : ''}）${skippedReason}${releaseHint}`)
  }

  const requestBulkConfirmation = (mode: 'queued' | 'all') => {
    setConfirmation({ mode, scope: bulkScope })
    const countScope = (rows: any[]) => bulkScope === 'all' ? rows.length : rows.filter((row) =>
      generationSnapshot?.jobs.some((item) => item.prompt_id === row[1] && item.scope === 'normal')
    ).length
    setConfirmationCounts({ pending: countScope(queuePending), running: countScope(queueRunning) })
    setResultMessage(null)
  }

  const handleClearQueueOnly = async () => {
    const scope = confirmation?.scope
    if (!confirmation || confirmation.mode !== 'queued' || !scope) return
    setConfirmation(null)
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResultMessage(null)
    try {
      showOperationResult(await clearPendingQueue(scope))
    } catch (error) {
      setResultMessage(error instanceof Error ? error.message : 'キュー取消の結果を確認できませんでした。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const handleCancelAll = async () => {
    const scope = confirmation?.scope
    if (!confirmation || confirmation.mode !== 'all' || !scope) return
    setConfirmation(null)
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setResultMessage(null)
    try {
      showOperationResult(await cancelAllJobs(scope))
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
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      size="lg"
      ariaLabel="ジョブ管理"
      dialogClassName="p-0"
    >
      <div
        className="w-full min-w-0 min-h-0 flex flex-col"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault()
            closeModal()
          }
        }}
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
            type="button"
            aria-label="閉じる"
            id="close-job-management-modal-btn"
            disabled={busy}
            onClick={closeModal}
            className="min-h-11 min-w-11 flex items-center justify-center p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors"
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
                const metadata = generationSnapshot?.jobs.find((item) => item.prompt_id === promptId)
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
                      {metadata?.node && <div className="text-[10px] text-zinc-300">{metadata.node.name} · {metadata.node.value}/{metadata.node.max}</div>}
                      {(metadata?.set_name || metadata?.prompt_excerpt) && <div className="text-[10px] text-zinc-400">{metadata.set_name}{metadata.set_name && metadata.prompt_excerpt ? ' · ' : ''}{metadata.prompt_excerpt}</div>}
                    </div>
                    {runningConfirmation === promptId ? <div className="flex gap-1"><button type="button" onClick={() => confirmRunningCancel(promptId)} disabled={busy} className="min-h-11 px-2 text-[11px] text-red-300">実行中ジョブを中断する</button><button type="button" onClick={() => setRunningConfirmation(null)} className="min-h-11 px-2 text-[11px]">戻る</button></div> : <button onClick={(e) => handleCancelJob(promptId, e)} disabled={busy} className="min-h-11 min-w-11 p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all" title="中断（生成を停止）"><Trash2 size={14} /></button>}
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
                      {queuedReservation === promptId ? <div className="flex items-center gap-2"><span role="status" className="text-[11px] text-amber-300">取消予約（3秒後）</span><button type="button" onClick={clearReservation} className="min-h-11 px-2 text-[11px] text-accent-green">Undo</button></div> : <button
                        onClick={(e) => reserveQueuedCancel(promptId, e)}
                        disabled={busy}
                        className="min-h-11 min-w-11 p-1.5 rounded bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-[rgba(255,255,255,0.04)] hover:border-red-500/20 transition-all"
                        title="キューから削除"
                      >
                        <Trash2 size={13} />
                      </button>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Unconfirmed records: never labelled as 待機中 */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-350 mb-3 flex items-center gap-1.5">
              <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[11px] text-amber-300">状態未確認</span>
              状態未確認の記録 ({unconfirmedJobs.length})
            </h3>
            {unconfirmedJobs.length === 0 ? (
              <div className="bg-surface border border-[rgba(255,255,255,0.04)] rounded-lg p-4 text-center text-xs text-zinc-450 italic">状態未確認の記録はありません</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto overscroll-contain custom-scrollbar">
                {unconfirmedJobs.map((job) => (
                  <div key={job.job_id} data-testid="unconfirmed-job-row" className="flex min-w-0 flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">状態未確認</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">{job.prompt_id ?? job.job_id}</span>
                      </div>
                      <div className="break-words text-[11px] text-zinc-400 [overflow-wrap:anywhere]">{job.failure?.reason ?? '上流への投入結果を確認できません'}</div>
                      {(job.set_name || job.prompt_excerpt) && <div className="break-words text-[11px] text-zinc-400 [overflow-wrap:anywhere]">{job.set_name}{job.set_name && job.prompt_excerpt ? ' · ' : ''}{job.prompt_excerpt}</div>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" disabled={busy} onClick={() => cancelUnconfirmed(job.job_id)} className="min-h-11 min-w-11 touch-manipulation rounded-lg border border-[rgba(255,255,255,0.1)] px-2 text-[11px] text-zinc-200">取消を試行</button>
                      <button type="button" disabled={busy} onClick={() => setReleaseConfirmation([job.job_id])} className="min-h-11 min-w-11 touch-manipulation rounded-lg border border-amber-500/40 px-2 text-[11px] font-semibold text-amber-300">記録を解除</button>
                    </div>
                  </div>
                ))}
                <button type="button" disabled={busy} onClick={() => setReleaseConfirmation(unconfirmedJobs.map((job) => job.job_id))} className="min-h-11 w-full touch-manipulation rounded-lg border border-amber-500/40 text-[11px] font-semibold text-amber-300">状態未確認をすべて解除（{unconfirmedJobs.length}件）</button>
              </div>
            )}
            {releaseConfirmation && (
              <div role="dialog" aria-label="解除確認" className="mt-2 rounded border border-amber-500/30 p-2 text-[11px] text-zinc-200">
                <p>{releaseConfirmation.length}件の状態未確認の記録を解除します。解除は記録だけが対象で、ComfyUI側の取消ではありません。ComfyUI上の実行有無は確認しません。解除後は待機キューへ戻らず、自動で再送もしません。実行済みの可能性がある場合は履歴を確認してください。</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={confirmRelease} disabled={busy} className="min-h-11 touch-manipulation px-2 text-[11px] font-semibold text-amber-300">確認して解除</button>
                  <button type="button" onClick={() => setReleaseConfirmation(null)} className="min-h-11 touch-manipulation px-2 text-[11px]">戻る</button>
                </div>
              </div>
            )}
            {releasedJobs.length > 0 && (
              <details className="mt-3 text-[11px] text-zinc-400">
                <summary className="min-h-11 cursor-pointer py-2">解除済みの記録 ({releasedJobs.length})</summary>
                <ul className="space-y-1">
                  {releasedJobs.map((job) => (
                    <li key={job.job_id} className="min-w-0 break-words [overflow-wrap:anywhere]">
                      {job.prompt_id ?? job.job_id} · 解除済み（上流の取消確認ではありません） · {job.release?.released_at ?? ''}
                    </li>
                  ))}
                </ul>
              </details>
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
                onChange={(event) => { setBulkScope(event.target.value as CancelScope); setConfirmation(null); setConfirmationCounts(null) }}
                disabled={busy}
                className="min-h-11 w-full min-w-0 rounded bg-zinc-800 border border-zinc-700 px-2 py-2 sm:w-auto sm:py-1"
              >
                <option value="all">全生成（Studioを含む）</option>
                <option value="normal">通常生成のみ</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <button
                type="button"
                onClick={() => requestBulkConfirmation('queued')}
                disabled={busy}
                className="min-h-11 px-3.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                キューのみクリア
              </button>
              <button
                type="button"
                onClick={() => requestBulkConfirmation('all')}
                disabled={busy}
                className="min-h-11 px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Trash2 size={14} />
                すべて中断
              </button>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="min-h-11 px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-[rgba(255,255,255,0.08)] text-zinc-300 text-xs font-semibold transition-all"
              >
                閉じる
              </button>
            </div>
            {confirmation && <div role="dialog" aria-label="取消確認" className="rounded border border-amber-500/30 p-2 text-[11px] text-zinc-200">
              <p>{confirmation.scope === 'all' ? '全セッションの通常生成・Studio・未分類・外部キュー' : '全セッションの識別済み通常生成（Studio・未分類は保護）'}を対象にします。待機中 {confirmationCounts?.pending ?? 0} 件 / 実行中 {confirmation.mode === 'all' ? confirmationCounts?.running ?? 0 : 0} 件。{confirmation.mode === 'queued' ? '実行中は中断しません。' : '実行中も中断します。'}</p>
              <div className="mt-2 flex gap-2"><button type="button" onClick={confirmation.mode === 'queued' ? handleClearQueueOnly : handleCancelAll} disabled={busy} className="min-h-11 px-2 text-[11px] font-semibold text-amber-300">確認して{confirmation.mode === 'queued' ? 'キューのみクリア' : 'すべて中断'}</button><button type="button" onClick={() => setConfirmation(null)} className="min-h-11 px-2 text-[11px]">戻る</button></div>
            </div>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
