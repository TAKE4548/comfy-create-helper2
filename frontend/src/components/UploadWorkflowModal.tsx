import { useState, useEffect, useMemo, useRef } from 'react'
import { X, ScanLine, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { workflowsApi, mappingMastersApi } from '../api/client'
import type { ScanResult, MappingMaster, MappingMasterV2 } from '../api/types'
import { useMasterMappingRows } from '../hooks/useMasterMappingRows'
import { rankWorkflowNodeCandidates } from '../utils/workflowNodeUtils'
import { WorkflowMappingEditor, type EditableSlot } from './WorkflowMappingEditor'

type Phase = 'scanning' | 'editing' | 'saving' | 'done'

interface UploadWorkflowModalProps {
  initialName: string
  workflowJson: Record<string, unknown>
  onClose: () => void
  onSaved: (newWorkflowId: number) => void
}

export function UploadWorkflowModal({ initialName, workflowJson, onClose, onSaved }: UploadWorkflowModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [workflowName, setWorkflowName] = useState(initialName)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  // Mapping masters for dropdowns
  const { data: masters = [], isFetched: mastersFetched } = useQuery<(MappingMaster | MappingMasterV2)[]>({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<(MappingMaster | MappingMasterV2)[]>,
  })

  const { buildRows, updateSlotNodeId, setSlotEnabled, setStageEnabled, initFromScan, getMappings, mappingSlotStates } = useMasterMappingRows(masters, scanResult, { workflowJson })

  const { rows } = buildRows()
  const initializedSession = useRef(false)
  const saveInFlight = useRef(false)
  const candidateCache = useMemo(() => {
    const stages = masters.flatMap(master => 'variants' in master ? master.variants.map(v => v.stage_name) : [])
    const cache = new Map<string, ReturnType<typeof rankWorkflowNodeCandidates>>()
    for (const master of masters) {
      const v2 = 'base_key' in master ? master : undefined
      const variants = v2?.variants ?? []
      const definition = {
        expectedClassTypes: master.expected_class_types ?? [],
        titlePatterns: [...(v2?.base_title_patterns ?? master.title_patterns ?? []), ...variants.flatMap(v => v.extra_title_patterns ?? [])],
        paramNames: [master.param_name, ...(v2?.fallback_param_names ?? [])].filter((value): value is string => Boolean(value)),
      }
      const activeVariants = variants.filter(v => v.is_enabled !== false)
      const slots = activeVariants.length ? activeVariants.map(v => ({ key: `v_${v.id}`, stage: v.stage_name || 'Main' })) : [{ key: `m_${master.id}`, stage: 'Main' }]
      for (const slot of slots) cache.set(slot.key, rankWorkflowNodeCandidates(workflowJson, definition, slot.stage, stages))
    }
    return cache
  }, [masters, workflowJson])

  const editableSlots = useMemo<EditableSlot[]>(() => {
    return rows.flatMap((row) => {
      const masterV2 = 'base_key' in row.master ? row.master : undefined
      const variants = masterV2?.variants ?? []
      const slots = row.stageSlots?.length ? row.stageSlots : [{
        slotKey: `m_${row.master.id}`, masterId: row.master.id, node_id: row.node_id,
        variantId: undefined, enabled: row.enabled, reference_missing: row.reference_missing, stageName: 'Main', stageKey: 'main',
        candidates: [], recommendedNodeIds: [], status: row.status,
      }]
      return slots.map((slot) => {
        const variant = variants.find((item) => item.id === slot.variantId)
        return {
          slotKey: slot.slotKey,
          masterId: row.master.id,
          ...(slot.variantId !== undefined ? { variantId: slot.variantId } : {}),
          ...(variant?.stage_id !== undefined ? { stageId: variant.stage_id } : {}),
          stageName: slot.stageName || 'Main',
          roleLabel: row.master.display_name || ('name' in row.master ? row.master.name : '') || row.master.role || `Role ${row.master.id}`,
          nodeId: slot.node_id,
          enabled: slot.enabled,
          missingReference: slot.reference_missing,
          candidates: candidateCache.get(slot.slotKey) ?? [],
        }
      })
    })
  }, [rows, candidateCache])

  // ── Scan on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setPhase('scanning')
    setScanError(null)

    setScanResult(null)
    workflowsApi.scan(workflowJson)
      .then((result) => {
        if (!cancelled) {
          const res = result as ScanResult
          setScanResult(res)
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

  useEffect(() => {
    if (initializedSession.current || !mastersFetched || !scanResult) return
    initializedSession.current = true
    initFromScan(scanResult)
    setPhase('editing')
  }, [mastersFetched, scanResult, initFromScan])

  // ── Save mutation ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const mappings = getMappings(rows, [])
      const data = {
        name: workflowName.trim(),
        json_body: workflowJson,
        mappings,
        mapping_slot_states: mappingSlotStates,
      }
      return workflowsApi.create(data) as Promise<{ id: number; name: string }>
    },
    onSuccess: (data) => {
      setPhase('done')
      onSaved(data.id)
      onClose()
    },
    onError: (err: unknown) => {
      saveInFlight.current = false
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
    if (!workflowName.trim() || saveInFlight.current) return
    saveInFlight.current = true
    setSaveError(null)
    setPhase('saving')
    saveMutation.mutate()
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && phase !== 'saving') onClose()
  }

  const activeCount = editableSlots.filter(slot => slot.enabled && slot.nodeId.trim() !== '').length

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl max-h-full lg:max-h-[85vh] flex flex-col rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#141414] shadow-2xl overflow-hidden">

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
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">マッピング設定</h3>
                </div>

                {editableSlots.length === 0 && (
                  <p className="text-xs text-zinc-650 py-2 pl-1">マッチした役割はありません。</p>
                )}

                <WorkflowMappingEditor
                  rows={editableSlots}
                  onChangeSlot={updateSlotNodeId}
                  onToggleSlot={setSlotEnabled}
                  onToggleStage={setStageEnabled}
                  saving={phase === 'saving'}
                />
              </div>

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
