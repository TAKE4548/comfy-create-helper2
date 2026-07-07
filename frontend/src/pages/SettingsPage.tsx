import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Sliders, Wand2, ChevronDown, Save, RefreshCw, Plus, Pencil, Trash2, Copy, Layers } from 'lucide-react'
import { DndContext, closestCenter, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { llmPromptsApi, configApi, mappingMastersApi, workflowsApi, workflowPresetsApi, snapshotsApi } from '../api/client'
import type { LlmPrompt, MappingMaster, WorkflowSummary, WorkflowPreset } from '../api/types'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'
import {
  MappingMasterModal,
  MappingMasterDeleteModal,
  ConnectionStatus,
  SortableMasterRow,
  emptyMasterForm,
  masterFormToCreate,
  masterToForm,
  type MappingMasterFormState,
  WorkflowDeleteConfirmDialog,
} from '../components/SettingsComponents'

import { useMultiSelect } from '../hooks/useMultiSelect'
import { BulkEditModal, type BulkEditField } from '../components/BulkEditModal'
import { MultiSelectToolbar } from '../components/MultiSelectToolbar'
import { LS_KEYS } from '../utils/localStorageKeys'
import { WorkflowManageModal } from '../components/WorkflowManageModal'
import { PresetManagerPanel } from '../components/PresetManagerPanel'

interface ExpandedSectionsState {
  prompts: boolean;
  mappingMasters: boolean;
  longPress: boolean;
  workflows: boolean;
  connections: boolean;
  llmModel: boolean;
}

const PROMPT_LABELS: Record<string, string> = {
  audit_interference: '干渉タグ診断（SDXL/汎用）',
  audit_interference_anima: '干渉タグ診断（Anima）',
  audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
  audit_physical: '物理・構図整合性チェック',
  scene_generate: 'Scene Generator プロンプト',
}

export function SettingsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const [expandedSections, setExpandedSections] = useState<ExpandedSectionsState>(() => {
    const stored = localStorage.getItem(LS_KEYS.SETTINGS_SECTIONS_EXPANDED)
    return stored ? JSON.parse(stored) : {
      prompts: true,
      mappingMasters: true,
      longPress: true,
      workflows: true,
      connections: true,
      llmModel: true,
    }
  })

  useEffect(() => {
    localStorage.setItem(LS_KEYS.SETTINGS_SECTIONS_EXPANDED, JSON.stringify(expandedSections))
  }, [expandedSections])

  const toggleSection = (key: keyof ExpandedSectionsState) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }
  const [showMasterModal, setShowMasterModal] = useState<'create' | 'edit' | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState<MappingMaster | null>(null)
  const [masterForm, setMasterForm] = useState<MappingMasterFormState>(emptyMasterForm())
  const [comfyUrl, setComfyUrl] = useState('http://localhost:8188')
  const [saved, setSaved] = useState<string | null>(null)
  const [sortedMasters, setSortedMasters] = useState<MappingMaster[]>([])
  const [longPressMultiSelect, setLongPressMultiSelect] = useState(0.8)
  const [longPressCardMove, setLongPressCardMove] = useState(0.5)
  
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)

  const {
    isMultiSelectMode,
    selectedIds,
    exitMultiSelectMode,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    selectAll,
    clearSelection,
  } = useMultiSelect({ items: sortedMasters })

  useEffect(() => {
    configApi.get()
      .then((cfg: any) => { if (cfg?.comfy_url) setComfyUrl(cfg.comfy_url) })
      .catch((e: any) => console.error('Failed to fetch comfy_url:', e))
  }, [])

  useEffect(() => {
    const msStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)
    const cmStored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE)
    const msParsed = msStored !== null ? parseFloat(msStored) : NaN
    const cmParsed = cmStored !== null ? parseFloat(cmStored) : NaN
    if (!isNaN(msParsed)) setLongPressMultiSelect(msParsed)
    if (!isNaN(cmParsed)) setLongPressCardMove(cmParsed)
  }, [])

  const { data: masters, isLoading: isLoadingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })

  useEffect(() => {
    if (masters) {
      setSortedMasters(masters)
    }
  }, [masters])

  const { data: usages, isLoading: isLoadingUsages } = useQuery({
    queryKey: ['mapping-master-usages', selectedMaster?.id],
    queryFn: () => mappingMastersApi.getUsages(selectedMaster!.id),
    enabled: !!selectedMaster && showDeleteModal,
  })

  // Workflow states & queries
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [expandedPresetWorkflowId, setExpandedPresetWorkflowId] = useState<number | null>(null)
  const [showWorkflowDeleteDialog, setShowWorkflowDeleteDialog] = useState(false)
  const [deleteWorkflowDetails, setDeleteWorkflowDetails] = useState({ mappings: 0, presets: 0, snapshots: 0 })
  const [isLoadingWorkflowDetails, setIsLoadingWorkflowDetails] = useState(false)

  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<WorkflowSummary[]>,
  })

  const { data: workflowPresets } = useQuery({
    queryKey: ['workflow-presets', expandedPresetWorkflowId],
    queryFn: () => workflowPresetsApi.list(expandedPresetWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: !!expandedPresetWorkflowId,
  })

  // Fetch deletion metadata
  useEffect(() => {
    if (!showWorkflowDeleteDialog || !selectedWorkflowId) return
    let active = true
    setIsLoadingWorkflowDetails(true)
    
    Promise.all([
      workflowsApi.get(selectedWorkflowId),
      workflowPresetsApi.list(selectedWorkflowId),
      snapshotsApi.list(selectedWorkflowId),
    ]).then(([wf, presets, snapshots]: [any, any, any]) => {
      if (active) {
        setDeleteWorkflowDetails({
          mappings: wf.mappings?.length || 0,
          presets: presets?.length || 0,
          snapshots: snapshots?.length || 0,
        })
        setIsLoadingWorkflowDetails(false)
      }
    }).catch((err) => {
      console.error(err)
      if (active) setIsLoadingWorkflowDetails(false)
    })

    return () => { active = false }
  }, [showWorkflowDeleteDialog, selectedWorkflowId])

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
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowPresetsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    }
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => workflowPresetsApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', expandedPresetWorkflowId] })
    }
  })

  const reorderMaster = useMutation({
    mutationFn: (ordered_ids: number[]) => mappingMastersApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
    },
  })

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    if (isMultiSelectMode && selectedIds.has(active.id as number) && selectedIds.size > 1) {
      if (selectedIds.has(over.id as number)) return
      // グループ移動
      const activeIdx = sortedMasters.findIndex((m) => m.id === active.id)
      const overIdx = sortedMasters.findIndex((m) => m.id === over.id)
      const selected = sortedMasters.filter((m) => selectedIds.has(m.id))
      const nonSelected = sortedMasters.filter((m) => !selectedIds.has(m.id))
      const overIdxInNonSelected = nonSelected.findIndex((m) => m.id === over.id)
      const insertAt = overIdx > activeIdx ? overIdxInNonSelected + 1 : overIdxInNonSelected
      const newOrder = [...nonSelected.slice(0, insertAt), ...selected, ...nonSelected.slice(insertAt)]
      setSortedMasters(newOrder)
      reorderMaster.mutate(newOrder.map((m) => m.id))
    } else {
      const oldIndex = sortedMasters.findIndex((m) => m.id === active.id)
      const newIndex = sortedMasters.findIndex((m) => m.id === over.id)
      const reordered = arrayMove(sortedMasters, oldIndex, newIndex)
      setSortedMasters(reordered)
      reorderMaster.mutate(reordered.map((m) => m.id))
    }
  }

  const createMaster = useMutation({
    mutationFn: (data: Parameters<typeof mappingMastersApi.create>[0]) => mappingMastersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeMasterModal() },
  })
  const updateMaster = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof mappingMastersApi.update>[1] }) => mappingMastersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeMasterModal() },
  })
  const deleteMaster = useMutation({
    mutationFn: (id: number) => mappingMastersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mapping-masters'] }); closeDeleteModal() },
  })

  const mappingBulkEditFields: BulkEditField[] = [
    {
      key: 'param_name',
      label: 'Param Name',
      type: 'text',
    },
    {
      key: 'input_type',
      label: 'Input Type',
      type: 'select',
      options: [
        { id: 'textarea', name: 'textarea' },
        { id: 'int', name: 'int' },
        { id: 'float', name: 'float' },
        { id: 'select', name: 'select' },
        { id: 'lora_stack', name: 'lora_stack' },
        { id: 'select_sampler', name: 'select_sampler' },
        { id: 'select_scheduler', name: 'select_scheduler' },
        { id: 'boolean', name: 'boolean' },
      ],
    },
  ]

  const bulkUpdateMasters = useMutation({
    mutationFn: async (values: any) => {
      await Promise.all(
        [...selectedIds].map(id => {
          const mm = sortedMasters.find(m => m.id === id)
          if (!mm) return Promise.resolve()
          const updatedMm = {
            role: mm.role,
            display_name: mm.display_name,
            param_name: mm.param_name,
            input_type: mm.input_type,
            expected_class_types: mm.expected_class_types || [],
            title_patterns: mm.title_patterns || [],
            ...values
          }
          return mappingMastersApi.update(id, updatedMm)
        })
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapping-masters'] })
      exitMultiSelectMode()
      setShowBulkEdit(false)
    }
  })

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })
  const updatePrompt = useMutation({
    mutationFn: ({ key, content }: { key: string; content: string }) => llmPromptsApi.update(key, { content }),
    onSuccess: (_, { key }) => { qc.invalidateQueries({ queryKey: ['llm-prompts'] }); setSaved(key); setTimeout(() => setSaved(null), 2000) },
  })

  const { data: modelsList, refetch: refetchModels, isFetching: isFetchingModels } = useQuery({
    queryKey: ['llm-models'],
    queryFn: () => llmPromptsApi.getModels() as Promise<string[]>,
  })

  const { data: currentModelData, refetch: refetchCurrentModel } = useQuery({
    queryKey: ['llm-current-model'],
    queryFn: () => llmPromptsApi.getCurrentModel() as Promise<LlmPrompt>,
  })

  const updateModelMutation = useMutation({
    mutationFn: (model: string) => llmPromptsApi.updateCurrentModel(model),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['llm-current-model'] })
      setSaved('model')
      setTimeout(() => setSaved(null), 2000)
    }
  })

  const openCreateModal = () => { setMasterForm(emptyMasterForm()); setShowMasterModal('create') }
  const openEditModal = (mm: MappingMaster) => { setSelectedMaster(mm); setMasterForm(masterToForm(mm)); setShowMasterModal('edit') }
  const openCopyCreateModal = (mm: MappingMaster) => { setMasterForm(masterToForm(mm)); setShowMasterModal('create') }
  const closeMasterModal = () => { setShowMasterModal(null); setSelectedMaster(null) }
  const openDeleteModal = (mm: MappingMaster) => { setSelectedMaster(mm); setShowDeleteModal(true) }
  const closeDeleteModal = () => { setShowDeleteModal(false); setSelectedMaster(null) }

  const handleSaveMaster = (e: React.FormEvent) => {
    e.preventDefault()
    const data = masterFormToCreate(masterForm)
    if (showMasterModal === 'create') createMaster.mutate(data)
    else if (showMasterModal === 'edit' && selectedMaster) updateMaster.mutate({ id: selectedMaster.id, data })
  }

  const getContent = (p: LlmPrompt) => edits[p.key] ?? p.content

  const handleLongPressChange = (key: 'multi-select' | 'card-move', value: number) => {
    if (key === 'multi-select') {
      setLongPressMultiSelect(value)
      localStorage.setItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT, String(value))
    } else {
      setLongPressCardMove(value)
      localStorage.setItem(LS_KEYS.LONG_PRESS_DELAY_CARD_MOVE, String(value))
    }
    setSaved('longpress')
    setTimeout(() => setSaved(null), 2000)
  }

  const renderDragOverlayItem = (id: number) => {
    const mm = sortedMasters.find(m => m.id === id)
    if (!mm) return null
    return (
      <div className="px-4 py-2 bg-[#1F1F25] border border-[rgba(255,255,255,0.12)] rounded-lg text-xs text-zinc-300 shadow-xl flex items-center gap-3">
        <span className="font-semibold text-[#3ECF8E]">{mm.role}</span>
        <span className="text-gray-500">|</span>
        <span>{mm.param_name}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isMultiSelectMode && (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalCount={sortedMasters.length}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onExitMode={exitMultiSelectMode}
          actions={
            <button
              onClick={() => setShowBulkEdit(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-green/10 border border-accent-green/30 text-accent-green text-xs font-medium hover:bg-accent-green/20 transition-all disabled:opacity-50"
            >
              <Pencil size={12} />
              一括編集
            </button>
          }
        />
      )}

      <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <Settings size={17} className="text-zinc-400" />
        <h1 className="text-base font-semibold text-zinc-200">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {/* LLM Model Settings */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('llmModel')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Wand2 size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">LLM Model Settings</h2>
              <span className="text-xs text-zinc-600">— 使用するLLMモデルの選択</span>
            </div>
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {saved === 'model' && (
                <span className="text-xs text-accent-green">✓ 保存しました</span>
              )}
              <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.llmModel ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {expandedSections.llmModel && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-400 mb-1">現在のモデル</label>
                  <select
                    id="settings-llm-model-select"
                    value={currentModelData?.content || ''}
                    onChange={(e) => updateModelMutation.mutate(e.target.value)}
                    disabled={updateModelMutation.isPending}
                    className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-[#7C6FDD]/40 font-sans"
                  >
                    <option value="" disabled>モデルを選択してください</option>
                    {modelsList?.map((modelName) => (
                      <option key={modelName} value={modelName}>
                        {modelName}
                      </option>
                    ))}
                    {currentModelData?.content && !modelsList?.includes(currentModelData.content) && (
                      <option value={currentModelData.content}>
                        {currentModelData.content} (現在設定中)
                      </option>
                    )}
                  </select>
                </div>
                <div className="flex items-end self-end">
                  <button
                    id="settings-llm-model-refresh"
                    type="button"
                    onClick={() => {
                      refetchModels()
                      refetchCurrentModel()
                    }}
                    disabled={isFetchingModels}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 border border-[rgba(255,255,255,0.08)] hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isFetchingModels ? 'animate-spin' : ''} />
                    モデル一覧を取得
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* LLM System Prompts */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button 
            type="button" 
            onClick={() => toggleSection('prompts')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
          >
            <div className="flex items-center gap-2">
              <Wand2 size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">LLM System Prompts</h2>
              <span className="text-xs text-zinc-600">— DBに保存（再起動不要）</span>
            </div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.prompts ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.prompts && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
              {isLoading ? (
                <div className="flex items-center gap-2 text-zinc-600 text-sm py-8"><RefreshCw size={14} className="animate-spin" />Loading prompts…</div>
              ) : (
                <div className="space-y-3">
                  {prompts?.map((p) => (
                    <div key={p.key} id={`prompt-section-${p.key}`} className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-hidden">
                      <button id={`prompt-expand-${p.key}`} onClick={() => setExpanded(expanded === p.key ? null : p.key)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors">
                        <div className="text-left">
                          <p className="text-sm font-medium text-zinc-200">{PROMPT_LABELS[p.key] ?? p.key}</p>
                          {p.description && <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                          <span className="text-xs text-zinc-600">{new Date(p.updated_at).toLocaleDateString('ja-JP')}</span>
                          <ChevronDown size={14} className={`text-zinc-500 transition-transform ${expanded === p.key ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      {expanded === p.key && (
                        <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.04)] pt-3 animate-fade-in">
                          <textarea id={`prompt-content-${p.key}`} value={getContent(p)}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [p.key]: e.target.value }))} rows={16}
                            className="w-full bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2.5 text-xs text-zinc-200 font-mono resize-y focus:outline-none focus:border-[#7C6FDD]/40 custom-scrollbar" />
                          <div className="flex items-center justify-between">
                            <button id={`prompt-reset-${p.key}`}
                              onClick={() => setEdits((prev) => { const n = { ...prev }; delete n[p.key]; return n })}
                              disabled={!edits[p.key]} className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-colors">Reset changes</button>
                            <button id={`prompt-save-${p.key}`}
                              onClick={() => updatePrompt.mutate({ key: p.key, content: getContent(p) })} disabled={updatePrompt.isPending}
                              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${saved === p.key ? 'bg-accent-green/20 text-accent-green border border-accent-green/40' : 'bg-[#7C6FDD] text-white hover:bg-[#6d62cc]'}`}>
                              <Save size={12} />{saved === p.key ? 'Saved!' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Mapping Masters */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('mappingMasters')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">Node Mapping Masters</h2>
              <span className="text-xs text-zinc-600">— 編集ノードのマッピングマスタ設定</span>
            </div>
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {!isMultiSelectMode && (
                <button 
                  type="button"
                  onClick={openCreateModal}
                  className="flex items-center gap-1 text-xs bg-[#7C6FDD] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#6d62cc] transition-all"
                >
                  <Plus size={12} />Add Master
                </button>
              )}
              <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.mappingMasters ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {expandedSections.mappingMasters && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30">
              {isLoadingMasters ? (
                <div className="flex items-center gap-2 text-zinc-600 text-sm py-8"><RefreshCw size={14} className="animate-spin" />Loading mapping masters…</div>
              ) : (
                <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                        {['', 'Role', 'Display Name', 'Param Name', 'Input Type', 'Expected Class Types', 'Title Patterns', ''].map((h, i) => (
                          <th key={i} className={`px-4 py-3 font-medium${h === '' && i === 7 ? ' text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                      <SortableContext items={sortedMasters.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                        <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                          {sortedMasters.map((mm) => {
                            const isSelectedRow = isSelected(mm.id)
                            const longPressHandlers = getLongPressHandlers(mm.id)
                            return (
                              <SortableMasterRow
                                key={mm.id}
                                mm={mm}
                                openEditModal={openEditModal}
                                openDeleteModal={openDeleteModal}
                                openCopyModal={openCopyCreateModal}
                                isMultiSelectMode={isMultiSelectMode}
                                isSelected={isSelectedRow}
                                onClick={(e) => {
                                  if (isMultiSelectMode || e.ctrlKey || e.metaKey) {
                                      e.stopPropagation()
                                      handleItemClick(mm.id, e)
                                  } else {
                                    openEditModal(mm)
                                  }
                                }}
                                longPressHandlers={longPressHandlers}
                              />
                            )
                          })}
                          {(!sortedMasters || sortedMasters.length === 0) && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No mapping masters found.</td></tr>
                          )}
                        </tbody>
                      </SortableContext>
                      <DragOverlay>
                        {activeId && (
                          <div className="relative">
                            <div className="opacity-90 scale-105 ring-2 ring-[#3ECF8E] rounded-lg pointer-events-none">
                              {renderDragOverlayItem(activeId)}
                            </div>
                            {isMultiSelectMode && selectedIds.size > 1 && (
                              <div className="absolute -bottom-2 -right-2 bg-[#3ECF8E] text-black text-xs font-bold
                                              rounded-full w-6 h-6 flex items-center justify-center shadow-lg">
                                +{selectedIds.size - 1}
                              </div>
                            )}
                          </div>
                        )}
                      </DragOverlay>
                    </DndContext>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Long Press Sensitivity */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <div 
            onClick={() => toggleSection('longPress')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Sliders size={15} className="text-[#7C6FDD]" />
              <h2 className="text-sm font-semibold text-zinc-300">長押し感度設定（アプリ全体）</h2>
              <span className="text-xs text-zinc-600">— ブラウザ（LocalStorage）に保存</span>
            </div>
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {saved === 'longpress' && (
                <span className="text-xs text-accent-green">✓ 保存しました</span>
              )}
              <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.longPress ? 'rotate-180' : ''}`} />
            </div>
          </div>
          {expandedSections.longPress && (
            <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-surface/30 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-300">履歴の複数選択長押し時間</label>
                  <span className="text-xs font-mono text-[#7C6FDD]">{longPressMultiSelect.toFixed(1)}s</span>
                </div>
                <input
                  id="settings-longpress-multiselect"
                  type="range"
                  min="0.1" max="5.0" step="0.1"
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
                  <span className="text-xs font-mono text-[#7C6FDD]">{longPressCardMove.toFixed(1)}s</span>
                </div>
                <input
                  id="settings-longpress-cardmove"
                  type="range"
                  min="0.1" max="5.0" step="0.1"
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

        {/* Workflows Section */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button 
            type="button"
            onClick={() => toggleSection('workflows')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
          >
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-300">ワークフロー管理</h2>
            </div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.workflows ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.workflows && (
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
                      const isExpanded = expandedPresetWorkflowId === wf.id;
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
                                  setSelectedWorkflowId(wf.id);
                                  setWorkflowManageMode('rename');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                                title="名前を変更"
                              >
                                <Pencil size={11} />
                                名前変更
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedWorkflowId(wf.id);
                                  setWorkflowManageMode('copy');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-medium transition-all"
                                title="コピーを作成"
                              >
                                <Copy size={11} />
                                コピー
                              </button>
                              <button
                                onClick={() => setExpandedPresetWorkflowId(isExpanded ? null : wf.id)}
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
                                  setSelectedWorkflowId(wf.id);
                                  setShowWorkflowDeleteDialog(true);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-650 hover:text-white text-red-400 text-[10px] font-medium transition-all"
                                title="削除"
                              >
                                <Trash2 size={11} />
                                削除
                              </button>
                            </div>
                          </div>
                          
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
                                isPending={renamePresetMutation.isPending || reorderPresetsMutation.isPending}
                              />
                            </div>
                          )}
                        </div>
                      );
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

        {/* Connections */}
        <section className="border border-[rgba(255,255,255,0.06)] bg-surface-2/20 rounded-xl overflow-hidden">
          <button 
            type="button"
            onClick={() => toggleSection('connections')}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-surface hover:bg-white/5 transition-colors text-left font-sans"
          >
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
            </div>
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expandedSections.connections ? 'rotate-180' : ''}`} />
          </button>
          {expandedSections.connections && (
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
      </div>

      {/* Modals */}
      {showMasterModal && (
        <MappingMasterModal mode={showMasterModal} form={masterForm} setForm={setMasterForm}
          isPending={createMaster.isPending || updateMaster.isPending}
          onClose={closeMasterModal} onSubmit={handleSaveMaster} masters={masters} />
      )}
      {showDeleteModal && selectedMaster && (
        <MappingMasterDeleteModal master={selectedMaster} usages={usages as any} isLoadingUsages={isLoadingUsages}
          isPending={deleteMaster.isPending}
          onClose={closeDeleteModal} onDelete={() => deleteMaster.mutate(selectedMaster.id)} />
      )}
      {showBulkEdit && (
        <BulkEditModal
          isOpen={showBulkEdit}
          onClose={() => setShowBulkEdit(false)}
          fields={mappingBulkEditFields}
          selectedCount={selectedIds.size}
          onApply={(values) => bulkUpdateMasters.mutate(values)}
          isApplying={bulkUpdateMasters.isPending}
        />
      )}
      {workflowManageMode && selectedWorkflowId && (
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
      {showWorkflowDeleteDialog && selectedWorkflowId && (
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
    </div>
  )
}

