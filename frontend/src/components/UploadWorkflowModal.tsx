import { useState, useEffect } from 'react'
import { X, ScanLine, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { workflowsApi, mappingMastersApi } from '../api/client'
import type { ScanResult, MappingMaster } from '../api/types'
import { useMasterMappingRows } from '../hooks/useMasterMappingRows'

type Phase = 'scanning' | 'editing' | 'saving' | 'done'

interface UploadWorkflowModalProps {
  initialName: string
  workflowJson: Record<string, unknown>
  onClose: () => void
  onSaved: (newWorkflowId: number) => void
}

function statusLabel(status: string): string {
  switch (status) {
    case 'not_found': return '未検出'
    case 'duplicated': return '複数候補'
    case 'class_type_mismatch': return 'クラス不一致'
    default: return status
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'not_found': return 'text-red-400 bg-red-500/10 border-red-500/20'
    case 'duplicated': return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    case 'class_type_mismatch': return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
    default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'
  }
}

export function UploadWorkflowModal({ initialName, workflowJson, onClose, onSaved }: UploadWorkflowModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [workflowName, setWorkflowName] = useState(initialName)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [customModes, setCustomModes] = useState<Record<number, boolean>>({})

  // Mapping masters for dropdowns
  const { data: masters = [] } = useQuery<MappingMaster[]>({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  const { buildRows, updateNodeId, initFromScan, getMappings } = useMasterMappingRows(masters, scanResult)

  const { mainRows, notFoundRows } = buildRows()

  // ── Scan on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setPhase('scanning')
    setScanError(null)

    workflowsApi.scan(workflowJson)
      .then((result) => {
        if (!cancelled) {
          const res = result as ScanResult
          setScanResult(res)
          initFromScan(res)
          setPhase('editing')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setScanError(err.message)
          setPhase('editing')
        }
      })

    return () => { cancelled = true }
  }, [workflowJson])

  // ── Save mutation ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const mappings = getMappings(mainRows, notFoundRows)
      const data = {
        name: workflowName.trim(),
        json_body: workflowJson,
        mappings
      }
      return workflowsApi.create(data) as Promise<{ id: number; name: string }>
    },
    onSuccess: (data) => {
      setPhase('done')
      onSaved(data.id)
      onClose()
    },
    onError: (err: unknown) => {
      const error = err as Error & { status?: number }
      const isConflict = error.status === 409 || 
                         error.message?.includes('409') || 
                         error.message?.includes('Conflict') || 
                         error.message?.toLowerCase().includes('already exists') ||
                         error.message?.includes('重複')

      if (isConflict) {
        setSaveError('すでに同名のワークフローが存在します')
      } else {
        setSaveError(error.message || '保存中にエラーが発生しました')
      }
      setPhase('editing')
    },
  })

  const handleConfirm = () => {
    if (!workflowName.trim()) return
    setSaveError(null)
    setPhase('saving')
    saveMutation.mutate()
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && phase !== 'saving') onClose()
  }

  const activeCount = [...mainRows, ...notFoundRows].filter(r => r.node_id.trim() !== '').length

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#141414] shadow-2xl overflow-hidden">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex items-center gap-2.5">
            <ScanLine size={16} className="text-accent-green" />
            <h2 className="text-sm font-semibold text-zinc-200">新規ワークフローの登録</h2>
            {phase === 'scanning' && (
              <Loader2 size={13} className="animate-spin text-zinc-400" />
            )}
          </div>
          <button
            id="upload-modal-close"
            onClick={onClose}
            disabled={phase === 'saving'}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">

          {/* Workflow Name Input */}
          {(phase === 'editing' || phase === 'saving') && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">ワークフロー名</label>
              <input
                id="upload-workflow-name-input"
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                disabled={phase === 'saving'}
                placeholder="ワークフロー名を入力してください"
                className="w-full text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded px-3 py-2 text-zinc-200 placeholder-zinc-650 focus:outline-none focus:border-accent-green/50 disabled:opacity-50"
              />
            </div>
          )}

          {/* Scan error */}
          {scanError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>スキャンエラー: {scanError}</span>
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>保存エラー: {saveError}</span>
            </div>
          )}

          {/* Scanning placeholder */}
          {phase === 'scanning' && !scanError && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">ワークフローをスキャン中…</p>
            </div>
          )}

          {/* Editing content */}
          {(phase === 'editing' || phase === 'saving') && !scanError && scanResult && (
            <>
              {/* ── Matched/Main Section ─────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-accent-green" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    スキャン結果 — マッチ・競合
                  </h3>
                </div>

                {mainRows.length === 0 && (
                  <p className="text-xs text-zinc-650 py-2 pl-1">マッチした役割はありません。</p>
                )}

                <div className="space-y-2">
                  {mainRows.map((row) => (
                    <div
                      key={row.master.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
                    >
                      {/* Role info */}
                      <div className="w-40 flex-shrink-0">
                        <p className="text-xs font-medium text-zinc-300">{row.master.display_name}</p>
                        <p className="text-[10px] font-mono text-zinc-600">{row.master.role}</p>
                      </div>

                      {/* Combobox logic (Select with candidates + manual input fallback) */}
                      <div className="flex-1 min-w-0 flex gap-2">
                        {row.candidates.length > 0 ? (
                          <>
                            <select
                              id={`node-select-${row.master.id}`}
                              value={
                                customModes[row.master.id]
                                  ? 'custom'
                                  : row.node_id === ''
                                  ? ''
                                  : row.candidates.includes(row.node_id)
                                  ? row.node_id
                                  : 'custom'
                              }
                              onChange={(e) => {
                                const val = e.target.value
                                if (val === 'custom') {
                                  setCustomModes(prev => ({ ...prev, [row.master.id]: true }))
                                  updateNodeId(row.master.id, '')
                                } else {
                                  setCustomModes(prev => ({ ...prev, [row.master.id]: false }))
                                  updateNodeId(row.master.id, val)
                                }
                              }}
                              disabled={phase === 'saving'}
                              className="text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-350 focus:outline-none focus:border-accent-green/40 disabled:opacity-50 min-w-[90px]"
                            >
                              {row.candidates.map((id) => (
                                <option key={id} value={id}>{id}</option>
                              ))}
                              <option value="">未指定</option>
                              <option value="custom">直接入力...</option>
                            </select>
                            {(customModes[row.master.id] || (row.node_id !== '' && !row.candidates.includes(row.node_id))) && (
                              <input
                                id={`node-input-custom-${row.master.id}`}
                                type="text"
                                value={row.node_id}
                                onChange={(e) => updateNodeId(row.master.id, e.target.value)}
                                disabled={phase === 'saving'}
                                placeholder="直接入力…"
                                className="flex-1 text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40 disabled:opacity-50"
                              />
                            )}
                          </>
                        ) : (
                          <input
                            id={`node-select-${row.master.id}`}
                            type="text"
                            value={row.node_id}
                            onChange={(e) => updateNodeId(row.master.id, e.target.value)}
                            disabled={phase === 'saving'}
                            placeholder="ノードIDを直接入力…"
                            className="w-full text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40 disabled:opacity-50"
                          />
                        )}
                      </div>

                      {/* Status label if not OK */}
                      {row.status !== 'ok' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${statusColor(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Unresolved Section (Not Found) ────────────── */}
              {notFoundRows.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[rgba(255,255,255,0.04)]">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400" />
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      未検出の役割
                    </h3>
                    <span className="text-[10px] text-zinc-600 ml-auto">{notFoundRows.length} 件</span>
                  </div>
                  <p className="text-[11px] text-zinc-650 leading-relaxed">
                    スキャンで候補が見つからなかった役割です。対応するノードIDを直接入力するか、空欄のまま保存するとこの役割のマッピングは作成されません。
                  </p>

                  <div className="space-y-2">
                    {notFoundRows.map((row) => (
                      <div
                        key={row.master.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
                      >
                        {/* Role info */}
                        <div className="w-40 flex-shrink-0">
                          <p className="text-xs font-medium text-zinc-300">{row.master.display_name}</p>
                          <p className="text-[10px] font-mono text-zinc-600">{row.master.role}</p>
                        </div>

                        {/* Combobox logic (Not found generally has no candidates) */}
                        <div className="flex-1 min-w-0">
                          <input
                            id={`node-select-${row.master.id}`}
                            value={row.node_id}
                            onChange={(e) => updateNodeId(row.master.id, e.target.value)}
                            disabled={phase === 'saving'}
                            placeholder="ノードIDを直接入力…"
                            className="w-full text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40 disabled:opacity-50"
                          />
                        </div>

                        {/* Status label (Always not_found here) */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${statusColor(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {(phase === 'editing' || phase === 'saving') && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.01)]">
            <p className="text-[11px] text-zinc-600">
              有効: <span className="text-zinc-400">{activeCount}</span> 件のマッピングを保存します
            </p>
            <div className="flex items-center gap-2">
              <button
                id="upload-cancel-btn"
                onClick={onClose}
                disabled={phase === 'saving'}
                className="px-4 py-2 rounded-lg text-zinc-400 text-sm hover:text-zinc-200 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                キャンセル
              </button>
              <button
                id="upload-confirm-btn"
                onClick={handleConfirm}
                disabled={phase === 'saving' || !workflowName.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-green text-background text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all glow-green"
              >
                {phase === 'saving' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    登録中…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    登録・保存
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
