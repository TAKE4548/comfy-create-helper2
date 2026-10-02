import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowPresetsApi } from '../../../api/client'
import type { Workflow, WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import { getInitialParams, healLegacyParamKeys } from './useWorkflowParams'
import { parseToChips, TagChip } from '../../../components/TagChipEditor/useChipParser'
import {
  isRecordEqual,
  normalizeTimestamp,
  isTimestampDifferent,
  isStateEqual,
  type HistoryState,
  type PresetConflictData,
  type UpdatePresetArgs,
} from './presetStateUtils'
import { usePresetHistory } from './usePresetHistory'
import { usePresetConflict } from './usePresetConflict'
import { usePresetAutoSave } from './usePresetAutoSave'
import { usePresetStoreSync } from './usePresetStoreSync'
import { computePresetPatch } from '../services/presetBulkPatcher'
import type { BulkEditPayload } from '../../../components/ProfileBulkEditModal'

// Re-exports for backward compatibility
export { isRecordEqual, normalizeTimestamp, isTimestampDifferent, isStateEqual }
export type { HistoryState, PresetConflictData, UpdatePresetArgs }

export interface UsePresetStateProps {
  selectedWorkflowId: number | null
  workflow: Workflow | undefined
}

export function usePresetState({ selectedWorkflowId, workflow }: UsePresetStateProps) {
  const qc = useQueryClient()
  const store = useGenerationStore()
  const {
    paramValues,
    setParamValues,
    appliedAssets,
    setAppliedAssets,
    batchSize,
    setBatchSize,
    seedMode,
    setSeedMode,
    seed,
    setSeed,
    activeSetId,
    setActiveSetId,
    loadPresetData,
    openPresetIds,
    openPreset,
    setErrorToast,
  } = store

  const storeRef = useRef(store)
  storeRef.current = store

  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false)

  // Saved state and sync tracking
  const lastSavedStateRef = useRef<Record<string | number, HistoryState>>({})
  const isInitialSyncRef = useRef(false)
  const prevWorkflowIdRef = useRef<number | null>(null)
  const presetUpdatedAtRef = useRef<Record<number, string>>({})
  const pendingSaveArgsRef = useRef<UpdatePresetArgs | null>(null)

  // ── Queries ──
  const { data: presets } = useQuery({
    queryKey: ['workflow-presets', selectedWorkflowId],
    queryFn: () => workflowPresetsApi.list(selectedWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: !!selectedWorkflowId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  })

  const presetsRef = useRef<WorkflowPreset[] | undefined>(presets)
  presetsRef.current = presets

  // ── Mutations ──
  const createPresetMutation = useMutation({
    mutationFn: ({
      name,
      paramValues: pv,
      appliedAssets: aa,
      batchSize: bs,
      seedMode: sm,
      seed: sd,
    }: {
      name: string
      paramValues?: Record<string, string>
      appliedAssets?: Record<string, AppliedAsset[]>
      batchSize?: number
      seedMode?: 'random' | 'fixed'
      seed?: number
    }) =>
      workflowPresetsApi.create({
        workflow_id: selectedWorkflowId!,
        name,
        param_values: pv !== undefined ? pv : paramValues,
        applied_assets: aa !== undefined ? aa : appliedAssets,
        batch_size: bs !== undefined ? bs : batchSize,
        seed_mode: sm !== undefined ? sm : seedMode,
        seed: sd !== undefined ? sd : seed,
      }),
    onSuccess: (newPreset) => {
      autoSave.clearTimer()
      if (newPreset?.id && selectedWorkflowId) {
        const defaultParams = workflow ? getInitialParams(workflow) : {}
        const mergedParamValues = healLegacyParamKeys({ ...defaultParams, ...(newPreset.param_values || {}) })

        if (newPreset.updated_at) {
          presetUpdatedAtRef.current[newPreset.id] = newPreset.updated_at
        }
        lastSavedStateRef.current[newPreset.id] = {
          paramValues: mergedParamValues,
          appliedAssets: newPreset.applied_assets || {},
          batchSize: newPreset.batch_size ?? 1,
          seedMode: (newPreset.seed_mode as 'random' | 'fixed') || 'random',
          seed: newPreset.seed !== undefined ? newPreset.seed : 42,
        }

        qc.setQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId], (old) => {
          if (!old) return [newPreset]
          if (old.some((p) => p.id === newPreset.id)) {
            return old.map((p) => (p.id === newPreset.id ? newPreset : p))
          }
          return [...old, newPreset]
        })

        loadPresetData?.(newPreset, defaultParams)
        openPreset?.(newPreset.id)
      }
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setIsPresetOpen(false)
      setNewPresetName('')
    },
  })

  const updatePresetMutation = useMutation({
    mutationFn: (args: {
      id: number
      name: string
      param_values?: Record<string, string>
      applied_assets?: Record<string, any[]>
      batch_size?: number
      seed_mode?: string
      seed?: number
      base_updated_at?: string
    }) => {
      const currentStore = storeRef.current
      const isActive = String(args.id) === String(currentStore.activeSetId)
      const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(args.id)) : undefined
      const fallbackPreset = !isActive && !targetSet ? (presetsRef.current || presets)?.find((p) => p.id === args.id) : undefined

      return workflowPresetsApi.update(args.id, {
        name: args.name,
        param_values: args.param_values !== undefined
          ? args.param_values
          : (isActive ? currentStore.paramValues : (targetSet?.paramValues || fallbackPreset?.param_values)),
        applied_assets: args.applied_assets !== undefined
          ? args.applied_assets
          : (isActive ? currentStore.appliedAssets : (targetSet?.appliedAssets || fallbackPreset?.applied_assets)),
        batch_size: args.batch_size !== undefined
          ? args.batch_size
          : (isActive ? currentStore.batchSize : (targetSet?.batchSize ?? fallbackPreset?.batch_size)),
        seed_mode: args.seed_mode !== undefined
          ? args.seed_mode
          : (isActive ? currentStore.seedMode : (targetSet?.seedMode || fallbackPreset?.seed_mode)),
        seed: args.seed !== undefined
          ? args.seed
          : (isActive ? currentStore.seed : (targetSet?.seed ?? fallbackPreset?.seed)),
        base_updated_at: args.base_updated_at,
      })
    },
    onSuccess: (updatedPreset, variables) => {
      if (updatedPreset?.id) {
        presetUpdatedAtRef.current[updatedPreset.id] = updatedPreset.updated_at
        const currentStore = storeRef.current
        const isActive = String(updatedPreset.id) === String(currentStore.activeSetId)
        const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(updatedPreset.id)) : undefined

        lastSavedStateRef.current[updatedPreset.id] = {
          paramValues: updatedPreset.param_values ?? (variables.param_values !== undefined ? variables.param_values : (isActive ? currentStore.paramValues : (targetSet?.paramValues || {}))),
          appliedAssets: (updatedPreset.applied_assets ?? (variables.applied_assets !== undefined ? variables.applied_assets : (isActive ? currentStore.appliedAssets : (targetSet?.appliedAssets || {})))) as any,
          batchSize: updatedPreset.batch_size ?? (variables.batch_size !== undefined ? variables.batch_size : (isActive ? currentStore.batchSize : (targetSet?.batchSize ?? 1))),
          seedMode: ((updatedPreset.seed_mode ?? (variables.seed_mode !== undefined ? variables.seed_mode : (isActive ? currentStore.seedMode : (targetSet?.seedMode || 'random')))) as any),
          seed: updatedPreset.seed ?? (variables.seed !== undefined ? variables.seed : (isActive ? currentStore.seed : (targetSet?.seed ?? 42))),
        }
        qc.setQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId], (old) => {
          if (!old) return old
          return old.map((p) => (p.id === updatedPreset.id ? updatedPreset : p))
        })
      }
    },
    onError: (err: any, variables) => {
      if (err?.message?.includes('409') || err?.status === 409) {
        qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
        const serverPreset = (presetsRef.current || presets)?.find((p) => p.id === variables.id)
        if (serverPreset) {
          const currentStore = storeRef.current
          const isActive = String(variables.id) === String(currentStore.activeSetId)
          const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(variables.id)) : undefined

          conflict.setConflictData({
            serverPreset,
            localDraft: {
              name: variables.name,
              paramValues: variables.param_values || (isActive ? currentStore.paramValues : (targetSet?.paramValues || {})),
              appliedAssets: variables.applied_assets || (isActive ? currentStore.appliedAssets : (targetSet?.appliedAssets || {})),
              batchSize: variables.batch_size ?? (isActive ? currentStore.batchSize : (targetSet?.batchSize ?? 1)),
              seedMode: ((variables.seed_mode as 'random' | 'fixed') || (isActive ? currentStore.seedMode : (targetSet?.seedMode || 'random'))),
              seed: variables.seed ?? (isActive ? currentStore.seed : (targetSet?.seed ?? 42)),
            },
          })
        }
      }
    },
    onSettled: () => {
      if (pendingSaveArgsRef.current) {
        const nextArgs = pendingSaveArgsRef.current
        pendingSaveArgsRef.current = null
        const latestBaseUpdatedAt = presetUpdatedAtRef.current[nextArgs.id] || nextArgs.base_updated_at
        updatePresetMutation.mutate({
          ...nextArgs,
          base_updated_at: latestBaseUpdatedAt,
        })
      }
    },
  })

  const performUpdatePreset = useCallback((args: UpdatePresetArgs) => {
    if (updatePresetMutation.isPending) {
      pendingSaveArgsRef.current = args
      return
    }
    updatePresetMutation.mutate({
      id: args.id,
      name: args.name,
      param_values: args.param_values,
      applied_assets: args.applied_assets,
      batch_size: args.batch_size,
      seed_mode: args.seed_mode,
      seed: args.seed,
      base_updated_at: args.base_updated_at,
    })
  }, [updatePresetMutation])

  const deletePresetMutation = useMutation({
    mutationFn: (id: number) => workflowPresetsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const bulkDeletePresetsMutation = useMutation({
    mutationFn: (ids: number[]) => workflowPresetsApi.bulkDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const renamePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => workflowPresetsApi.update(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => workflowPresetsApi.reorder(ordered_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  // ── Load Preset Handler ──
  const handleLoadPreset = useCallback((preset: WorkflowPreset) => {
    if (preset.updated_at) {
      presetUpdatedAtRef.current[preset.id] = preset.updated_at
    }
    const defaultParams = workflow ? getInitialParams(workflow) : {}
    const mergedParamValues = healLegacyParamKeys({ ...defaultParams, ...(preset.param_values || {}) })

    lastSavedStateRef.current[preset.id] = {
      paramValues: mergedParamValues,
      appliedAssets: preset.applied_assets || {},
      batchSize: preset.batch_size ?? 1,
      seedMode: (preset.seed_mode as 'random' | 'fixed') || 'random',
      seed: preset.seed !== undefined ? preset.seed : 42,
    }

    if (loadPresetData) {
      loadPresetData(preset, defaultParams)
    } else {
      setActiveSetId(preset.id)
      if (openPresetIds && !openPresetIds.includes(preset.id)) {
        openPreset?.(preset.id)
      }
    }
    setIsPresetOpen(false)
  }, [workflow, loadPresetData, setActiveSetId, openPresetIds, openPreset])

  // ── Sub-hooks ──
  const currentState: HistoryState = {
    paramValues,
    appliedAssets,
    batchSize,
    seedMode,
    seed,
  }

  const history = usePresetHistory({
    activeSetId,
    currentState,
    onApplyState: useCallback((st: HistoryState) => {
      setParamValues(st.paramValues)
      setAppliedAssets(st.appliedAssets)
      setBatchSize(st.batchSize)
      setSeedMode(st.seedMode)
      setSeed(st.seed)
    }, [setParamValues, setAppliedAssets, setBatchSize, setSeedMode, setSeed]),
  })

  const conflict = usePresetConflict({
    onLoadPreset: handleLoadPreset,
    onUpdatePreset: (args) => updatePresetMutation.mutate(args),
    onCreatePreset: (name, draft) => {
      createPresetMutation.mutate({
        name,
        paramValues: draft.paramValues,
        appliedAssets: draft.appliedAssets,
        batchSize: draft.batchSize,
        seedMode: draft.seedMode,
        seed: draft.seed,
      })
    },
  })

  const autoSave = usePresetAutoSave({
    selectedWorkflowId,
    activeSetId,
    currentState,
    presets,
    presetsRef,
    isInitialSyncRef,
    lastSavedStateRef,
    presetUpdatedAtRef,
    onPerformUpdatePreset: performUpdatePreset,
    onRecordHistory: history.recordHistory,
  })

  const handleCreatePreset = useCallback((name?: string, copySourceId?: string | number) => {
    const finalName = name ?? newPresetName
    if (!finalName.trim() || !selectedWorkflowId) return
    const currentStore = storeRef.current
    const currentPresets = presetsRef.current

    if (copySourceId === undefined) {
      createPresetMutation.mutate({
        name: finalName.trim(),
        paramValues: currentStore.paramValues,
        appliedAssets: currentStore.appliedAssets,
        batchSize: currentStore.batchSize,
        seedMode: currentStore.seedMode,
        seed: currentStore.seed,
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
      if (String(copySourceId) === String(currentStore.activeSetId)) {
        createPresetMutation.mutate({
          name: finalName.trim(),
          paramValues: currentStore.paramValues,
          appliedAssets: currentStore.appliedAssets,
          batchSize: currentStore.batchSize,
          seedMode: currentStore.seedMode,
          seed: currentStore.seed,
        })
      } else {
        const source = currentPresets?.find((p) => String(p.id) === String(copySourceId))
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
            paramValues: currentStore.paramValues,
            appliedAssets: currentStore.appliedAssets,
            batchSize: currentStore.batchSize,
            seedMode: currentStore.seedMode,
            seed: currentStore.seed,
          })
        }
      }
    }
  }, [newPresetName, selectedWorkflowId, createPresetMutation, workflow])

  const storeSync = usePresetStoreSync({
    selectedWorkflowId,
    workflow,
    presets,
    presetsRef,
    isInitialSyncRef,
    prevWorkflowIdRef,
    lastSavedStateRef,
    presetUpdatedAtRef,
    setConflictData: conflict.setConflictData,
    handleLoadPreset,
    handleCreatePreset,
    flushAutoSave: autoSave.flushAutoSave,
    isCreatePending: createPresetMutation.isPending,
  })

  // ── Bulk Operations State ──
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false)
  const [bulkTargetIds, setBulkTargetIds] = useState<number[]>([])
  const [isBulkApplying, setIsBulkApplying] = useState(false)

  const handleBulkDeleteRequest = (ids: number[]) => {
    setBulkTargetIds(ids)
    setIsBulkDeleteConfirmOpen(true)
  }

  const handleBulkDeleteConfirm = () => {
    bulkDeletePresetsMutation.mutate(bulkTargetIds, {
      onSuccess: () => {
        setIsBulkDeleteConfirmOpen(false)
        setBulkTargetIds([])
      },
    })
  }

  const handleBulkEditRequest = (ids: number[]) => {
    setBulkTargetIds(ids)
    setIsBulkEditOpen(true)
  }

  const handleBulkEditApply = async (payload: BulkEditPayload) => {
    const latestPresets = qc.getQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId]) || presets
    const targetIds = payload.targetPresetIds && payload.targetPresetIds.length > 0 ? payload.targetPresetIds : bulkTargetIds
    if (!latestPresets || targetIds.length === 0) return
    setIsBulkApplying(true)
    try {
      const selectedPresets = latestPresets.filter((p) => targetIds.includes(p.id))
      const updatedResults = await Promise.all(
        selectedPresets.map(async (preset) => {
          const patch = computePresetPatch(preset, payload)
          const res = await workflowPresetsApi.update(preset.id, patch)
          if (res?.id) {
            presetUpdatedAtRef.current[res.id] = res.updated_at
          }
          return res
        })
      )

      const defaultParams = workflow ? getInitialParams(workflow) : {}
      const resultMap = new Map(updatedResults.map((p) => [p.id, p]))

      // 1. 開いている sets 配列内に含まれる更新プリセットを一括同期
      const currentSets = storeRef.current.sets || []
      const updatedSets = currentSets.map((s) => {
        const updatedPreset = resultMap.get(Number(s.id))
        if (!updatedPreset) return s

        const mergedParams = { ...defaultParams, ...(updatedPreset.param_values || {}) }
        const chips: Record<string, TagChip[]> = {}
        for (const [role, val] of Object.entries(mergedParams)) {
          if (val) {
            chips[role] = parseToChips(val, storeRef.current.isAnimaMode ?? false)
          }
        }
        return {
          ...s,
          name: updatedPreset.name || s.name,
          paramValues: mergedParams,
          appliedAssets: updatedPreset.applied_assets || {},
          batchSize: updatedPreset.batch_size ?? s.batchSize,
          seedMode: (updatedPreset.seed_mode as 'random' | 'fixed') || s.seedMode,
          seed: updatedPreset.seed !== undefined ? updatedPreset.seed : s.seed,
          promptChips: chips,
        }
      })
      storeRef.current.setSets?.(updatedSets)

      // 2. アクティブプリセットが含まれていた場合、個別ステートおよび promptChips を即時同期
      const activeUpdatedPreset = updatedResults.find(
        (p) => String(p.id) === String(activeSetId)
      )
      if (activeUpdatedPreset) {
        const mergedParams = { ...defaultParams, ...(activeUpdatedPreset.param_values || {}) }
        const initialPromptChips: Record<string, TagChip[]> = {}
        for (const [role, val] of Object.entries(mergedParams)) {
          if (val) {
            initialPromptChips[role] = parseToChips(val, storeRef.current.isAnimaMode ?? false)
          }
        }

        lastSavedStateRef.current[activeUpdatedPreset.id] = {
          paramValues: mergedParams,
          appliedAssets: activeUpdatedPreset.applied_assets || {},
          batchSize: activeUpdatedPreset.batch_size ?? 1,
          seedMode: (activeUpdatedPreset.seed_mode as 'random' | 'fixed') || 'random',
          seed: activeUpdatedPreset.seed !== undefined ? activeUpdatedPreset.seed : 42,
        }

        setParamValues(mergedParams)
        setAppliedAssets(activeUpdatedPreset.applied_assets || {})
        if (activeUpdatedPreset.batch_size !== undefined) {
          setBatchSize(activeUpdatedPreset.batch_size)
        }
        if (activeUpdatedPreset.seed_mode) {
          setSeedMode(activeUpdatedPreset.seed_mode as 'random' | 'fixed')
        }
        if (activeUpdatedPreset.seed !== undefined) {
          setSeed(activeUpdatedPreset.seed)
        }

        storeRef.current.setAllPromptChips?.(initialPromptChips)
      }

      qc.setQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId], (old) => {
        if (!old) return old
        const resMap = new Map(updatedResults.map((p) => [p.id, p]))
        return old.map((p) => resMap.get(p.id) ?? p)
      })

      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setErrorToast?.({
        message: `${selectedPresets.length} 件のプリセットに適用しました`,
        type: 'success',
      })
    } catch (err: any) {
      setErrorToast?.({
        message: err?.message || '一括適用の保存に失敗しました',
        type: 'error',
      })
      throw err
    } finally {
      setIsBulkApplying(false)
    }
  }

  const handleUpdatePreset = (id: number, name: string) => {
    if (!selectedWorkflowId) return
    if (confirm(`現在の設定でプリセット「${name}」を上書き保存しますか？`)) {
      const currentStore = storeRef.current
      const isActive = String(id) === String(currentStore.activeSetId)
      const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(id)) : undefined
      const baseUpdatedAt = presetUpdatedAtRef.current[id]

      if (isActive) {
        updatePresetMutation.mutate({
          id,
          name,
          param_values: currentStore.paramValues,
          applied_assets: currentStore.appliedAssets,
          batch_size: currentStore.batchSize,
          seed_mode: currentStore.seedMode,
          seed: currentStore.seed,
          base_updated_at: baseUpdatedAt,
        })
      } else if (targetSet) {
        updatePresetMutation.mutate({
          id,
          name,
          param_values: targetSet.paramValues,
          applied_assets: targetSet.appliedAssets,
          batch_size: targetSet.batchSize,
          seed_mode: targetSet.seedMode,
          seed: targetSet.seed,
          base_updated_at: baseUpdatedAt,
        })
      } else {
        const fallbackPreset = (presetsRef.current || presets)?.find((p) => p.id === id)
        updatePresetMutation.mutate({
          id,
          name,
          param_values: fallbackPreset?.param_values,
          applied_assets: fallbackPreset?.applied_assets,
          batch_size: fallbackPreset?.batch_size,
          seed_mode: fallbackPreset?.seed_mode,
          seed: fallbackPreset?.seed,
          base_updated_at: baseUpdatedAt,
        })
      }
    }
  }

  const handleDeletePreset = (id: number) => {
    if (confirm('このプリセットを削除しますか？')) {
      deletePresetMutation.mutate(id)
    }
  }

  return {
    presets,
    conflictData: conflict.conflictData,
    setConflictData: conflict.setConflictData,
    handleResolveConflictUseServer: conflict.handleResolveConflictUseServer,
    handleResolveConflictOverwrite: conflict.handleResolveConflictOverwrite,
    handleResolveConflictSaveAsNew: conflict.handleResolveConflictSaveAsNew,
    createPresetMutation,
    updatePresetMutation,
    deletePresetMutation,
    bulkDeletePresetsMutation,
    renamePresetMutation,
    reorderPresetsMutation,
    isBulkDeleteConfirmOpen,
    setIsBulkDeleteConfirmOpen,
    isBulkEditOpen,
    setIsBulkEditOpen,
    bulkTargetIds,
    isBulkApplying,
    handleBulkDeleteRequest,
    handleBulkDeleteConfirm,
    handleBulkEditRequest,
    handleBulkEditApply,
    handleCreatePreset,
    handleUpdatePreset,
    handleDeletePreset,
    handleLoadPreset,
    handleSelectPresetTab: storeSync.handleSelectPresetTab,
    isPresetOpen,
    setIsPresetOpen,
    newPresetName,
    setNewPresetName,
    isPresetManagerOpen,
    setIsPresetManagerOpen,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    flushAutoSave: autoSave.flushAutoSave,
  }
}
