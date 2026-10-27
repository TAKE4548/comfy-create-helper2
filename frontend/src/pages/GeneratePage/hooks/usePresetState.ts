import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowPresetsApi } from '../../../api/client'
import type { Workflow, WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import { createPresetTabClosePlan, type PresetTabCloseMode, type PresetId, type PresetTabClosePlan } from '../../../store/presetTabClose'
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

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export interface UsePresetStateProps {
  selectedWorkflowId: number | null
  workflow: Workflow | undefined
}

export function usePresetState({ selectedWorkflowId, workflow }: UsePresetStateProps) {
  const promptRoles = workflow?.mappings.flatMap((mapping) =>
    mapping.role && mapping.input_type === 'textarea' ? [mapping.role] : []
  ) ?? []
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
  type QueuedUpdatePresetArgs = UpdatePresetArgs & { workflow_id?: number; generation_id?: number }
  const saveQueueRef = useRef<Array<{ args: QueuedUpdatePresetArgs; resolve: () => void; reject: (error: unknown) => void; fingerprint: string }>>([])
  const saveQueueRunningRef = useRef(false)
  const saveDedupeRef = useRef(new Map<string, Promise<void>>())
  const inFlightPresetRequestsRef = useRef(new Set<Promise<unknown>>())
  const closeGenerationRef = useRef(0)
  const closePendingRef = useRef(false)
  const bulkApplyingRef = useRef(false)
  const [isPresetTabsClosing, setIsPresetTabsClosing] = useState(false)
  const lifecycleGenerationRef = useRef(0)
  useEffect(() => {
    lifecycleGenerationRef.current += 1
    closeGenerationRef.current += 1
    closePendingRef.current = false
    setIsPresetTabsClosing(false)
    return () => { lifecycleGenerationRef.current += 1; closeGenerationRef.current += 1; closePendingRef.current = false }
  }, [selectedWorkflowId])

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
    }) => {
      if (closePendingRef.current) throw new Error('プリセットタブを保存中です。')
      return workflowPresetsApi.create({
        workflow_id: selectedWorkflowId!,
        name,
        param_values: pv !== undefined ? pv : paramValues,
        applied_assets: aa !== undefined ? aa : appliedAssets,
        batch_size: bs !== undefined ? bs : batchSize,
        seed_mode: sm !== undefined ? sm : seedMode,
        seed: sd !== undefined ? sd : seed,
      })
    },
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

        loadPresetData?.(newPreset, defaultParams, promptRoles)
        openPreset?.(newPreset.id)
      }
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setIsPresetOpen(false)
      setNewPresetName('')
    },
  })

  const updatePresetMutation = useMutation({
    mutationFn: async (args: {
      id: number
      name: string
      param_values?: Record<string, string>
      applied_assets?: Record<string, any[]>
      batch_size?: number
      seed_mode?: string
      seed?: number
      base_updated_at?: string
      workflow_id?: number
      generation_id?: number
    }) => {
      if (closePendingRef.current && args.generation_id === undefined) throw new Error('プリセットタブを保存中です。')
      const currentStore = storeRef.current
      const isActive = String(args.id) === String(currentStore.activeSetId)
      const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(args.id)) : undefined
      const fallbackPreset = !isActive && !targetSet ? (presetsRef.current || presets)?.find((p) => p.id === args.id) : undefined

      const request = workflowPresetsApi.update(args.id, {
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
      inFlightPresetRequestsRef.current.add(request)
      try { return await request } finally { inFlightPresetRequestsRef.current.delete(request) }
    },
    onMutate: (variables) => ({ workflowId: variables.workflow_id ?? selectedWorkflowId,
      generationId: variables.generation_id ?? lifecycleGenerationRef.current }),
    onSuccess: (updatedPreset, variables, context) => {
      const workflowId = context?.workflowId ?? variables.workflow_id ?? selectedWorkflowId
      if (updatedPreset?.id) {
        const sameGeneration = workflowId === selectedWorkflowId &&
          (context?.generationId === undefined || context.generationId === lifecycleGenerationRef.current)
        if (sameGeneration) presetUpdatedAtRef.current[updatedPreset.id] = updatedPreset.updated_at
        const currentStore = storeRef.current
        const isActive = String(updatedPreset.id) === String(currentStore.activeSetId)
        const targetSet = !isActive ? currentStore.sets.find((s) => String(s.id) === String(updatedPreset.id)) : undefined

        if (sameGeneration) lastSavedStateRef.current[updatedPreset.id] = structuredClone({
          paramValues: updatedPreset.param_values ?? (variables.param_values !== undefined ? variables.param_values : (isActive ? currentStore.paramValues : (targetSet?.paramValues || {}))),
          appliedAssets: (updatedPreset.applied_assets ?? (variables.applied_assets !== undefined ? variables.applied_assets : (isActive ? currentStore.appliedAssets : (targetSet?.appliedAssets || {})))) as any,
          batchSize: updatedPreset.batch_size ?? (variables.batch_size !== undefined ? variables.batch_size : (isActive ? currentStore.batchSize : (targetSet?.batchSize ?? 1))),
          seedMode: ((updatedPreset.seed_mode ?? (variables.seed_mode !== undefined ? variables.seed_mode : (isActive ? currentStore.seedMode : (targetSet?.seedMode || 'random')))) as any),
          seed: updatedPreset.seed ?? (variables.seed !== undefined ? variables.seed : (isActive ? currentStore.seed : (targetSet?.seed ?? 42))),
        })
        qc.setQueryData<WorkflowPreset[]>(['workflow-presets', workflowId], (old) => {
          if (!old) return old
          return old.map((p) => (p.id === updatedPreset.id ? updatedPreset : p))
        })
      }
    },
    onError: (err: any, variables, context) => {
      const workflowId = context?.workflowId ?? variables.workflow_id ?? selectedWorkflowId
      const sameGeneration = workflowId === selectedWorkflowId &&
        (context?.generationId === undefined || context.generationId === lifecycleGenerationRef.current)
      if (err?.message?.includes('409') || err?.status === 409) {
        qc.invalidateQueries({ queryKey: ['workflow-presets', workflowId] })
        if (!sameGeneration) return
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
      } else if (sameGeneration) {
        storeRef.current.setErrorToast?.({ message: err?.message || 'プリセットの保存に失敗しました。', type: 'error' })
      }
    },
  })

  const enqueuePresetSave = useCallback((args: UpdatePresetArgs): Promise<void> => {
    const snapshot: QueuedUpdatePresetArgs = structuredClone({ ...args, workflow_id: selectedWorkflowId ?? undefined, generation_id: lifecycleGenerationRef.current })
    const fingerprint = `${snapshot.id}:${stableSerialize(snapshot)}`
    const existing = saveDedupeRef.current.get(fingerprint)
    if (existing) return existing
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
    saveDedupeRef.current.set(fingerprint, promise)
    saveQueueRef.current.push({ args: snapshot, resolve, reject, fingerprint })
    const pump = async () => {
      if (saveQueueRunningRef.current) return
      saveQueueRunningRef.current = true
      try {
        while (saveQueueRef.current.length) {
          const entry = saveQueueRef.current[0]
          try {
            const base = presetUpdatedAtRef.current[entry.args.id] || entry.args.base_updated_at
            await updatePresetMutation.mutateAsync({ ...entry.args, base_updated_at: base })
            entry.resolve()
            saveQueueRef.current.shift()
            saveDedupeRef.current.delete(entry.fingerprint)
          } catch (error) {
            for (const pending of saveQueueRef.current.splice(0)) {
              pending.reject(error)
              saveDedupeRef.current.delete(pending.fingerprint)
            }
            break
          }
        }
      } finally { saveQueueRunningRef.current = false }
    }
    void pump()
    return promise
  }, [updatePresetMutation, selectedWorkflowId])

  const performUpdatePreset = useCallback((args: UpdatePresetArgs) => {
    void enqueuePresetSave(args).catch(() => { /* The conflict handler owns user-visible save failures. */ })
  }, [enqueuePresetSave])

  const deletePresetMutation = useMutation({
    mutationFn: (id: number) => {
      if (closePendingRef.current) throw new Error('プリセットタブを保存中です。')
      return workflowPresetsApi.delete(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const bulkDeletePresetsMutation = useMutation({
    mutationFn: (ids: number[]) => {
      if (closePendingRef.current) throw new Error('プリセットタブを保存中です。')
      return workflowPresetsApi.bulkDelete(ids)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const renamePresetMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => {
      if (closePendingRef.current) throw new Error('プリセットタブを保存中です。')
      return workflowPresetsApi.update(id, { name })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
  })

  const reorderPresetsMutation = useMutation({
    mutationFn: (ordered_ids: number[]) => {
      if (closePendingRef.current) throw new Error('プリセットタブを保存中です。')
      return workflowPresetsApi.reorder(ordered_ids)
    },
    onSuccess: (_result, orderedIds) => {
      const sets = storeRef.current.sets || []
      const rank = new Map(orderedIds.map((id, index) => [String(id), index]))
      storeRef.current.setSets?.([...sets].sort((a, b) => (rank.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)))
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
      loadPresetData(preset, defaultParams, promptRoles)
    } else {
      setActiveSetId(preset.id)
      if (openPresetIds && !openPresetIds.includes(preset.id)) {
        openPreset?.(preset.id)
      }
    }
    setIsPresetOpen(false)
  }, [workflow, promptRoles, loadPresetData, setActiveSetId, openPresetIds, openPreset])

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
    onUpdatePreset: performUpdatePreset,
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

  const preparePresetTabsClose = useCallback(async (plan: PresetTabClosePlan): Promise<boolean> => {
    const abort = (message: string) => { setErrorToast?.({ message, type: 'error' }); return false }
    if (!isInitialSyncRef.current || !selectedWorkflowId) return abort('プリセットの初期同期が完了していません。')
    if (closePendingRef.current || bulkApplyingRef.current || createPresetMutation.isPending || deletePresetMutation.isPending || bulkDeletePresetsMutation.isPending || renamePresetMutation.isPending || reorderPresetsMutation.isPending) return abort('別のプリセット操作中はタブを閉じられません。')
    const generation = lifecycleGenerationRef.current
    const current = useGenerationStore.getState()
    const visibleIds = current.sets.filter((item) => current.openPresetIds.map(String).includes(String(item.id))).map((item) => item.id)
    if (current.selectedWorkflowId !== plan.workflowId || plan.workflowId !== selectedWorkflowId ||
      visibleIds.length !== plan.orderedOpenIds.length || visibleIds.some((id, index) => String(id) !== String(plan.orderedOpenIds[index]))) return abort('タブの並びまたは選択状態が変わりました。もう一度操作してください。')
    if (conflict.conflictData && plan.targetIds.some((id) => String(id) === String(conflict.conflictData?.serverPreset.id))) return abort('未解決の競合があるためタブを閉じられません。')
    const snapshots = new Map<string, HistoryState>()
    const activeBufferSnapshot: HistoryState = structuredClone({ paramValues: current.paramValues, appliedAssets: current.appliedAssets,
      batchSize: current.batchSize, seedMode: current.seedMode, seed: current.seed })
    for (const id of plan.targetIds) {
      const set = current.sets.find((item) => String(item.id) === String(id))
      const preset = presetsRef.current?.find((item) => String(item.id) === String(id))
      const baseline = lastSavedStateRef.current[id]
      if (!set || !preset || !baseline) return abort('対象プリセットまたは保存確認済み状態が見つかりません。')
      snapshots.set(String(id), structuredClone(String(id) === String(current.activeSetId) ? {
        paramValues: current.paramValues, appliedAssets: current.appliedAssets, batchSize: current.batchSize,
        seedMode: current.seedMode, seed: current.seed,
      } : {
        paramValues: set.paramValues, appliedAssets: set.appliedAssets, batchSize: set.batchSize,
        seedMode: set.seedMode, seed: set.seed,
      }))
    }
    closePendingRef.current = true
    const closeGeneration = ++closeGenerationRef.current
    setIsPresetTabsClosing(true)
    let prepared = false
    let orderChangedDuringClose = false
    const unsubscribe = useGenerationStore.subscribe((nextState) => {
      const nextVisible = nextState.sets.filter((item) => nextState.openPresetIds.map(String).includes(String(item.id))).map((item) => String(item.id))
      const expected = plan.orderedOpenIds.map(String)
      orderChangedDuringClose ||= nextVisible.length !== expected.length || nextVisible.some((id, index) => id !== expected[index])
    })
    try {
      autoSave.clearTimer()
      if (current.activeSetId !== null) {
        current.updateActiveSet({ paramValues: current.paramValues, appliedAssets: current.appliedAssets,
          promptChips: current.promptChips, batchSize: current.batchSize, seedMode: current.seedMode, seed: current.seed })
      }
      await Promise.all([...Array.from(saveDedupeRef.current.values()), ...Array.from(inFlightPresetRequestsRef.current)])
      if (generation !== lifecycleGenerationRef.current || closeGeneration !== closeGenerationRef.current) return false
      for (const id of plan.targetIds) {
        if (generation !== lifecycleGenerationRef.current || closeGeneration !== closeGenerationRef.current) return false
        const state = snapshots.get(String(id))!
        const baseline = lastSavedStateRef.current[id]
        if (!isStateEqual(state, baseline)) {
          const preset = presetsRef.current!.find((item) => String(item.id) === String(id))!
          await enqueuePresetSave({ id: preset.id, name: preset.name, param_values: state.paramValues,
            applied_assets: state.appliedAssets, batch_size: state.batchSize, seed_mode: state.seedMode,
            seed: state.seed, base_updated_at: presetUpdatedAtRef.current[preset.id] || preset.updated_at })
          if (generation !== lifecycleGenerationRef.current || closeGeneration !== closeGenerationRef.current) return false
        }
      }
      await Promise.all([...Array.from(saveDedupeRef.current.values()), ...Array.from(inFlightPresetRequestsRef.current)])
      if (generation !== lifecycleGenerationRef.current || closeGeneration !== closeGenerationRef.current) return false
      const latest = useGenerationStore.getState()
      if (generation !== lifecycleGenerationRef.current || closeGeneration !== closeGenerationRef.current ||
        latest.selectedWorkflowId !== plan.workflowId || String(latest.activeSetId) !== String(plan.activeSetId)) return abort('保存中にworkflowまたは選択タブが変わりました。もう一度操作してください。')
      const latestVisible = latest.sets.filter((item) => latest.openPresetIds.map(String).includes(String(item.id))).map((item) => item.id)
      if (orderChangedDuringClose || latestVisible.length !== plan.orderedOpenIds.length || latestVisible.some((id, index) => String(id) !== String(plan.orderedOpenIds[index]))) return abort('保存中にタブの並びが変わりました。もう一度操作してください。')
      for (const [id, snapshot] of snapshots) {
        const live = latest.sets.find((item) => String(item.id) === id)
        const now: HistoryState | undefined = live ? (String(id) === String(latest.activeSetId) ? {
          paramValues: latest.paramValues, appliedAssets: latest.appliedAssets, batchSize: latest.batchSize,
          seedMode: latest.seedMode, seed: latest.seed,
        } : { paramValues: live.paramValues, appliedAssets: live.appliedAssets, batchSize: live.batchSize,
          seedMode: live.seedMode, seed: live.seed }) : undefined
        if (!now || !isStateEqual(snapshot, now)) return abort('保存中にプリセット内容が編集されました。もう一度操作してください。')
      }
      const activeAfter: HistoryState = { paramValues: latest.paramValues, appliedAssets: latest.appliedAssets,
        batchSize: latest.batchSize, seedMode: latest.seedMode, seed: latest.seed }
      if (!isStateEqual(activeBufferSnapshot, activeAfter)) return abort('保存中にエディター内容が編集されました。もう一度操作してください。')
      prepared = true
      return true
    } catch (error) {
      if (generation === lifecycleGenerationRef.current && closeGeneration === closeGenerationRef.current) {
        const cause = error instanceof Error ? error.message : String(error)
        const isConflict = /\b409\b/.test(cause)
        const failedEditor = useGenerationStore.getState()
        const activeEditorWasTarget = plan.targetIds.some((id) => String(id) === String(failedEditor.activeSetId))
        if (activeEditorWasTarget && failedEditor.activeSetId !== null && failedEditor.activeSetId !== undefined) {
          autoSave.suppressAutomaticRetry(failedEditor.activeSetId, {
            paramValues: failedEditor.paramValues, appliedAssets: failedEditor.appliedAssets,
            batchSize: failedEditor.batchSize, seedMode: failedEditor.seedMode, seed: failedEditor.seed,
          })
        }
        setErrorToast?.({ message: isConflict
          ? `${cause} 競合を解決してから再操作してください。`
          : `${cause} 下書きは保持されています。もう一度タブを閉じて保存を再試行してください。`, type: 'error' })
      }
      return false
    } finally {
      unsubscribe()
      if (!prepared && closeGeneration === closeGenerationRef.current) {
        closePendingRef.current = false
        setIsPresetTabsClosing(false)
      }
    }
  }, [selectedWorkflowId, presetsRef, lastSavedStateRef, presetUpdatedAtRef, createPresetMutation.isPending,
    deletePresetMutation.isPending, renamePresetMutation.isPending, reorderPresetsMutation.isPending,
    conflict.conflictData, autoSave, enqueuePresetSave, setErrorToast])

  const handleClosePresetTabs = useCallback(async (triggerId: PresetId, mode: PresetTabCloseMode): Promise<boolean> => {
    if (closePendingRef.current) return false
    const plan = createPresetTabClosePlan(useGenerationStore.getState(), triggerId, mode)
    if (!plan || !(await preparePresetTabsClose(plan))) return false
    try { return useGenerationStore.getState().applyPresetTabClose(plan) }
    finally {
      closePendingRef.current = false
      setIsPresetTabsClosing(false)
    }
  }, [preparePresetTabsClose])

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
    bulkApplyingRef.current = true
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
          if (promptRoles.includes(role) && val) {
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
          if (promptRoles.includes(role) && val) {
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
      bulkApplyingRef.current = false
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
        performUpdatePreset({
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
        performUpdatePreset({
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
        performUpdatePreset({
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
    handleClosePresetTabs,
    isPresetTabsClosing,
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
