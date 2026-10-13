import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sliders, Layers, Settings, ChevronDown, RefreshCw, Pencil, Copy, Wand2, Trash2, ArrowLeftRight, Undo2, Check } from 'lucide-react'
import { workflowsApi, workflowPresetsApi, snapshotsApi, mappingMastersApi, baseModelsApi } from '../../../api/client'
import { stageMastersApi } from '../../../api/domains/stageMasters'
import type { WorkflowSummary, WorkflowPreset, DiffAnalyzeResponse, Workflow, MappingMaster, BaseModel, StageMaster } from '../../../api/types'
import { detectActiveStages } from '../../../utils/workflowAdaptiveStageDetector'
import { AdaptiveWorkflowWiring } from '../../../components/AdaptiveWorkflowWiring'
import { useConfig } from '../../../hooks/useConfig'
import { resolveComfyUrl } from '../../../hooks/useComfyWebSocket'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { hydrateSlotStates, slotKey, type SlotDefinition, type WorkflowSlotStates } from '../../../utils/workflowMappingState'
import { WorkflowManageModal } from '../../../components/WorkflowManageModal'
import { WorkflowDiffReplaceModal } from '../../../components/WorkflowDiffReplaceModal'
import { PresetManagerPanel } from '../../../components/PresetManagerPanel'
import { ConnectionStatus, WorkflowDeleteConfirmDialog } from '../../../components/SettingsComponents'
import { ServiceConnectionCard } from './ServiceConnectionCard'

export type ConfigDraft = { name: string; json_body: Record<string, unknown>; mappings: { master_id: number; node_id: string; variant_id?: number | null }[]; target_base_model_id: number | null; default_applied_assets: string | null; mapping_slot_states?: WorkflowSlotStates }
interface ConfigDraftSession { epoch: number; workflowId: number | null; hydrated: boolean; acknowledgedRevision: number }
export const record = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export function graphNodeIds(graph: unknown): string[] {
  if (!record(graph) || !record(graph.nodes)) return []
  return Object.keys(graph.nodes).filter((id) => record(graph.nodes[id]))
}
export function validateConfig(value: unknown, masterIds: number[], modelIds: number[]): ConfigDraft {
  if (!record(value) || value.format !== 'prompt-surgeon-workflow-config' || value.version !== 1) throw new Error('形式またはバージョンが正しくありません')
  if (typeof value.name !== 'string' || !record(value.json_body) || !graphNodeIds(value.json_body).length || !Array.isArray(value.mappings)) throw new Error('ワークフロー名・グラフ・対応付けが不正です')
  const nodes = graphNodeIds(value.json_body)
  const seen = new Set<string>()
  const mappings = value.mappings.map((m: any) => {
    if (!record(m) || !Number.isInteger(m.master_id) || m.master_id <= 0 || !masterIds.includes(m.master_id) || typeof m.node_id !== 'string' || !nodes.includes(m.node_id)) throw new Error('対応付けのマスターID・ノードIDが不正です')
    const key = m.variant_id ? `${m.master_id}_${m.variant_id}` : `${m.master_id}`
    if (seen.has(key)) throw new Error('対応付けが重複しています')
    seen.add(key)
    return {
      master_id: m.master_id,
      node_id: m.node_id,
      ...(m.variant_id !== undefined ? { variant_id: m.variant_id } : {}),
    }
  })
  let mappingSlotStates: WorkflowSlotStates | undefined
  if (Object.prototype.hasOwnProperty.call(value, 'mapping_slot_states')) {
    if (!record(value.mapping_slot_states)) throw new Error('対応付け状態が不正です')
    mappingSlotStates = {}
    for (const [key, enabled] of Object.entries(value.mapping_slot_states)) {
      if (!/^(?:m|v):[1-9]\d*$/.test(key) || typeof enabled !== 'boolean') throw new Error('対応付け状態が不正です')
      mappingSlotStates[key] = enabled
    }
  }
  const modelId = value.target_base_model_id
  if (modelId !== null && (!Number.isInteger(modelId) || modelId <= 0 || !modelIds.includes(modelId))) throw new Error('ベースモデルIDが不正です')
  if (value.default_applied_assets !== null && typeof value.default_applied_assets !== 'string') throw new Error('既定アセット形式が不正です')
  return { name: value.name, json_body: value.json_body, mappings, target_base_model_id: modelId, default_applied_assets: value.default_applied_assets, ...(mappingSlotStates !== undefined ? { mapping_slot_states: mappingSlotStates } : {}) }
}

export interface WorkflowConnectionSectionProps {
  group?: 'workflows' | 'system'
  showConnections?: boolean
  isExpandedLongPress: boolean
  onToggleLongPress: () => void
  isExpandedWorkflows: boolean
  onToggleWorkflows: () => void
  isExpandedConnections: boolean
  onToggleConnections: () => void
}

export function WorkflowConnectionSection({
  group,
  showConnections = true,
  isExpandedLongPress,
  onToggleLongPress,
  isExpandedWorkflows,
  onToggleWorkflows,
  isExpandedConnections,
  onToggleConnections,
}: WorkflowConnectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [configSaving, setConfigSaving] = useState(false)
  const configDraftRevision = useRef(0)
  const configDraftSession = useRef<ConfigDraftSession>({ epoch: 0, workflowId: null, hydrated: false, acknowledgedRevision: 0 })
  const [comfyUrl, setComfyUrl] = useState('http://localhost:8188')
  const [longPressMultiSelect, setLongPressMultiSelect] = useState(0.8)
  const [longPressCardMove, setLongPressCardMove] = useState(0.5)

  // Workflow states
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [expandedPresetWorkflowId, setExpandedPresetWorkflowId] = useState<number | null>(null)
  const [showWorkflowDeleteDialog, setShowWorkflowDeleteDialog] = useState(false)
  const [deleteWorkflowDetails, setDeleteWorkflowDetails] = useState({
    mappings: 0,
    presets: 0,
    snapshots: 0,
  })
  const [isLoadingWorkflowDetails, setIsLoadingWorkflowDetails] = useState(false)

  // Smart Diff & Rollback states
  const [diffReplaceModalOpen, setDiffReplaceModalOpen] = useState(false)
  const [diffTargetWorkflow, setDiffTargetWorkflow] = useState<WorkflowSummary | null>(null)
  const [diffResult, setDiffResult] = useState<DiffAnalyzeResponse | null>(null)
  const [newWorkflowJson, setNewWorkflowJson] = useState<Record<string, unknown> | null>(null)
  const [isReplacing, setIsReplacing] = useState(false)
  const [hasRollbackMap, setHasRollbackMap] = useState<Record<number, boolean>>({})
  const diffFileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingDiffWorkflow, setPendingDiffWorkflow] = useState<WorkflowSummary | null>(null)
  const [configWorkflowId, setConfigWorkflowId] = useState<number | null>(null)
  const [configMappings, setConfigMappings] = useState<{ master_id: number; node_id: string; variant_id?: number }[]>([])
  const [configSlotStates, setConfigSlotStates] = useState<WorkflowSlotStates>({})
  const [configBaseModelId, setConfigBaseModelId] = useState('')
  const [configText, setConfigText] = useState('')
  const [exportText, setExportText] = useState('')
  const [configPreview, setConfigPreview] = useState<ConfigDraft | null>(null)
  const [configError, setConfigError] = useState('')
  const [confirmConfigApply, setConfirmConfigApply] = useState(false)

  const { data: config } = useConfig()

  useEffect(() => {
    if (config?.comfy_url) {
      setComfyUrl(config.comfy_url)
    }
  }, [config])

  useEffect(() => {
    let msStored: string | null = null
    let cmStored: string | null = null
    try {
      msStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)
    } catch {
      // Keep the in-memory default when browser storage is unavailable.
    }
    try {
      cmStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE)
    } catch {
      // Keep the in-memory default when browser storage is unavailable.
    }
    const msParsed = msStored !== null ? parseFloat(msStored) : NaN
    const cmParsed = cmStored !== null ? parseFloat(cmStored) : NaN
    if (!isNaN(msParsed)) setLongPressMultiSelect(msParsed)
    if (!isNaN(cmParsed)) setLongPressCardMove(cmParsed)
  }, [])

  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<WorkflowSummary[]>,
    enabled: group !== 'system',
  })

  const { data: configWorkflow, isFetching: isFetchingConfigWorkflow } = useQuery({
    queryKey: ['workflow-config', configWorkflowId],
    queryFn: () => workflowsApi.get(configWorkflowId!) as Promise<Workflow>,
    enabled: group !== 'system' && configWorkflowId !== null,
    refetchOnMount: 'always',
  })
  const { data: mappingMasters = [] } = useQuery({ queryKey: ['mapping-masters'], queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>, enabled: group !== 'system' })
  const { data: baseModels = [] } = useQuery({ queryKey: ['base-models'], queryFn: () => baseModelsApi.list() as Promise<BaseModel[]>, enabled: group !== 'system' })
  const { data: stageMasters = [] } = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list() as Promise<StageMaster[]>,
    enabled: group !== 'system',
  })

  const slotDefinitions = useMemo<SlotDefinition[]>(() => mappingMasters.flatMap((master: any) => {
    const variants = Array.isArray(master.variants) ? master.variants : []
    if (variants.length) return variants.map((variant: any) => ({ masterId: master.id, variantId: variant.id, stageId: variant.stage_id, role: variant.computed_role, legacyRole: master.role, defaultEnabled: Boolean(variant.is_enabled) }))
    return [{ masterId: master.id, defaultEnabled: master.default_enabled !== false }]
  }), [mappingMasters])

  const activeStages = useMemo(() => {
    const masters = stageMasters.length > 0 ? stageMasters : [
      { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 } as StageMaster,
    ]
    const detected = detectActiveStages(configWorkflow?.json_body, masters)
    const requiredStageIds = new Set<number>()
    for (const slot of slotDefinitions) {
      const key = slotKey(slot.masterId, slot.variantId)
      if (slot.stageId !== undefined && (slot.defaultEnabled || configSlotStates[key] !== undefined || configWorkflow?.mappings.some((mapping) => slotKey(mapping.master_id, mapping.variant_id) === key))) requiredStageIds.add(slot.stageId)
    }
    for (const key of Object.keys(configSlotStates)) {
      const slot = slotDefinitions.find((definition) => slotKey(definition.masterId, definition.variantId) === key)
      if (slot?.stageId !== undefined) requiredStageIds.add(slot.stageId)
    }
    const byId = new Map(detected.map((item) => [item.stage.id, item]))
    for (const stage of masters) if (requiredStageIds.has(stage.id) && !byId.has(stage.id)) byId.set(stage.id, { stage, matchingNodesCount: 0, matchedNodeIds: [], isAlwaysVisible: Boolean(stage.is_builtin || stage.key.toLowerCase() === 'main') })
    return Array.from(byId.values()).sort((a, b) => a.stage.sort_order - b.stage.sort_order)
  }, [configWorkflow?.json_body, configWorkflow?.mappings, configSlotStates, stageMasters, slotDefinitions])

  useEffect(() => {
    const session = configDraftSession.current
    if (!configWorkflow || isFetchingConfigWorkflow || configWorkflow.id !== configWorkflowId || session.workflowId !== configWorkflowId || session.hydrated) return
    setConfigMappings(configWorkflow.mappings.map(({ master_id, node_id, variant_id }) => ({ master_id, node_id, ...(variant_id != null ? { variant_id } : {}) })))
    setConfigSlotStates(hydrateSlotStates(configWorkflow.mapping_slot_states, configWorkflow.mappings, slotDefinitions))
    setConfigBaseModelId(configWorkflow.target_base_model_id ? String(configWorkflow.target_base_model_id) : '')
    configDraftSession.current = { ...session, hydrated: true, acknowledgedRevision: configDraftRevision.current }
  }, [configWorkflow, configWorkflowId, isFetchingConfigWorkflow, slotDefinitions])

  const saveWorkflowConfig = async (draft: ConfigDraft) => {
    const session = configDraftSession.current
    if (configWorkflowId === null || configSaving || !session.hydrated || session.workflowId !== configWorkflowId || configWorkflow?.id !== configWorkflowId) return
    const saveId = configWorkflowId
    const saveEpoch = configDraftSession.current.epoch
    const revision = configDraftRevision.current
    const snapshot = { ...draft, mapping_slot_states: { ...(draft.mapping_slot_states ?? configSlotStates) }, mappings: draft.mappings.map(({ master_id, node_id, variant_id }) => ({ master_id, node_id, ...(variant_id != null ? { variant_id } : {}) })) }
    const sameSession = () => configDraftSession.current.epoch === saveEpoch && configDraftSession.current.workflowId === saveId
    const latestSnapshot = () => sameSession() && configDraftRevision.current === revision
    setConfigSaving(true)
    setSaved(null)
    setConfigError('')
    try {
      await workflowsApi.update(saveId, {
        json_body: snapshot.json_body,
        mappings: snapshot.mappings,
        mapping_slot_states: snapshot.mapping_slot_states,
        target_base_model_id: snapshot.target_base_model_id,
        default_applied_assets: snapshot.default_applied_assets,
      })
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ['workflows'] }),
        qc.invalidateQueries({ queryKey: ['workflow-config', saveId] }),
        qc.invalidateQueries({ queryKey: ['workflow', saveId] }),
      ])
      if (sameSession()) {
        configDraftSession.current = { ...configDraftSession.current, acknowledgedRevision: revision }
      }
      if (latestSnapshot()) {
        setConfigMappings(snapshot.mappings.map(({ master_id, node_id, variant_id }) => ({ master_id, node_id, ...(variant_id != null ? { variant_id } : {}) })))
        setConfigSlotStates(snapshot.mapping_slot_states)
        setConfigBaseModelId(snapshot.target_base_model_id ? String(snapshot.target_base_model_id) : '')
        setConfigPreview(null)
        setConfirmConfigApply(false)
        setSaved('workflow-config')
        setConfigError('')
      }
    } catch (err: any) {
      if (latestSnapshot()) {
        setSaved(null)
        setConfigError(`保存に失敗しました: ${err.message || err}（設定は未保存です）`)
      }
    } finally {
      setConfigSaving(false)
    }
  }

  const handleSaveLinks = (updatedMappings?: Array<{ master_id: number; node_id: string; variant_id?: number }>, updatedSlotStates?: WorkflowSlotStates) => {
    if (!configWorkflow) return
    const mappingsToSave = updatedMappings || configMappings
    const hasVariants = mappingMasters.some((m) => Array.isArray((m as any).variants) && (m as any).variants.length > 0) || configWorkflow.mappings.some((m) => m.variant_id != null)
    void saveWorkflowConfig({
      name: configWorkflow.name,
      json_body: configWorkflow.json_body,
      mappings: mappingsToSave.map((m) => ({
        master_id: m.master_id,
        node_id: m.node_id,
        ...(hasVariants && m.variant_id !== undefined ? { variant_id: m.variant_id } : {}),
      })),
      mapping_slot_states: updatedSlotStates ?? configSlotStates,
      target_base_model_id: configBaseModelId ? Number(configBaseModelId) : null,
      default_applied_assets: configWorkflow.default_applied_assets ?? null,
    })
  }

  const handlePreviewConfig = () => {
    configDraftRevision.current += 1
    setSaved(null)
    try {
      const parsedDraft = validateConfig(JSON.parse(configText), mappingMasters.map((m) => m.id), baseModels.map((m) => m.id))
      const draft = { ...parsedDraft, mapping_slot_states: parsedDraft.mapping_slot_states ?? configSlotStates }
      setConfigPreview(draft)
      setConfirmConfigApply(false)
      setConfigError('')
    } catch (err: any) {
      setConfigPreview(null)
      setConfigError(err.message || 'JSONを読み取れません')
    }
  }

  const { data: workflowPresets } = useQuery({
    queryKey: ['workflow-presets', expandedPresetWorkflowId],
    queryFn: () => workflowPresetsApi.list(expandedPresetWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: group !== 'system' && !!expandedPresetWorkflowId,
  })

  // Fetch deletion metadata
  useEffect(() => {
    if (group === 'system' || !showWorkflowDeleteDialog || !selectedWorkflowId) return
    let active = true
    setIsLoadingWorkflowDetails(true)

    Promise.all([
      workflowsApi.get(selectedWorkflowId),
      workflowPresetsApi.list(selectedWorkflowId),
      snapshotsApi.list(selectedWorkflowId),
    ])
      .then(([wf, presets, snapshots]: [any, any, any]) => {
        if (active) {
          setDeleteWorkflowDetails({
            mappings: wf.mappings?.length || 0,
            presets: presets?.length || 0,
            snapshots: snapshots?.length || 0,
          })
          setIsLoadingWorkflowDetails(false)
        }
      })
      .catch((err) => {
        console.error(err)
        if (active) setIsLoadingWorkflowDetails(false)
      })

    return () => {
      active = false
    }
  }, [group, showWorkflowDeleteDialog, selectedWorkflowId])

  // Fetch rollback history statuses for workflows
  useEffect(() => {
    if (group === 'system' || !workflows || workflows.length === 0) return
    let active = true
    Promise.all(
      workflows.map((wf) =>
        workflowsApi
          .getHistoryStatus(wf.id)
          .then((res) => ({ id: wf.id, has_rollback: res.has_rollback }))
          .catch(() => ({ id: wf.id, has_rollback: false }))
      )
    ).then((results) => {
      if (active) {
        const map: Record<number, boolean> = {}
        results.forEach((r) => {
          map[r.id] = r.has_rollback
        })
        setHasRollbackMap(map)
      }
    })
    return () => {
      active = false
    }
  }, [group, workflows])

  const handleOpenDiffFilePicker = (wf: WorkflowSummary) => {
    setPendingDiffWorkflow(wf)
    if (diffFileInputRef.current) {
      diffFileInputRef.current.value = ''
      diffFileInputRef.current.click()
    }
  }

  const handleDiffFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingDiffWorkflow) return

    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = await workflowsApi.diffAnalyze(pendingDiffWorkflow.id, json)
      setDiffTargetWorkflow(pendingDiffWorkflow)
      setNewWorkflowJson(json)
      setDiffResult(res)
      setDiffReplaceModalOpen(true)
    } catch (err: any) {
      alert(`差分解析エラー: ${err.message || err}`)
    }
  }

  const handleConfirmDiffReplace = async (
    customMappings: { master_id: number; node_id: string }[]
  ) => {
    if (!diffTargetWorkflow || !newWorkflowJson) return
    setIsReplacing(true)
    try {
      await workflowsApi.update(diffTargetWorkflow.id, {
        json_body: newWorkflowJson,
        mappings: customMappings,
      })
      await qc.invalidateQueries({ queryKey: ['workflows'] })
      setHasRollbackMap((prev) => ({ ...prev, [diffTargetWorkflow.id]: true }))
      setDiffReplaceModalOpen(false)
    } catch (err: any) {
      alert(`置換エラー: ${err.message || err}`)
    } finally {
      setIsReplacing(false)
    }
  }

  const handleRollback = async (workflowId: number) => {
    if (!window.confirm('直前のワークフロー状態にロールバックしますか？')) return
    try {
      await workflowsApi.rollback(workflowId)
      await qc.invalidateQueries({ queryKey: ['workflows'] })
      setHasRollbackMap((prev) => ({ ...prev, [workflowId]: false }))
    } catch (err: any) {
      alert(`ロールバックエラー: ${err.message || err}`)
    }
  }

  // Workflow mutations
  const renameWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setWorkflowManageMode(null)
      setSelectedWorkflowId(null)
    },
  })

  const copyWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.copy(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setWorkflowManageMode(null)
      setSelectedWorkflowId(null)
    },
  })

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: number) => workflowsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setShowWorkflowDeleteDialog(false)
      setSelectedWorkflowId(null)
    },
  })

  // Preset mutations
  const renamePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      workflowPresetsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    },
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => workflowPresetsApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    },
  })

  const handleLongPressChange = (key: 'multi-select' | 'card-move', value: number) => {
    setSaved(null)
    setStorageError(null)
    if (key === 'multi-select') {
      setLongPressMultiSelect(value)
    } else {
      setLongPressCardMove(value)
    }
    try {
      localStorage.setItem(
        key === 'multi-select'
          ? LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT
          : LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE,
        String(value),
      )
      setSaved('longpress')
    } catch (error) {
      // Keep the updated in-memory value when browser storage is unavailable.
      setSaved(null)
      const details = error && typeof error === 'object' ? error as { message?: unknown; name?: unknown } : null
      const reason = typeof details?.message === 'string' && details.message
        ? details.message
        : typeof details?.name === 'string' && details.name ? details.name : 'LocalStorageへの保存に失敗しました'
      setStorageError(reason)
    }
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <>
      {/* Long Press Sensitivity */}
      {group !== 'workflows' && <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        {group === 'system' ? (
          <div className="flex items-center justify-between px-4 py-3.5 bg-surface">
            <div className="flex items-center gap-2">
              <Sliders size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">長押し感度設定（アプリ全体）</h2>
              <span className="text-xs text-zinc-600">— ブラウザ（LocalStorage）に保存</span>
            </div>
            {saved === 'longpress' && <span className="flex items-center gap-1 text-xs text-accent-green"><Check size={13} />設定を保存しました</span>}
          </div>
        ) : (
        <div
          onClick={onToggleLongPress}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-[#7C6FDD]" />
            <h2 className="text-sm font-semibold text-zinc-300">長押し感度設定（アプリ全体）</h2>
            <span className="text-xs text-zinc-600">— ブラウザ（LocalStorage）に保存</span>
          </div>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {saved === 'longpress' && (
              <span className="flex items-center gap-1 text-xs text-accent-green"><Check size={13} />設定を保存しました</span>
            )}
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-200 ${
                isExpandedLongPress ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
        )}
        {(group === 'system' || isExpandedLongPress) && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-5">
            {storageError && <p role="alert" className="text-xs text-red-300">保存に失敗しました: {storageError}（設定は未保存です）</p>}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-300">履歴の複数選択長押し時間</label>
                <span className="text-xs font-mono text-[#7C6FDD]">
                  {longPressMultiSelect.toFixed(1)}s
                </span>
              </div>
              <input
                id="settings-longpress-multiselect"
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={longPressMultiSelect}
                onChange={(e) => handleLongPressChange('multi-select', parseFloat(e.target.value))}
                className="w-full accent-[#7C6FDD]"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0.1s（敏感）</span>
                <span>5.0s（鈍感）</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-zinc-300">カード移動の長押し時間</label>
                <span className="text-xs font-mono text-[#7C6FDD]">
                  {longPressCardMove.toFixed(1)}s
                </span>
              </div>
              <input
                id="settings-longpress-cardmove"
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={longPressCardMove}
                onChange={(e) => handleLongPressChange('card-move', parseFloat(e.target.value))}
                className="w-full accent-[#7C6FDD]"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>0.1s（敏感）</span>
                <span>5.0s（鈍感）</span>
              </div>
            </div>
          </div>
        )}
      </section>
      }

      {/* Workflows Section */}
      {group !== 'system' && <>
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onToggleWorkflows}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">ワークフロー管理</h2>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedWorkflows ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedWorkflows && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
            {isLoadingWorkflows ? (
              <div className="flex items-center gap-2 text-zinc-600 text-xs py-4">
                <RefreshCw size={12} className="animate-spin" />
                ワークフローを読み込み中...
              </div>
            ) : (
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
                <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                  {workflows?.map((wf) => {
                    const isExpanded = expandedPresetWorkflowId === wf.id
                    return (
                      <div key={wf.id} className="flex flex-col">
                        <div className="flex items-center justify-between p-4 hover:bg-white/[0.01] transition-colors">
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-zinc-200 block truncate">
                              {wf.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                              作成日: {new Date(wf.created_at).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setWorkflowManageMode('rename')
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                              title="名前を変更"
                            >
                              <Pencil size={11} />
                              名前変更
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setWorkflowManageMode('copy')
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                              title="コピーを作成"
                            >
                              <Copy size={11} />
                              コピー
                            </button>
                            <button
                              onClick={() => handleOpenDiffFilePicker(wf)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-accent-green/30 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green text-[10px] font-medium transition-all"
                              title="新ワークフローJSONとのスマート差分置換"
                            >
                              <ArrowLeftRight size={11} />
                              スマート置換
                            </button>
                            {hasRollbackMap[wf.id] && (
                              <button
                                onClick={() => handleRollback(wf.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-medium transition-all"
                                title="直前のワークフロー状態へ復元"
                              >
                                <Undo2 size={11} />
                                ロールバック
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setExpandedPresetWorkflowId(isExpanded ? null : wf.id)
                              }
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all ${
                                isExpanded
                                  ? 'border-[#7C6FDD] bg-[#7C6FDD]/10 text-[#7C6FDD]'
                                  : 'border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                              title="プリセット管理"
                            >
                              <Wand2 size={11} />
                              プロファイル管理
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWorkflowId(wf.id)
                                setShowWorkflowDeleteDialog(true)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-650 hover:text-white text-red-400 text-[10px] font-medium transition-all"
                              title="削除"
                            >
                              <Trash2 size={11} />
                              削除
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 px-4 pb-3">
                          <button type="button" aria-expanded={configWorkflowId === wf.id} onClick={() => {
                            const nextId = configWorkflowId === wf.id ? null : wf.id
                            const revision = configDraftRevision.current + 1
                            configDraftRevision.current = revision
                            configDraftSession.current = { epoch: configDraftSession.current.epoch + 1, workflowId: nextId, hydrated: false, acknowledgedRevision: revision }
                            setConfigWorkflowId(nextId)
                            setConfigPreview(null); setConfigError(''); setExportText(''); setSaved(null)
                          }} className="rounded border border-[rgba(255,255,255,0.08)] px-3 py-1.5 text-xs text-zinc-300">対応付け・設定</button>
                        </div>
                        {configWorkflowId === wf.id && <div className="space-y-3 border-t border-zinc-800 bg-zinc-950 p-4" aria-label="ワークフロー対応付け設定">
                          {!(configWorkflow?.id === wf.id && configDraftSession.current.workflowId === wf.id && configDraftSession.current.hydrated) ? <p className="text-xs text-zinc-500">設定を読み込み中...</p> : <>
                            <h3 className="text-sm font-semibold">{configWorkflow.name} の対応付け</h3>
                            <AdaptiveWorkflowWiring
                              workflow={configWorkflow}
                              activeStages={activeStages}
                              mappingMasters={mappingMasters}
                              onSaveMappings={handleSaveLinks}
                              currentMappings={configMappings}
                              currentSlotStates={configSlotStates}
                              onChangeSlotStates={(states) => {
                                configDraftRevision.current += 1
                                setSaved(null)
                                setConfigError('')
                                setConfigSlotStates(states)
                              }}
                              onChangeMappings={(items) => {
                                configDraftRevision.current += 1
                                setSaved(null)
                                setConfigError('')
                                setConfigMappings(items.map((item) => ({ master_id: item.master_id, node_id: item.node_id, ...(item.variant_id != null ? { variant_id: item.variant_id } : {}) })))
                              }}
                              isSaving={configSaving}
                            />
                            <label className="flex items-center gap-3 text-xs text-zinc-300">ベースモデル関連
                              <select aria-label="ベースモデル関連" value={configBaseModelId} onChange={(e) => { configDraftRevision.current += 1; setSaved(null); setConfigError(''); setConfigBaseModelId(e.target.value) }} className="rounded bg-zinc-900 p-2">
                                <option value="">未指定</option>{baseModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                              </select>
                            </label>
                            {configDraftSession.current.hydrated && configDraftRevision.current !== configDraftSession.current.acknowledgedRevision && <p className="text-xs text-amber-300">変更は未保存です</p>}
                            {saved === 'workflow-config' && <p role="status" className="text-xs text-emerald-300">設定を保存しました</p>}
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setExportText(JSON.stringify({ format: 'prompt-surgeon-workflow-config', version: 1, name: configWorkflow.name, json_body: configWorkflow.json_body, mappings: configMappings, mapping_slot_states: configSlotStates, target_base_model_id: configBaseModelId ? Number(configBaseModelId) : null, default_applied_assets: configWorkflow.default_applied_assets ?? null }, null, 2))} className="rounded border border-zinc-700 px-3 py-2 text-xs">設定JSONをエクスポート</button>
                              <button type="button" onClick={() => { setConfigPreview(null); setConfigError(''); setConfirmConfigApply(false) }} className="rounded border border-zinc-700 px-3 py-2 text-xs">プレビューを解除</button>
                            </div>
                            {exportText && <textarea aria-label="エクスポートJSON" readOnly value={exportText} className="min-h-28 w-full rounded bg-zinc-900 p-2 font-mono text-xs" />}
                            <label className="block text-xs text-zinc-300">設定JSONをインポート
                              <textarea aria-label="設定JSONをインポート" value={configText} onChange={(e) => { configDraftRevision.current += 1; setSaved(null); setConfigError(''); setConfigPreview(null); setConfirmConfigApply(false); setConfigText(e.target.value) }} className="mt-1 min-h-28 w-full rounded bg-zinc-900 p-2 font-mono text-xs" />
                            </label>
                            <button type="button" onClick={handlePreviewConfig} className="rounded border border-zinc-700 px-3 py-2 text-xs">インポート内容を確認</button>
                            {configError && <p role="alert" className="text-xs text-red-400">{configError}</p>}
                            {configPreview && <div className="space-y-2 rounded border border-accent-green/30 p-3 text-xs">
                              <p>{configWorkflow.name} に {configPreview.mappings.length}件の対応付けを適用</p>
                              {!confirmConfigApply ? <button type="button" onClick={() => setConfirmConfigApply(true)} className="rounded bg-amber-500/15 px-3 py-2 text-amber-300">適用を確認</button> : <div className="flex items-center gap-2"><span>{configWorkflow.name} / {configPreview.mappings.length}件</span><button type="button" disabled={configSaving} onClick={() => void saveWorkflowConfig(configPreview)} className="rounded bg-accent-green/15 px-3 py-2 text-accent-green disabled:opacity-50">{configSaving ? '保存中…' : 'この内容を適用する'}</button></div>}
                            </div>}
                          </>}
                        </div>}

                        {/* Inline Preset Manager Panel */}
                        {isExpanded && (
                          <div className="px-5 py-4 bg-zinc-950 border-t border-[rgba(255,255,255,0.04)] animate-fade-in">
                            <PresetManagerPanel
                              presets={workflowPresets || []}
                              onRename={async (pid, pName) => {
                                await renamePresetMutation.mutateAsync({ id: pid, name: pName })
                              }}
                              onReorder={async (ordered_ids) => {
                                await reorderPresetsMutation.mutateAsync(ordered_ids)
                              }}
                              isPending={
                                renamePresetMutation.isPending || reorderPresetsMutation.isPending
                              }
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {(!workflows || workflows.length === 0) && (
                    <div className="px-4 py-8 text-center text-xs text-zinc-500">
                      登録されているワークフローはありません。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      </>}

      {/* Connections */}
      {group === 'system' ? (showConnections && <ServiceConnectionCard />) : group !== 'workflows' && <>
      <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={onToggleConnections}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
        >
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
          </div>
          <ChevronDown
            size={16}
            className={`text-zinc-500 transition-transform duration-200 ${
              isExpandedConnections ? 'rotate-180' : ''
            }`}
          />
        </button>
        {isExpandedConnections && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-3">
            {[
              { label: 'FastAPI Backend', url: `${window.location.origin}/health` },
              { label: 'ComfyUI', url: resolveComfyUrl(comfyUrl) },
            ].map(({ label, url }) => (
              <ConnectionStatus key={label} label={label} url={url} />
            ))}
          </div>
        )}
      </section>
      </>}

      {group !== 'system' && workflowManageMode && selectedWorkflowId && (
        <WorkflowManageModal
          mode={workflowManageMode}
          currentName={workflows?.find((w) => w.id === selectedWorkflowId)?.name || ''}
          onSubmit={async (newName) => {
            if (workflowManageMode === 'rename') {
              await renameWorkflowMutation.mutateAsync({ id: selectedWorkflowId, name: newName })
            } else {
              await copyWorkflowMutation.mutateAsync({ id: selectedWorkflowId, name: newName })
            }
          }}
          onClose={() => {
            setWorkflowManageMode(null)
            setSelectedWorkflowId(null)
          }}
          isPending={renameWorkflowMutation.isPending || copyWorkflowMutation.isPending}
        />
      )}

      {group !== 'system' && showWorkflowDeleteDialog && selectedWorkflowId && (
        <WorkflowDeleteConfirmDialog
          workflowName={workflows?.find((w) => w.id === selectedWorkflowId)?.name || ''}
          isPending={deleteWorkflowMutation.isPending}
          onClose={() => {
            setShowWorkflowDeleteDialog(false)
            setSelectedWorkflowId(null)
          }}
          onConfirm={() => deleteWorkflowMutation.mutate(selectedWorkflowId)}
          mappingsCount={deleteWorkflowDetails.mappings}
          presetsCount={deleteWorkflowDetails.presets}
          snapshotsCount={deleteWorkflowDetails.snapshots}
          isLoadingDetails={isLoadingWorkflowDetails}
        />
      )}

      {group !== 'system' && <input
        ref={diffFileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleDiffFileSelected}
      />}

      {group !== 'system' && diffReplaceModalOpen && diffTargetWorkflow && (
        <WorkflowDiffReplaceModal
          isOpen={diffReplaceModalOpen}
          onClose={() => setDiffReplaceModalOpen(false)}
          workflowId={diffTargetWorkflow.id}
          workflowName={diffTargetWorkflow.name}
          diffResult={diffResult}
          onConfirm={handleConfirmDiffReplace}
          isSubmitting={isReplacing}
        />
      )}
    </>
  )
}
