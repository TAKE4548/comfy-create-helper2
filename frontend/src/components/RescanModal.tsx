import { useEffect, useMemo, useState, useRef } from 'react'
import { AlertCircle, CheckCircle2, Loader2, ScanLine, X } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { workflowsApi, mappingMastersApi } from '../api/client'
import type { MappingMaster, MappingMasterV2, ScanResult, Workflow, WorkflowMapping } from '../api/types'
import { useMasterMappingRows, type StageSlotItem } from '../hooks/useMasterMappingRows'
import { rankWorkflowNodeCandidates } from '../utils/workflowNodeUtils'
import { WorkflowMappingEditor, type EditableSlot } from './WorkflowMappingEditor'

type Phase = 'scanning' | 'editing' | 'saving' | 'done'

interface RescanModalProps {
  workflowId: number
  workflowJson: Record<string, unknown>
  existingMappings?: { master_id: number; node_id: string; variant_id?: number | null }[] | WorkflowMapping[]
  onClose: () => void
  onSaved: () => void
}

export function RescanModal(props: RescanModalProps) {
  return <RescanModalSession key={props.workflowId} {...props} />
}

function RescanModalSession({ workflowId, workflowJson, existingMappings, onClose, onSaved }: RescanModalProps) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const { data: workflow, isFetched: workflowFetched, isFetching: workflowFetching, isError: workflowError } = useQuery<Workflow>({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowsApi.get(workflowId) as Promise<Workflow>,
    refetchOnMount: 'always',
  })
  const { data: masters = [], isFetched: mastersFetched, isFetching: mastersFetching } = useQuery<(MappingMaster | MappingMasterV2)[]>({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<(MappingMaster | MappingMasterV2)[]>,
  })
  const savedMappings = existingMappings ?? workflow?.mappings ?? []
  const { buildRows, updateSlotNodeId, setSlotEnabled, setStageEnabled, initFromScan, getMappings, mappingSlotStates } = useMasterMappingRows(
    masters,
    scanResult,
    { workflowJson, existingMappings: savedMappings, mappingSlotStates: workflow?.mapping_slot_states },
  )
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
  const editorRows = useMemo<EditableSlot[]>(() => rows.flatMap((row) => {
    const masterV2 = 'base_key' in row.master ? row.master : undefined
    const variants = masterV2?.variants ?? []
      const slots: StageSlotItem[] = row.stageSlots?.length ? row.stageSlots : [{
      slotKey: `m_${row.master.id}`, masterId: row.master.id, node_id: row.node_id,
      enabled: row.enabled, reference_missing: row.reference_missing, stageName: 'Main',
      stageKey: 'main', candidates: [], recommendedNodeIds: [], status: row.status, unused: row.unused,
    }]
    return slots.map((slot) => {
      const variant = variants.find((item) => item.id === slot.variantId)
      return {
        slotKey: slot.slotKey, masterId: row.master.id,
        ...(slot.variantId !== undefined ? { variantId: slot.variantId } : {}),
        ...(variant?.stage_id !== undefined ? { stageId: variant.stage_id } : {}),
        stageName: slot.stageName || 'Main',
        roleLabel: row.master.display_name || ('name' in row.master ? row.master.name : '') || row.master.role || `Role ${row.master.id}`,
        nodeId: slot.node_id, enabled: slot.enabled, missingReference: slot.reference_missing,
        candidates: candidateCache.get(slot.slotKey) ?? [],
      }
    })
  }), [rows, candidateCache])

  useEffect(() => {
    let cancelled = false
    setPhase('scanning')
    setError(null)
    setScanResult(null)
    workflowsApi.scan(workflowJson).then((result) => {
      if (!cancelled) setScanResult(result as ScanResult)
    }).catch((err: Error) => {
      if (!cancelled) { setError(err.message); setPhase('editing') }
    })
    return () => { cancelled = true }
  }, [workflowJson, workflowId])

  useEffect(() => {
    if (initializedSession.current || !mastersFetched || mastersFetching || !workflowFetched || workflowFetching || !scanResult) return
    initializedSession.current = true
    initFromScan(scanResult, savedMappings.map((mapping) => ({
      master_id: mapping.master_id,
      node_id: mapping.node_id,
      ...('role' in mapping && typeof mapping.role === 'string' ? { role: mapping.role } : {}),
      ...(mapping.variant_id != null ? { variant_id: mapping.variant_id } : {}),
    })), workflowJson)
    setPhase('editing')
  }, [mastersFetched, mastersFetching, workflowFetched, workflowFetching, scanResult, workflowId, workflowJson, savedMappings, initFromScan])

  useEffect(() => {
    if (workflowError) { setError('ワークフロー設定を読み込めませんでした'); setPhase('editing') }
  }, [workflowError])

  const saveMutation = useMutation({
    mutationFn: () => workflowsApi.update(workflowId, { mappings: getMappings(rows, []), mapping_slot_states: mappingSlotStates }),
    onSuccess: () => { setPhase('done'); onSaved(); onClose() },
    onError: (err: Error) => { saveInFlight.current = false; setError(err.message); setPhase('editing') },
  })
  const handleConfirm = () => { if (saveInFlight.current) return; saveInFlight.current = true; setError(null); setPhase('saving'); saveMutation.mutate() }
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && phase !== 'saving') onClose()
  }
  const activeCount = editorRows.filter((row) => row.enabled && row.nodeId.trim() !== '').length

  return <div className="modal-backdrop" onClick={handleBackdropClick}>
    <div className="w-full max-w-2xl max-h-full lg:max-h-[85vh] flex flex-col rounded-xl border border-[rgba(255,255,255,0.1)] bg-[#141414] shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-2.5"><ScanLine size={16} className="text-accent-green"/><h2 className="text-sm font-semibold text-zinc-200">マッピング再スキャン</h2>{phase === 'scanning' && <Loader2 size={13} className="animate-spin text-zinc-400"/>}</div>
        <button id="rescan-modal-close" onClick={onClose} disabled={phase === 'saving'} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 disabled:opacity-40"><X size={15}/></button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {error && <div role="alert" className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><AlertCircle size={14}/><span>{error}</span></div>}
        {(phase === 'scanning' || !mastersFetched || !workflowFetched) && !error && <div className="flex flex-col items-center py-12 gap-3 text-zinc-500"><Loader2 size={28} className="animate-spin"/><p className="text-sm">ワークフローをスキャン中…</p></div>}
        {(phase === 'editing' || phase === 'saving') && !error && scanResult && <>
          <div className="flex items-center gap-2"><CheckCircle2 size={14} className="text-accent-green"/><h3 className="text-xs font-semibold text-zinc-400">マッピング設定</h3></div>
          {editorRows.length === 0 ? <p className="text-xs text-zinc-650">設定できる役割はありません。</p> : <WorkflowMappingEditor
            rows={editorRows}
            onChangeSlot={updateSlotNodeId}
            onToggleSlot={setSlotEnabled}
            onToggleStage={setStageEnabled}
            saving={phase === 'saving'}
          />}
        </>}
      </div>
      {(phase === 'editing' || phase === 'saving') && <div className="flex items-center justify-between px-5 py-4 border-t border-[rgba(255,255,255,0.07)]">
        <p className="text-[11px] text-zinc-600">利用中: <span className="text-zinc-400">{activeCount}</span> 件（無効な割り当ても保持）</p>
        <div className="flex items-center gap-2"><button id="rescan-cancel-btn" onClick={onClose} disabled={phase === 'saving'} className="px-4 py-2 rounded-lg text-zinc-400 text-sm">キャンセル</button><button id="rescan-confirm-btn" onClick={handleConfirm} disabled={phase === 'saving' || !workflowFetched || !mastersFetched || !scanResult} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-green text-background text-sm font-semibold disabled:opacity-50">{phase === 'saving' ? <><Loader2 size={14} className="animate-spin"/>保存中…</> : <><CheckCircle2 size={14}/>適用・保存</>}</button></div>
      </div>}
    </div>
  </div>
}
