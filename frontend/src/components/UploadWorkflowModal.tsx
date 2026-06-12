import { useState, useEffect, useCallback } from 'react'
import { X, ScanLine, Loader2, Trash2, Plus, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { workflowsApi, mappingMastersApi } from '../api/client'
import type { ScanResult, ScanMatchedItem, ScanWarningItem, MappingMaster } from '../api/types'

// ─── Internal State Types ────────────────────────────────────────

interface EditableRow {
  node_id: string
  node_title: string
  master_id: number
  role: string
  _deleted: boolean
}

interface ManualRow {
  master_id: number
  role: string
  status: string
  node_id: string
  /** warnings が duplicated の場合の候補 node_ids */
  candidate_node_ids: string[]
}

type Phase = 'scanning' | 'editing' | 'saving' | 'done'

// ─── Props ───────────────────────────────────────────────────────

interface UploadWorkflowModalProps {
  initialName: string
  workflowJson: Record<string, unknown>
  onClose: () => void
  onSaved: (newWorkflowId: number) => void
}

// ─── Helpers ─────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────

export function UploadWorkflowModal({ initialName, workflowJson, onClose, onSaved }: UploadWorkflowModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [workflowName, setWorkflowName] = useState(initialName)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editableRows, setEditableRows] = useState<EditableRow[]>([])
  const [manualRows, setManualRows] = useState<ManualRow[]>([])

  // Mapping masters for dropdowns
  const { data: masters = [] } = useQuery<MappingMaster[]>({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  // ── Scan on mount ─────────────────────────────────────────────
  const buildRows = useCallback((result: ScanResult) => {
    const matched: EditableRow[] = result.matched.map((item: ScanMatchedItem) => ({
      node_id: item.node_id,
      node_title: item.node_title,
      master_id: item.master_id,
      role: item.role,
      _deleted: false,
    }))

    const warnings: ManualRow[] = result.warnings.map((item: ScanWarningItem) => ({
      master_id: item.master_id,
      role: item.role,
      status: item.status,
      node_id: item.node_id ?? (item.node_ids?.[0] ?? ''),
      candidate_node_ids: item.node_ids ?? [],
    }))

    setEditableRows(matched)
    setManualRows(warnings)
    setPhase('editing')
  }, [])

  useEffect(() => {
    let cancelled = false
    setPhase('scanning')
    setScanError(null)

    workflowsApi.scan(workflowJson)
      .then((result) => {
        if (!cancelled) buildRows(result as ScanResult)
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setScanError(err.message)
          setPhase('editing')
        }
      })

    return () => { cancelled = true }
  }, [workflowJson, buildRows])

  // ── Save mutation ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeMapped = editableRows
        .filter((r) => !r._deleted)
        .map((r) => ({ master_id: r.master_id, node_id: r.node_id }))

      const activeManual = manualRows
        .filter((r) => r.node_id.trim() !== '')
        .map((r) => ({ master_id: r.master_id, node_id: r.node_id.trim() }))

      const mappings = [...activeMapped, ...activeManual]
      
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

  // ── Editable row handlers ─────────────────────────────────────
  const updateRowMaster = (idx: number, masterId: number) => {
    const master = masters.find((m) => m.id === masterId)
    setEditableRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, master_id: masterId, role: master?.role ?? r.role } : r
      )
    )
  }

  const deleteRow = (idx: number) => {
    setEditableRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, _deleted: true } : r))
    )
  }

  const restoreRow = (idx: number) => {
    setEditableRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, _deleted: false } : r))
    )
  }

  // ── Manual row handlers ───────────────────────────────────────
  const updateManualNodeId = (idx: number, nodeId: string) => {
    setManualRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, node_id: nodeId } : r))
    )
  }

  // ── Background click ──────────────────────────────────────────
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && phase !== 'saving') onClose()
  }

  // ── Render ────────────────────────────────────────────────────
  const activeCount = editableRows.filter((r) => !r._deleted).length
  const manualFilledCount = manualRows.filter((r) => r.node_id.trim() !== '').length

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
          {(phase === 'editing' || phase === 'saving') && !phase.startsWith('scan') && (
            <>
              {/* ── Matched Section ─────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-accent-green" />
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    スキャン結果 — マッチ済み
                  </h3>
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {activeCount} / {editableRows.length} 件 有効
                  </span>
                </div>

                {editableRows.length === 0 && (
                  <p className="text-xs text-zinc-650 py-2 pl-1">マッチしたノードはありません。</p>
                )}

                <div className="space-y-2">
                  {editableRows.map((row, idx) => (
                    <div
                      key={`matched-${idx}`}
                      className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                        row._deleted
                          ? 'border-[rgba(255,255,255,0.04)] bg-surface-2/30 opacity-40'
                          : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]'
                      }`}
                    >
                      {/* Node info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono text-zinc-500">
                            ID: <span className="text-zinc-300">{row.node_id}</span>
                          </span>
                          {row.node_title && (
                            <span className="text-[10px] text-zinc-600 truncate">
                              ({row.node_title})
                            </span>
                          )}
                        </div>
                        {/* Role dropdown */}
                        <select
                          id={`upload-role-${idx}`}
                          value={row.master_id}
                          onChange={(e) => updateRowMaster(idx, Number(e.target.value))}
                          disabled={row._deleted || phase === 'saving'}
                          className="w-full text-xs bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-accent-green/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {masters.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.display_name} ({m.role})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Delete / Restore button */}
                      {row._deleted ? (
                        <button
                          id={`upload-restore-${idx}`}
                          onClick={() => restoreRow(idx)}
                          disabled={phase === 'saving'}
                          title="復元"
                          className="p-1.5 rounded text-zinc-500 hover:text-accent-green hover:bg-accent-green/10 transition-colors flex-shrink-0 disabled:opacity-40"
                        >
                          <Plus size={13} />
                        </button>
                      ) : (
                        <button
                          id={`upload-delete-${idx}`}
                          onClick={() => deleteRow(idx)}
                          disabled={phase === 'saving'}
                          title="このマッピングを除外"
                          className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Warnings Section ────────────────────────── */}
              {manualRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400" />
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      未解決の役割 — 手動指定
                    </h3>
                    <span className="text-[10px] text-zinc-600 ml-auto">
                      {manualFilledCount} / {manualRows.length} 件 入力済み
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-650 leading-relaxed">
                    スキャンで自動検出できなかった役割です。対応するノード ID を手動で入力してください。空欄のまま確定すると、その役割のマッピングは作成されません。
                  </p>

                  <div className="space-y-2">
                    {manualRows.map((row, idx) => (
                      <div
                        key={`warning-${idx}`}
                        className="flex items-center gap-2 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-zinc-300">{row.role}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor(row.status)}`}>
                              {statusLabel(row.status)}
                            </span>
                          </div>
                          {/* node_id input or select for duplicated */}
                          {row.status === 'duplicated' && row.candidate_node_ids.length > 0 ? (
                            <select
                              id={`upload-warning-select-${idx}`}
                              value={row.node_id}
                              onChange={(e) => updateManualNodeId(idx, e.target.value)}
                              disabled={phase === 'saving'}
                              className="w-full text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-amber-400/40 disabled:opacity-50"
                            >
                              <option value="">使用するノードIDを選択…</option>
                              {row.candidate_node_ids.map((nid) => (
                                <option key={nid} value={nid}>{nid}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              id={`upload-warning-input-${idx}`}
                              type="text"
                              value={row.node_id}
                              onChange={(e) => updateManualNodeId(idx, e.target.value)}
                              disabled={phase === 'saving'}
                              placeholder="ノード ID を入力（例: 42）"
                              className="w-full text-xs font-mono bg-surface border border-[rgba(255,255,255,0.08)] rounded px-2 py-1.5 text-zinc-300 placeholder-zinc-650 focus:outline-none focus:border-amber-400/40 disabled:opacity-50"
                            />
                          )}
                        </div>
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
              有効: <span className="text-zinc-400">{activeCount + manualFilledCount}</span> 件のマッピングを保存します
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
