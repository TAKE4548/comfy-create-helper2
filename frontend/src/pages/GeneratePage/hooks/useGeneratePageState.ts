import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowsApi, snapshotsApi, mappingMastersApi, lorasApi, tagSetsApi, workflowPresetsApi } from '../../../api/client'
import type { Workflow, MappingMaster, Lora, TagSet, WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { useWorkflowParams, getInitialParams } from './useWorkflowParams'
import { useGenerateAction } from './useGenerateAction'
import { useImageNavigation } from './useImageNavigation'
import { useSnapshotActions } from './useSnapshotActions'
import { useAuditAction } from './useAuditAction'
import { useWorkflowUpload } from './useWorkflowUpload'
import { useMultiSelect } from '../../../hooks/useMultiSelect'

export interface SnapshotSummaryWithParams {
  id: number
  workflow_id: number
  image_path: string | null
  created_at: string
  params?: Record<string, any>
}

export function useGeneratePageState() {
  const [isMobile, setIsMobile] = useState(() =>
    window.location.pathname.startsWith('/mobile') || window.innerWidth < 768
  )
  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.location.pathname.startsWith('/mobile') || window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [activePromptTab, setActivePromptTab] = useState<string>('')
  const [collapsedRoles, setCollapsedRoles] = useState<Record<string, boolean>>({})

  const getIsRoleCollapsed = (role: string) => {
    if (collapsedRoles[role] !== undefined) {
      return collapsedRoles[role];
    }
    return localStorage.getItem(`prompt-surgeon-collapsed-${role}`) === 'true';
  };

  const setRoleCollapsed = (role: string, isCollapsed: boolean) => {
    setCollapsedRoles((prev) => ({ ...prev, [role]: isCollapsed }));
    localStorage.setItem(`prompt-surgeon-collapsed-${role}`, String(isCollapsed));
  };

  useEffect(() => {
    const handleTextModeToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const editorId = customEvent.detail?.id;
      if (editorId && editorId.startsWith('prompt-')) {
        const role = editorId.replace('prompt-', '');
        setRoleCollapsed(role, false);
      }
    };
    window.addEventListener('tag-chip-editor:text-mode-toggle', handleTextModeToggle);
    return () => window.removeEventListener('tag-chip-editor:text-mode-toggle', handleTextModeToggle);
  }, []);

  const qc = useQueryClient()
  const [rescanOpen, setRescanOpen] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | ''>('')
  const [selectedMasters, setSelectedMasters] = useState<Record<number, number>>({})
  const [openAddAssetRole, setOpenAddAssetRole] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [localComfyUrl, setLocalComfyUrl] = useState('')
  const [thumbnailTab, setThumbnailTab] = useState<'history' | 'snapshots'>('history')
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)
  const [selectedLoraForModal, setSelectedLoraForModal] = useState<{ role: string; lora: Lora } | null>(null)
  const [selectedTriggerSetId, setSelectedTriggerSetId] = useState<number | 'default'>('default')
  const [loraStrength, setLoraStrength] = useState<number>(1.0)
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false)
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [isWorkflowMenuOpen, setIsWorkflowMenuOpen] = useState(false)

  const store = useGenerationStore()
  const {
    clientId,
    selectedWorkflowId,
    setSelectedWorkflowId,
    paramValues,
    setParamValues,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    appliedAssets,
    addAppliedAsset,
    removeAppliedAsset,
    toggleAppliedAsset,
    setAppliedAssets,
    comfyUrl,
    setComfyUrl,
    sets,
    updateActiveSet,
    isConnected,
    isGenerating,
    progress,
    previewImage,
    activeClientId,
    filterOwnSession,
    setFilterOwnSession,
    activeBatch,
    activeSetId,
    addSet,
    removeSet,
    renameSet,
    toggleSetChecked,
    setAllSetsChecked,
    setActiveSetId,
    setSets,
  } = store

  useEffect(() => { if (comfyUrl) setLocalComfyUrl(comfyUrl) }, [comfyUrl])

  // ── Queries ──────────────────────────────────────────────────
  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list() as Promise<{ id: number; name: string }[]>,
  })
  const { data: workflow } = useQuery({
    queryKey: ['workflow', selectedWorkflowId],
    queryFn: () => workflowsApi.get(selectedWorkflowId!) as Promise<Workflow>,
    enabled: !!selectedWorkflowId,
  })
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummaryWithParams[]>,
    enabled: !!selectedWorkflowId,
  })
  const { data: mappingMasters } = useQuery({
    queryKey: ['mapping-masters'],
    queryFn: () => mappingMastersApi.list() as Promise<MappingMaster[]>,
  })
  const { data: loras } = useQuery({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
  })
  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
  })
  const { data: presets } = useQuery({
    queryKey: ['workflow-presets', selectedWorkflowId],
    queryFn: () => workflowPresetsApi.list(selectedWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: !!selectedWorkflowId,
  })
  const { data: comfyObjectInfo } = useQuery({
    queryKey: ['comfy-object-info', comfyUrl],
    queryFn: async () => {
      const res = await fetch(comfyUrl + '/object_info', { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error('Failed to fetch object info')
      return res.json()
    },
    enabled: !!comfyUrl,
    retry: false,
  })

  // ── Extracted hooks ──────────────────────────────────────────
  const { loadSnapshotParams, handleSaveDefaultParams, handleResetDefaultParams, saveDefaultParamsMutation } =
    useWorkflowParams(workflow, selectedWorkflowId)

  const { handleGenerateSets } = useGenerateAction(workflow)

  const displayImages = store.filterOwnSession ? batchImages : comfyHistoryImages
  const sortedDisplayImages = useMemo(() => {
    return sortOrder === 'desc' ? displayImages : [...displayImages].reverse()
  }, [displayImages, sortOrder])
  
  const getSetNameForImage = (imgUrl: string) => {
    try {
      const url = new URL(imgUrl)
      const promptId = url.searchParams.get('t')
      if (promptId) {
        const mappings = JSON.parse(localStorage.getItem('prompt-surgeon-prompt-to-set-map') || '{}')
        return mappings[promptId] || null
      }
    } catch {}
    return null
  }

  const sortedSnapshots = useMemo(() => {
    if (!snapshots) return []
    const copy = [...snapshots] as SnapshotSummaryWithParams[]
    return sortOrder === 'desc'
      ? copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [snapshots, sortOrder])

  const { handlePrevImg, handleNextImg } = useImageNavigation(sortedDisplayImages)

  const historyItems = useMemo(() => {
    return sortedDisplayImages.map((url, idx) => ({ id: idx, url }))
  }, [sortedDisplayImages])

  const {
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
  } = useMultiSelect({ items: historyItems })

  const {
    isSaveModalOpen,
    setIsSaveModalOpen,
    saveSnapshot,
  } = useSnapshotActions(selectedWorkflowId)

  const {
    auditOpen,
    setAuditOpen,
    auditIntent,
    setAuditIntent,
    auditTypes,
    setAuditTypes,
    auditResult,
    auditStatus,
    runAudit,
  } = useAuditAction()

  const {
    uploadModalOpen,
    setUploadModalOpen,
    uploadedJson,
    uploadedFileName,
    dragOver,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useWorkflowUpload()

  // ── Mutations ────────────────────────────────────────────────
  const renameWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      setWorkflowManageMode(null)
    },
  })
  const copyWorkflowMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.copy(id, name),
    onSuccess: (newWf) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedWorkflowId(newWf.id)
      setWorkflowManageMode(null)
    },
  })

  // Close workflow menu on document click
  useEffect(() => {
    if (!isWorkflowMenuOpen) return
    const closeMenu = () => setIsWorkflowMenuOpen(false)
    document.addEventListener('click', closeMenu)
    return () => document.removeEventListener('click', closeMenu)
  }, [isWorkflowMenuOpen])

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ workflowId, mappings }: { workflowId: number; mappings: { master_id: number; node_id: string }[] }) =>
      workflowsApi.update(workflowId, { mappings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', selectedWorkflowId] })
      qc.invalidateQueries({ queryKey: ['workflows'] })
      setSelectedMasters({})
    },
  })

  const createPresetMutation = useMutation({
    mutationFn: ({
      name,
      paramValues: pv,
      appliedAssets: aa,
      batchSize: bs,
      seedMode: sm,
      seed: sd
    }: {
      name: string;
      paramValues?: Record<string, string>;
      appliedAssets?: Record<string, AppliedAsset[]>;
      batchSize?: number;
      seedMode?: 'random' | 'fixed';
      seed?: number;
    }) => workflowPresetsApi.create({
      workflow_id: selectedWorkflowId!,
      name,
      param_values: pv !== undefined ? pv : paramValues,
      applied_assets: aa !== undefined ? aa : appliedAssets,
      batch_size: bs !== undefined ? bs : batchSize,
      seed_mode: sm !== undefined ? sm : seedMode,
      seed: sd !== undefined ? sd : seed,
    }),
    onSuccess: (newPreset) => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setNewPresetName('')
      if (newPreset?.id) {
        setActiveSetId(newPreset.id)
      }
    }
  })

  const updatePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowPresetsApi.update(id, {
      name,
      param_values: paramValues,
      applied_assets: appliedAssets,
      batch_size: batchSize,
      seed_mode: seedMode,
      seed: seed,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const deletePresetMutation = useMutation({
    mutationFn: (id: number) => workflowPresetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const renamePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowPresetsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => workflowPresetsApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    }
  })

  const handleCreatePreset = (name?: string, copySourceId?: string | number) => {
    const finalName = name ?? newPresetName
    if (!finalName.trim() || !selectedWorkflowId) return
    
    if (copySourceId === undefined) {
      // Original default behavior: use current state
      createPresetMutation.mutate({
        name: finalName.trim(),
        paramValues,
        appliedAssets,
        batchSize,
        seedMode,
        seed,
      })
    } else if (copySourceId === 'default') {
      let initialParams: Record<string, string> = {}
      let defaultAssets: Record<string, any> = {}
      if (workflow) {
        initialParams = getInitialParams(workflow)
        if (workflow.default_applied_assets) {
          try {
            defaultAssets = JSON.parse(workflow.default_applied_assets)
          } catch (e) {
            console.error('Failed to parse default applied assets:', e)
          }
        }
      }
      createPresetMutation.mutate({
        name: finalName.trim(),
        paramValues: initialParams,
        appliedAssets: defaultAssets,
        batchSize: 1,
        seedMode: 'random',
        seed: 42,
      })
    } else {
      const source = presets?.find(p => String(p.id) === String(copySourceId))
      if (source) {
        createPresetMutation.mutate({
          name: finalName.trim(),
          paramValues: source.param_values,
          appliedAssets: source.applied_assets,
          batchSize: source.batch_size,
          seedMode: source.seed_mode as 'random' | 'fixed',
          seed: source.seed,
        })
      } else {
        createPresetMutation.mutate({
          name: finalName.trim(),
          paramValues,
          appliedAssets,
          batchSize,
          seedMode,
          seed,
        })
      }
    }
  }

  const handleUpdatePreset = (id: number, name: string) => {
    if (!selectedWorkflowId) return
    if (confirm(`現在の設定でプリセット「${name}」を上書き保存しますか？`)) {
      updatePresetMutation.mutate({ id, name })
    }
  }

  const handleDeletePreset = (id: number) => {
    if (confirm('このプリセットを削除しますか？')) {
      deletePresetMutation.mutate(id)
    }
  }

  const handleLoadPreset = (preset: WorkflowPreset) => {
    setParamValues(preset.param_values)
    setAppliedAssets(preset.applied_assets)
    setBatchSize(preset.batch_size)
    setSeedMode(preset.seed_mode as 'random' | 'fixed')
    setSeed(preset.seed)
    
    updateActiveSet({
      paramValues: preset.param_values,
      appliedAssets: preset.applied_assets,
      batchSize: preset.batch_size,
      seedMode: preset.seed_mode as 'random' | 'fixed',
      seed: preset.seed
    })
    setIsPresetOpen(false)
  }

  // ── Derived state ────────────────────────────────────────────
  const isGeneratingHere = store.isGenerating && (!store.filterOwnSession || store.activeClientId === clientId)

  const totalQueueCount = useMemo(() => {
    const filterJob = (job: any) => !store.filterOwnSession || job[3]?.client_id === clientId
    return store.queueRunning.filter(filterJob).length + store.queuePending.filter(filterJob).length
  }, [store.queueRunning, store.queuePending, store.filterOwnSession, clientId])

  const snapshotIdsForDisplay = useMemo(() => {
    return sortedDisplayImages.map((img) => {
      const found = sortedSnapshots?.find((s) => s.image_path === img)
      return found ? found.id : null
    })
  }, [sortedDisplayImages, sortedSnapshots])

  const showStrip = batchImages.length > 0 || comfyHistoryImages.length > 0 || (!!sortedSnapshots && sortedSnapshots.length > 0)
  const hasHistory = !!selectedWorkflowId && !!sortedSnapshots && sortedSnapshots.length > 0

  const validMappings = workflow?.mappings.filter((m) => m.role != null) ?? []
  const invalidMappings = workflow?.mappings.filter((m) => m.role == null) ?? []
  const textMappings = validMappings.filter((m) => m.input_type === 'textarea')
  const paramMappings = validMappings.filter((m) => m.input_type !== 'textarea' && m.role !== 'Sampler_Seed')

  // ── Side effects ─────────────────────────────────────────────
  useEffect(() => { setSelectedSnapshotId('') }, [selectedWorkflowId])

  useEffect(() => {
    const texts = workflow?.mappings.filter((m) => m.role != null && m.input_type === 'textarea') ?? []
    setActivePromptTab(texts.length > 0 ? texts[0].role || '' : '')
  }, [workflow])

  // Synchronize presets query with Zustand store's sets state
  useEffect(() => {
    if (!selectedWorkflowId) return

    const checkedPresetsRaw = localStorage.getItem(`prompt-surgeon-checked-presets-${selectedWorkflowId}`)
    const checkedPresets = checkedPresetsRaw ? JSON.parse(checkedPresetsRaw) : null

    const mappedSets = (presets || []).map((preset) => {
      const isChecked = checkedPresets === null ? true : checkedPresets.includes(preset.id)
      return {
        id: preset.id,
        name: preset.name,
        paramValues: preset.param_values,
        appliedAssets: preset.applied_assets,
        batchSize: preset.batch_size,
        seedMode: preset.seed_mode as 'random' | 'fixed',
        seed: preset.seed,
        checked: isChecked,
      }
    })

    setSets?.(mappedSets)

    if (mappedSets.length > 0) {
      const exists = mappedSets.some(s => String(s.id) === String(activeSetId))
      if (!exists) {
        const storedActiveSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + selectedWorkflowId)
        const matched = mappedSets.find(s => String(s.id) === storedActiveSetId)
        if (matched) {
          setActiveSetId(matched.id)
        } else {
          setActiveSetId(mappedSets[0].id)
        }
      }
    }
  }, [presets, selectedWorkflowId, setSets, activeSetId, setActiveSetId])

  // Autosave when paramValues, appliedAssets, batchSize, seedMode, or seed changes
  useEffect(() => {
    if (!selectedWorkflowId || activeSetId === null || typeof activeSetId !== 'number') return

    const activePreset = presets?.find(p => p.id === activeSetId)
    if (!activePreset) return

    const timer = setTimeout(() => {
      updatePresetMutation.mutate({
        id: activePreset.id,
        name: activePreset.name,
      })
    }, 1000)

    return () => clearTimeout(timer)
  }, [
    paramValues,
    appliedAssets,
    batchSize,
    seedMode,
    seed,
    activeSetId,
    presets,
    selectedWorkflowId,
  ])

  // ── Handlers ─────────────────────────────────────────────────
  const handleLoadSnapshot = async (id: number) => {
    try {
      const snapshot = (await snapshotsApi.get(id)) as any
      if (snapshot.params) {
        loadSnapshotParams(snapshot.params)
      }
      
      const rebuiltAssets: Record<string, AppliedAsset[]> = {}
      
      if (snapshot.loras && loras) {
        snapshot.loras.forEach((sl: any) => {
          const matchedLora = loras.find((l) => l.id === sl.lora_id)
          if (matchedLora) {
            const path = matchedLora.file_path || matchedLora.model_name || ''
            const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora'
            const role = sl.role || 'positive'
            
            if (!rebuiltAssets[role]) rebuiltAssets[role] = []
            
            rebuiltAssets[role].push({
              id: `lora-${sl.lora_id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'lora',
              assetId: sl.lora_id,
              name: matchedLora.description || filename,
              enabled: true,
              tags: matchedLora.trigger_word_sets?.[0]?.words || [],
              loraPromptString: `<lora:${filename}:${sl.strength.toFixed(1)}>`,
            })
          }
        })
      }
      
      if (snapshot.tag_sets && tagSets) {
        snapshot.tag_sets.forEach((st: any) => {
          const matchedTagSet = tagSets.find((t) => t.id === st.tag_set_id)
          if (matchedTagSet) {
            const role = st.role || 'positive'
            
            if (!rebuiltAssets[role]) rebuiltAssets[role] = []
            
            rebuiltAssets[role].push({
              id: `tagset-${st.tag_set_id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'tagset',
              assetId: st.tag_set_id,
              name: matchedTagSet.name,
              enabled: true,
              tags: matchedTagSet.tags,
            })
          }
        })
      }
      
      setAppliedAssets(rebuiltAssets)
    } catch (e) {
      console.error('Failed to load snapshot details:', e)
    }
    setSelectedSnapshotId('')
  }

  const handleUpdateMapping = async (mappingId: number, newMasterId: number) => {
    if (!workflow || !selectedWorkflowId) return
    const updatedMappings = workflow.mappings.map((m) =>
      m.id === mappingId
        ? { master_id: newMasterId, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id }
    )
    await updateWorkflowMutation.mutateAsync({ workflowId: selectedWorkflowId, mappings: updatedMappings })
  }

  const handleAddLoraAsset = (role: string, lora: Lora, strength: number, triggerSetId: number | 'default') => {
    const path = lora.file_path || lora.model_name || ''
    const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora'
    let twsWords: string[] = []
    if (triggerSetId !== 'default') {
      const selectedSet = lora.trigger_word_sets?.find((s) => s.id === triggerSetId)
      if (selectedSet) twsWords = selectedSet.words
    }
    addAppliedAsset(role, {
      type: 'lora',
      assetId: lora.id,
      name: lora.description || filename,
      tags: twsWords,
      loraPromptString: `<lora:${filename}:${strength.toFixed(1)}>`,
    })
    setRoleCollapsed(role, false)
  }

  const handleAddTagSetAsset = (role: string, ts: TagSet) => {
    handleAddTagSetAssetInternal(role, ts)
  }

  const handleAddTagSetAssetInternal = (role: string, ts: TagSet) => {
    addAppliedAsset(role, { type: 'tagset', assetId: ts.id, name: ts.name, tags: ts.tags || [] })
    setOpenAddAssetRole(null)
    setRoleCollapsed(role, false)
  }

  const handleOpenModalPreview = () => {
    const currentImg = store.previewImage || selectedImg
    if (!currentImg) return
    const idx = sortedDisplayImages.indexOf(currentImg)
    setModalPreviewIndex(idx >= 0 ? idx : 0)
    setIsModalPreviewOpen(true)
  }

  return {
    isMobile,
    activePromptTab,
    setActivePromptTab,
    getIsRoleCollapsed,
    setRoleCollapsed,
    qc,
    rescanOpen,
    setRescanOpen,
    selectedSnapshotId,
    setSelectedSnapshotId,
    selectedMasters,
    setSelectedMasters,
    openAddAssetRole,
    setOpenAddAssetRole,
    isSettingsOpen,
    setIsSettingsOpen,
    localComfyUrl,
    setLocalComfyUrl,
    thumbnailTab,
    setThumbnailTab,
    isModalPreviewOpen,
    setIsModalPreviewOpen,
    modalPreviewIndex,
    setModalPreviewIndex,
    selectedLoraForModal,
    setSelectedLoraForModal,
    selectedTriggerSetId,
    setSelectedTriggerSetId,
    loraStrength,
    setLoraStrength,
    isJobModalOpen,
    setIsJobModalOpen,
    sortOrder,
    setSortOrder,
    isPresetOpen,
    setIsPresetOpen,
    newPresetName,
    setNewPresetName,
    isPresetManagerOpen,
    setIsPresetManagerOpen,
    workflowManageMode,
    setWorkflowManageMode,
    isWorkflowMenuOpen,
    setIsWorkflowMenuOpen,
    
    // store properties
    store,
    clientId,
    selectedWorkflowId,
    setSelectedWorkflowId,
    paramValues,
    setParamValues,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    appliedAssets,
    addAppliedAsset,
    removeAppliedAsset,
    toggleAppliedAsset,
    setAppliedAssets,
    comfyUrl,
    setComfyUrl,
    sets,
    updateActiveSet,
    
    // queries & derived state
    workflows,
    workflow,
    snapshots,
    mappingMasters,
    loras,
    tagSets,
    presets,
    comfyObjectInfo,
    displayImages,
    sortedDisplayImages,
    getSetNameForImage,
    sortedSnapshots,
    handlePrevImg,
    handleNextImg,
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
    isSaveModalOpen,
    setIsSaveModalOpen,
    saveSnapshot,
    auditOpen,
    setAuditOpen,
    auditIntent,
    setAuditIntent,
    auditTypes,
    setAuditTypes,
    auditResult,
    auditStatus,
    runAudit,
    uploadModalOpen,
    setUploadModalOpen,
    uploadedJson,
    uploadedFileName,
    dragOver,
    handleFileSelect,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isGeneratingHere,
    totalQueueCount,
    snapshotIdsForDisplay,
    showStrip,
    hasHistory,
    validMappings,
    invalidMappings,
    textMappings,
    paramMappings,
    
    // mutations & handlers
    renameWorkflowMutation,
    copyWorkflowMutation,
    updateWorkflowMutation,
    createPresetMutation,
    updatePresetMutation,
    deletePresetMutation,
    renamePresetMutation,
    reorderPresetsMutation,
    handleCreatePreset,
    handleUpdatePreset,
    handleDeletePreset,
    handleLoadPreset,
    handleLoadSnapshot,
    handleUpdateMapping,
    handleAddLoraAsset,
    handleAddTagSetAsset,
    handleOpenModalPreview,
    handleGenerateSets,
    saveDefaultParamsMutation,
    handleSaveDefaultParams,
    handleResetDefaultParams,
    isConnected,
    isGenerating,
    progress,
    previewImage,
    activeClientId,
    filterOwnSession,
    setFilterOwnSession,
    activeBatch,
    activeSetId,
    addSet,
    removeSet,
    renameSet,
    toggleSetChecked,
    setAllSetsChecked,
    setActiveSetId,
  }
}
