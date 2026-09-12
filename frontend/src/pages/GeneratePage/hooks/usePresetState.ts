import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowPresetsApi } from '../../../api/client'
import type { Workflow, WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import { getInitialParams } from './useWorkflowParams'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { prependToPrompt, appendToPrompt } from '../../../utils/promptUtils'
import { parseToChips, TagChip } from '../../../components/TagChipEditor/useChipParser'

export interface HistoryState {
  paramValues: Record<string, string>
  appliedAssets: Record<string, AppliedAsset[]>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
}

export interface PresetConflictData {
  serverPreset: WorkflowPreset
  localDraft: {
    name: string
    paramValues: Record<string, string>
    appliedAssets: Record<string, any[]>
    batchSize: number
    seedMode: 'random' | 'fixed'
    seed: number
  }
}

export interface UsePresetStateProps {
  selectedWorkflowId: number | null
  workflow: Workflow | undefined
}

export function usePresetState({
  selectedWorkflowId,
  workflow,
}: UsePresetStateProps) {
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
    updateActiveSet,
    loadPresetData,
    openPresetIds,
    openPreset,
  } = store

  const storeRef = useRef(store)
  storeRef.current = store

  const [isPresetOpen, setIsPresetOpen] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false)
  // ── Conflict State & Saved State Tracking ──
  const [conflictData, setConflictData] = useState<PresetConflictData | null>(null)
  const lastSavedStateRef = useRef<Record<string | number, HistoryState>>({})
  const isInitialSyncRef = useRef(false)
  const prevWorkflowIdRef = useRef<number | null>(null)

  const isStateEqual = (a: HistoryState, b: HistoryState) => {
    return (
      JSON.stringify(a.paramValues) === JSON.stringify(b.paramValues) &&
      JSON.stringify(a.appliedAssets) === JSON.stringify(b.appliedAssets) &&
      a.batchSize === b.batchSize &&
      a.seedMode === b.seedMode &&
      a.seed === b.seed
    )
  }

  // ── Queries ──
  const { data: presets } = useQuery({
    queryKey: ['workflow-presets', selectedWorkflowId],
    queryFn: () => workflowPresetsApi.list(selectedWorkflowId!) as Promise<WorkflowPreset[]>,
    enabled: !!selectedWorkflowId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  })

  const presetUpdatedAtRef = useRef<Record<number, string>>({})

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
      if (newPreset?.id && selectedWorkflowId) {
        localStorage.setItem(`${LS_KEYS.ACTIVE_SET_PREFIX}${selectedWorkflowId}`, String(newPreset.id))
        openPreset?.(newPreset.id)
        setActiveSetId(newPreset.id)
        if (newPreset.param_values) setParamValues(newPreset.param_values)
        if (newPreset.applied_assets) setAppliedAssets(newPreset.applied_assets)
        if (newPreset.batch_size !== undefined) setBatchSize(newPreset.batch_size)
        if (newPreset.seed_mode) setSeedMode(newPreset.seed_mode as 'fixed' | 'random')
        if (newPreset.seed !== undefined) setSeed(newPreset.seed)
      }
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
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
    }) =>
      workflowPresetsApi.update(args.id, {
        name: args.name,
        param_values: args.param_values !== undefined ? args.param_values : paramValues,
        applied_assets: args.applied_assets !== undefined ? args.applied_assets : appliedAssets,
        batch_size: args.batch_size !== undefined ? args.batch_size : batchSize,
        seed_mode: args.seed_mode !== undefined ? args.seed_mode : seedMode,
        seed: args.seed !== undefined ? args.seed : seed,
        base_updated_at: args.base_updated_at,
      }),
    onSuccess: (updatedPreset, variables) => {
      if (updatedPreset?.id) {
        presetUpdatedAtRef.current[updatedPreset.id] = updatedPreset.updated_at
        lastSavedStateRef.current[updatedPreset.id] = {
          paramValues: variables.param_values !== undefined ? variables.param_values : paramValues,
          appliedAssets: (variables.applied_assets !== undefined ? variables.applied_assets : appliedAssets) as any,
          batchSize: variables.batch_size !== undefined ? variables.batch_size : batchSize,
          seedMode: (variables.seed_mode !== undefined ? variables.seed_mode : seedMode) as any,
          seed: variables.seed !== undefined ? variables.seed : seed,
        }
        qc.setQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId], (old) => {
          if (!old) return old
          return old.map((p) => (p.id === updatedPreset.id ? updatedPreset : p))
        })
      }
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
    },
    onError: (err: any, variables) => {
      if (err?.message?.includes('409') || err?.status === 409) {
        qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
        const serverPreset = presets?.find((p) => p.id === variables.id)
        if (serverPreset) {
          setConflictData({
            serverPreset,
            localDraft: {
              name: variables.name,
              paramValues: variables.param_values || paramValues,
              appliedAssets: variables.applied_assets || appliedAssets,
              batchSize: variables.batch_size ?? batchSize,
              seedMode: (variables.seed_mode as 'random' | 'fixed') || seedMode,
              seed: variables.seed ?? seed,
            },
          })
        }
      }
    },
  })

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

  const handleBulkEditApply = async (payload: import('../../../components/ProfileBulkEditModal').BulkEditPayload) => {
    const latestPresets = qc.getQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId]) || presets
    if (!latestPresets || bulkTargetIds.length === 0) return
    setIsBulkApplying(true)
    try {
      const selectedPresets = latestPresets.filter((p) => bulkTargetIds.includes(p.id))
      const updatedResults = await Promise.all(
        selectedPresets.map(async (preset) => {
          let newParamValues = { ...preset.param_values }
          let newAppliedAssets = { ...preset.applied_assets }
          let newBatchSize = preset.batch_size

          if (payload.promptOps) {
            for (const op of payload.promptOps) {
              const targetFields = op.fields ?? Object.keys(newParamValues)
              for (const field of targetFields) {
                if (!(field in newParamValues)) continue
                const current = newParamValues[field]
                if (op.op === 'search_replace') {
                  newParamValues[field] = current.split(op.find!).join(op.replace ?? '')
                } else if (op.op === 'overwrite') {
                  newParamValues[field] = op.value!
                  delete newAppliedAssets[field]
                } else if (op.op === 'prefix') {
                  newParamValues[field] = prependToPrompt(current, op.value ?? '')
                } else if (op.op === 'suffix') {
                  newParamValues[field] = appendToPrompt(current, op.value ?? '')
                } else if (op.op === 'remove_tags') {
                  if (op.commonTagOps && op.commonTagOps.length > 0) {
                    const removeMap = new Map<string, string>()
                    const updateMap = new Map<string, string>()
                    for (const cOp of op.commonTagOps) {
                      if (cOp.action === 'remove') {
                        removeMap.set(cOp.originalBase.toLowerCase(), 'remove')
                      } else if (cOp.action === 'update') {
                        updateMap.set(cOp.originalBase.toLowerCase(), cOp.newFormattedTag)
                      }
                    }
                    const currentTags = current.split(',').map((t) => t.trim()).filter(Boolean)
                    const updatedTags: string[] = []
                    for (const tag of currentTags) {
                      const weightMatch = tag.match(/^\((.+?):[0-9.]+\)$/)
                      const parenMatch = tag.match(/^\((.+?)\)$/)
                      const base = (weightMatch ? weightMatch[1] : parenMatch ? parenMatch[1] : tag).trim().toLowerCase()
                      if (removeMap.has(base)) continue
                      if (updateMap.has(base)) {
                        updatedTags.push(updateMap.get(base)!)
                      } else {
                        updatedTags.push(tag)
                      }
                    }
                    newParamValues[field] = updatedTags.join(', ')
                  } else if (op.tags && op.tags.length > 0) {
                    const tagsToRemoveSet = new Set(op.tags.map((t) => t.trim().toLowerCase()))
                    const currentTags = current.split(',').map((t) => t.trim()).filter(Boolean)
                    const filteredTags = currentTags.filter((t) => !tagsToRemoveSet.has(t.toLowerCase()))
                    newParamValues[field] = filteredTags.join(', ')
                  }
                }
              }
            }
          }

          if (payload.paramPatch) {
            Object.keys(payload.paramPatch).forEach((key) => {
              if (key.endsWith('_lora_count')) {
                const role = key.replace('_lora_count', '')
                const oldCount = parseInt(newParamValues[`${role}_lora_count`] || '0', 10)
                delete newParamValues[`${role}_lora_count`]
                for (let i = 1; i <= oldCount; i++) {
                  delete newParamValues[`${role}_lora_name_${i}`]
                  delete newParamValues[`${role}_lora_wt_${i}`]
                  delete newParamValues[`${role}_model_str_${i}`]
                  delete newParamValues[`${role}_clip_str_${i}`]
                }
              }
            })
            newParamValues = { ...newParamValues, ...payload.paramPatch }
          }

          if (payload.loraStackOps) {
            for (const stackOp of payload.loraStackOps) {
              const { role, mode } = stackOp
              const oldCount = parseInt(newParamValues[`${role}_lora_count`] || '0', 10)
              
              // Extract current slots
              const currentSlots: Array<{ name: string; weight: string; modelStrength: string; clipStrength: string }> = []
              for (let i = 1; i <= oldCount; i++) {
                currentSlots.push({
                  name: newParamValues[`${role}_lora_name_${i}`] || '',
                  weight: newParamValues[`${role}_lora_wt_${i}`] || '0.0',
                  modelStrength: newParamValues[`${role}_model_str_${i}`] || '1.0',
                  clipStrength: newParamValues[`${role}_clip_str_${i}`] || '1.0',
                })
              }

              // Delete old slot keys from newParamValues
              delete newParamValues[`${role}_lora_count`]
              for (let i = 1; i <= oldCount; i++) {
                delete newParamValues[`${role}_lora_name_${i}`]
                delete newParamValues[`${role}_lora_wt_${i}`]
                delete newParamValues[`${role}_model_str_${i}`]
                delete newParamValues[`${role}_clip_str_${i}`]
              }

              let finalSlots: Array<{ name: string; weight: string; modelStrength: string; clipStrength: string }> = []

              if (mode === 'overwrite') {
                finalSlots = (stackOp.slots || []).filter(s => s.name.trim() !== '')
              } else if (mode === 'differential') {
                const removeSet = new Set<string>()
                const updateMap = new Map<string, { weight?: string; modelStrength?: string; clipStrength?: string }>()
                for (const cop of stackOp.commonOps || []) {
                  if (cop.action === 'remove') {
                    removeSet.add(cop.name.toLowerCase())
                  } else if (cop.action === 'update') {
                    updateMap.set(cop.name.toLowerCase(), {
                      weight: cop.weight,
                      modelStrength: cop.modelStrength,
                      clipStrength: cop.clipStrength,
                    })
                  }
                }

                for (const slot of currentSlots) {
                  if (removeSet.has(slot.name.toLowerCase())) {
                    continue
                  }
                  const updates = updateMap.get(slot.name.toLowerCase())
                  finalSlots.push({
                    name: slot.name,
                    weight: updates?.weight ?? slot.weight,
                    modelStrength: updates?.modelStrength ?? slot.modelStrength,
                    clipStrength: updates?.clipStrength ?? slot.clipStrength,
                  })
                }

                for (const addSlot of stackOp.addSlots || []) {
                  if (addSlot.name.trim() !== '') {
                    finalSlots.push({
                      name: addSlot.name.trim(),
                      weight: addSlot.weight || '1.0',
                      modelStrength: addSlot.modelStrength || '1.0',
                      clipStrength: addSlot.clipStrength || '1.0',
                    })
                  }
                }
              }

              // Clamp to maximum 10 slots
              const clampedSlots = finalSlots.slice(0, 10)
              newParamValues[`${role}_lora_count`] = String(clampedSlots.length)
              clampedSlots.forEach((slot, idx) => {
                const i = idx + 1
                newParamValues[`${role}_lora_name_${i}`] = slot.name
                newParamValues[`${role}_lora_wt_${i}`] = slot.weight
                newParamValues[`${role}_model_str_${i}`] = slot.modelStrength
                newParamValues[`${role}_clip_str_${i}`] = slot.clipStrength
              })
            }
          }

          if (payload.batchSize !== undefined) {
            newBatchSize = payload.batchSize
          }

          if (payload.loraOps) {
            for (const loraOp of payload.loraOps) {
              const existing = newAppliedAssets[loraOp.role] ?? []
              if (loraOp.mode === 'replace') {
                newAppliedAssets[loraOp.role] = [loraOp.asset]
              } else {
                newAppliedAssets[loraOp.role] = [...existing, loraOp.asset]
              }
            }
          }

          if (payload.assetOps) {
            for (const assetOp of payload.assetOps) {
              const existingAssets = newAppliedAssets[assetOp.role] ?? []
              const isOverwriteOp = payload.promptOps?.some((p) => p.op === 'overwrite')
              let updatedAssets: AppliedAsset[] = assetOp.mode === 'replace' || isOverwriteOp ? [] : [...existingAssets]
              for (const asset of assetOp.assets) {
                const isDuplicate = updatedAssets.some(
                  (existing) =>
                    existing.type === asset.type &&
                    existing.assetId === asset.assetId &&
                    existing.name === asset.name &&
                    existing.loraPromptString === asset.loraPromptString &&
                    JSON.stringify(existing.tags) === JSON.stringify(asset.tags)
                )
                if (!isDuplicate) {
                  updatedAssets.push(asset)
                }
              }
              newAppliedAssets[assetOp.role] = updatedAssets
            }
          }

          const res = await workflowPresetsApi.update(preset.id, {
            param_values: newParamValues,
            applied_assets: newAppliedAssets,
            batch_size: newBatchSize,
          })

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
            chips[role] = parseToChips(val)
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
            initialPromptChips[role] = parseToChips(val)
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

        // 全ロールの promptChips を一括更新
        storeRef.current.setAllPromptChips?.(initialPromptChips)
      }

      qc.setQueryData<WorkflowPreset[]>(['workflow-presets', selectedWorkflowId], (old) => {
        if (!old) return old
        const resMap = new Map(updatedResults.map((p) => [p.id, p]))
        return old.map((p) => resMap.get(p.id) ?? p)
      })

      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setIsBulkEditOpen(false)
      setBulkTargetIds([])
    } finally {
      setIsBulkApplying(false)
    }
  }

  // ── Actions ──
  const handleCreatePreset = (name?: string, copySourceId?: string | number) => {
    const finalName = name ?? newPresetName
    if (!finalName.trim() || !selectedWorkflowId) return

    if (copySourceId === undefined) {
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
      if (String(copySourceId) === String(activeSetId)) {
        createPresetMutation.mutate({
          name: finalName.trim(),
          paramValues,
          appliedAssets,
          batchSize,
          seedMode,
          seed,
        })
      } else {
        const source = presets?.find((p) => String(p.id) === String(copySourceId))
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
    if (preset.updated_at) {
      presetUpdatedAtRef.current[preset.id] = preset.updated_at
    }
    const defaultParams = workflow ? getInitialParams(workflow) : {}
    const mergedParamValues = { ...defaultParams, ...(preset.param_values || {}) }

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
  }

  const handleSelectPresetTab = (presetId: string | number) => {
    const targetId = Number(presetId)
    const serverPreset = presets?.find((p) => p.id === targetId)
    const prevUpdatedAt = presetUpdatedAtRef.current[targetId]
    const serverChanged = !!(
      serverPreset?.updated_at &&
      prevUpdatedAt &&
      serverPreset.updated_at !== prevUpdatedAt
    )

    const targetSet = storeRef.current.sets?.find((s) => String(s.id) === String(presetId))
    const lastSaved = lastSavedStateRef.current[targetId]
    const isDirty = targetSet && lastSaved ? !isStateEqual(lastSaved, targetSet) : false

    if (serverChanged && isDirty && serverPreset && targetSet) {
      // 別端末で更新あり ＋ 自端末でも編集中 → 即座に競合解消モーダルを表示
      presetUpdatedAtRef.current[targetId] = serverPreset.updated_at
      setConflictData({
        serverPreset,
        localDraft: {
          name: targetSet.name,
          paramValues: targetSet.paramValues,
          appliedAssets: targetSet.appliedAssets,
          batchSize: targetSet.batchSize,
          seedMode: targetSet.seedMode,
          seed: targetSet.seed,
        },
      })
      return
    }

    if (serverChanged && !isDirty && serverPreset) {
      // 別端末で更新あり ＋ 自端末は未編集 → サーバー最新版をロード
      presetUpdatedAtRef.current[targetId] = serverPreset.updated_at
      handleLoadPreset(serverPreset)
      return
    }

    // サーバー変更なし: 既に開いているタブならローカル状態をアクティブ化、未開放ならDBから初期ロード
    const isOpen = (storeRef.current.openPresetIds || []).map(String).includes(String(presetId))
    if (isOpen) {
      setActiveSetId(presetId)
    } else if (serverPreset) {
      handleLoadPreset(serverPreset)
    } else {
      setActiveSetId(presetId)
    }
  }

  // ── Undo/Redo ──
  const [historyVersion, setHistoryVersion] = useState(0)
  const triggerHistoryChange = () => setHistoryVersion((v) => v + 1)

  const getHistory = (id: string | number) => {
    try {
      const stored = sessionStorage.getItem(`prompt-surgeon-history-${id}`)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {}
    return { past: [], future: [] }
  }

  const saveHistory = (id: string | number, hist: { past: HistoryState[]; future: HistoryState[] }) => {
    try {
      sessionStorage.setItem(`prompt-surgeon-history-${id}`, JSON.stringify(hist))
    } catch {}
    triggerHistoryChange()
  }

  const canUndo = activeSetId !== null && getHistory(activeSetId).past.length > 0
  const canRedo = activeSetId !== null && getHistory(activeSetId).future.length > 0

  const undo = (presetId: string | number) => {
    const hist = getHistory(presetId)
    if (hist.past.length === 0) return
    const currentState: HistoryState = { paramValues, appliedAssets, batchSize, seedMode, seed }
    hist.future.push(currentState)
    const prevState = hist.past.pop()!
    lastSavedStateRef.current[presetId] = prevState
    saveHistory(presetId, hist)
    setParamValues(prevState.paramValues)
    setAppliedAssets(prevState.appliedAssets)
    setBatchSize(prevState.batchSize)
    setSeedMode(prevState.seedMode)
    setSeed(prevState.seed)
    updateActiveSet({
      paramValues: prevState.paramValues,
      appliedAssets: prevState.appliedAssets,
      batchSize: prevState.batchSize,
      seedMode: prevState.seedMode,
      seed: prevState.seed,
    })
  }

  const redo = (presetId: string | number) => {
    const hist = getHistory(presetId)
    if (hist.future.length === 0) return
    const currentState: HistoryState = { paramValues, appliedAssets, batchSize, seedMode, seed }
    hist.past.push(currentState)
    const nextState = hist.future.pop()!
    lastSavedStateRef.current[presetId] = nextState
    saveHistory(presetId, hist)
    setParamValues(nextState.paramValues)
    setAppliedAssets(nextState.appliedAssets)
    setBatchSize(nextState.batchSize)
    setSeedMode(nextState.seedMode)
    setSeed(nextState.seed)
    updateActiveSet({
      paramValues: nextState.paramValues,
      appliedAssets: nextState.appliedAssets,
      batchSize: nextState.batchSize,
      seedMode: nextState.seedMode,
      seed: nextState.seed,
    })
  }

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          if (activeSetId !== null) undo(activeSetId)
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          if (activeSetId !== null) redo(activeSetId)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSetId, historyVersion, paramValues, appliedAssets, batchSize, seedMode, seed])

  // Sync presets query with sets
  useEffect(() => {
    if (!selectedWorkflowId || !presets) return

    if (prevWorkflowIdRef.current !== selectedWorkflowId) {
      prevWorkflowIdRef.current = selectedWorkflowId
      isInitialSyncRef.current = false
    }

    const currentStore = storeRef.current
    const currentActiveSetId = currentStore.activeSetId
    const currentOpenPresetIds = currentStore.openPresetIds || []

    const checkedPresetsRaw = localStorage.getItem(`prompt-surgeon-checked-presets-${selectedWorkflowId}`)
    const checkedPresets: (string | number)[] | null = checkedPresetsRaw ? JSON.parse(checkedPresetsRaw) : null
    const defaultParams = workflow ? getInitialParams(workflow) : {}

    const existingSets = currentStore.sets || []
    const existingSetsMap = new Map(existingSets.map((s) => [String(s.id), s]))

    const rawMappedSets = presets.map((p) => {
      const existingSet = existingSetsMap.get(String(p.id))
      return {
        id: p.id,
        name: p.name,
        // defaultParams < サーバーDB最新値 (SSoT)
        paramValues: {
          ...defaultParams,
          ...(p.param_values || {}),
        },
        appliedAssets: p.applied_assets || {},
        promptChips: existingSet?.promptChips,
        batchSize: p.batch_size || 1,
        seedMode: (p.seed_mode as 'random' | 'fixed') || 'random',
        seed: p.seed !== undefined ? p.seed : 42,
        checked: checkedPresets === null ? true : checkedPresets.includes(p.id),
      }
    })

    const isFirstSync = !isInitialSyncRef.current
    let mappedSets: import('../../../store/types').GenerationSet[] = rawMappedSets
    if (!isFirstSync && currentActiveSetId !== null && currentActiveSetId !== undefined) {
      mappedSets = presets.map((p) => {
        const existing = existingSetsMap.get(String(p.id))
        if (existing) {
          if (String(p.id) === String(currentActiveSetId)) {
            return {
              ...existing,
              name: p.name,
              paramValues: currentStore.paramValues,
              appliedAssets: currentStore.appliedAssets,
              promptChips: currentStore.promptChips || existing.promptChips,
              batchSize: currentStore.batchSize,
              seedMode: currentStore.seedMode,
              seed: currentStore.seed,
            }
          }
          return {
            ...existing,
            name: p.name,
          }
        }
        const raw = rawMappedSets.find((r) => String(r.id) === String(p.id))!
        return raw
      })
    }

    currentStore.setSets?.(mappedSets)

    if (presets && presets.length > 0) {
      const storedActiveStr = selectedWorkflowId
        ? localStorage.getItem(`${LS_KEYS.ACTIVE_SET_PREFIX}${selectedWorkflowId}`)
        : null
      const matchedByStored = storedActiveStr ? presets.find((p) => String(p.id) === String(storedActiveStr)) : undefined
      const matchedByActive = currentActiveSetId ? presets.find((p) => String(p.id) === String(currentActiveSetId)) : undefined
      const matchedPreset = matchedByStored || matchedByActive
      const targetActiveId = matchedPreset
        ? matchedPreset.id
        : currentOpenPresetIds.length > 0 && presets.some((p) => String(p.id) === String(currentOpenPresetIds[0]))
        ? currentOpenPresetIds[0]
        : presets[0].id
      const isInvalidActive =
        currentActiveSetId === null || currentActiveSetId === undefined || !currentOpenPresetIds.map(String).includes(String(currentActiveSetId))

      if (isFirstSync) {
        isInitialSyncRef.current = true
        presets.forEach((p) => {
          if (p.updated_at) {
            presetUpdatedAtRef.current[p.id] = p.updated_at
          }
          const pData = rawMappedSets.find((s) => String(s.id) === String(p.id))
          if (pData && !lastSavedStateRef.current[p.id]) {
            lastSavedStateRef.current[p.id] = {
              paramValues: pData.paramValues,
              appliedAssets: pData.appliedAssets,
              batchSize: pData.batchSize,
              seedMode: pData.seedMode,
              seed: pData.seed,
            }
          }
        })
        const activePreset = presets.find((p) => String(p.id) === String(targetActiveId))
        const activePresetData = rawMappedSets.find((s) => String(s.id) === String(targetActiveId))
        if (activePreset && activePresetData) {
          lastSavedStateRef.current[targetActiveId] = {
            paramValues: activePresetData.paramValues,
            appliedAssets: activePresetData.appliedAssets,
            batchSize: activePresetData.batchSize,
            seedMode: activePresetData.seedMode,
            seed: activePresetData.seed,
          }
          if (currentStore.loadPresetData) {
            currentStore.loadPresetData(activePreset, defaultParams)
          } else {
            currentStore.setActiveSetId?.(targetActiveId)
            if (!currentOpenPresetIds.map(String).includes(String(targetActiveId))) {
              currentStore.openPreset?.(targetActiveId)
            }
          }
        } else {
          currentStore.setActiveSetId?.(targetActiveId)
          if (!currentOpenPresetIds.map(String).includes(String(targetActiveId))) {
            currentStore.openPreset?.(targetActiveId)
          }
        }
      } else {
        // Subsequent syncs (polling / window focus / invalid active)
        if (isInvalidActive || String(currentActiveSetId) !== String(targetActiveId)) {
          currentStore.setActiveSetId?.(targetActiveId)
          if (!currentOpenPresetIds.map(String).includes(String(targetActiveId))) {
            currentStore.openPreset?.(targetActiveId)
          }
        } else if (!currentOpenPresetIds.map(String).includes(String(currentActiveSetId))) {
          currentStore.openPreset?.(currentActiveSetId)
        }

        // Check if server activePreset has updated_at newer than presetUpdatedAtRef
        const activePreset = presets.find((p) => String(p.id) === String(targetActiveId))
        if (activePreset && activePreset.updated_at) {
          const prevUpdatedAt = presetUpdatedAtRef.current[activePreset.id]
          if (prevUpdatedAt && activePreset.updated_at !== prevUpdatedAt) {
            presetUpdatedAtRef.current[activePreset.id] = activePreset.updated_at
            const lastSaved = lastSavedStateRef.current[activePreset.id]
            const currentLocalState: HistoryState = {
              paramValues: currentStore.paramValues,
              appliedAssets: currentStore.appliedAssets,
              batchSize: currentStore.batchSize,
              seedMode: currentStore.seedMode,
              seed: currentStore.seed,
            }
            const isDirty = !lastSaved || !isStateEqual(lastSaved, currentLocalState)

            if (!isDirty) {
              // Local is clean: auto-sync with SSoT
              const activePresetData = rawMappedSets.find((s) => String(s.id) === String(activePreset.id))
              if (activePresetData) {
                lastSavedStateRef.current[activePreset.id] = {
                  paramValues: activePresetData.paramValues,
                  appliedAssets: activePresetData.appliedAssets,
                  batchSize: activePresetData.batchSize,
                  seedMode: activePresetData.seedMode,
                  seed: activePresetData.seed,
                }
              }
              currentStore.loadPresetData?.(activePreset, defaultParams)
            } else {
              // Local has unsaved edits: trigger conflict resolution
              setConflictData({
                serverPreset: activePreset,
                localDraft: {
                  name: activePreset.name,
                  paramValues: currentStore.paramValues,
                  appliedAssets: currentStore.appliedAssets,
                  batchSize: currentStore.batchSize,
                  seedMode: currentStore.seedMode,
                  seed: currentStore.seed,
                },
              })
            }
          }
        }
      }
    } else if (presets && presets.length === 0) {
      if (!createPresetMutation.isPending) {
        handleCreatePreset('Set 1')
      }
    }
  }, [presets, selectedWorkflowId, workflow])

  // Autosave
  useEffect(() => {
    if (!isInitialSyncRef.current) return
    if (!selectedWorkflowId || activeSetId === null || activeSetId === undefined) return
    const activePreset = presets?.find((p) => String(p.id) === String(activeSetId))
    if (!activePreset) return

    const currentState: HistoryState = { paramValues, appliedAssets, batchSize, seedMode, seed }
    const lastSaved = lastSavedStateRef.current[activeSetId]
    if (lastSaved && isStateEqual(lastSaved, currentState)) return

    const timer = setTimeout(() => {
      const currentLastSaved = lastSavedStateRef.current[activeSetId]
      if (currentLastSaved && isStateEqual(currentLastSaved, currentState)) return
      const latestBaseUpdatedAt = presetUpdatedAtRef.current[activePreset.id] || activePreset.updated_at
      if (currentLastSaved) {
        const hist = getHistory(activeSetId)
        hist.past.push(currentLastSaved)
        hist.future = []
        saveHistory(activeSetId, hist)
      }
      updatePresetMutation.mutate({
        id: activePreset.id,
        name: activePreset.name,
        param_values: currentState.paramValues,
        applied_assets: currentState.appliedAssets,
        batch_size: currentState.batchSize,
        seed_mode: currentState.seedMode,
        seed: currentState.seed,
        base_updated_at: latestBaseUpdatedAt,
      })
    }, 1000)

    return () => clearTimeout(timer)
  }, [paramValues, appliedAssets, batchSize, seedMode, seed, activeSetId, presets, selectedWorkflowId])

  // Conflict Resolution Handlers
  const handleResolveConflictUseServer = () => {
    if (!conflictData) return
    handleLoadPreset(conflictData.serverPreset)
    setConflictData(null)
  }

  const handleResolveConflictOverwrite = () => {
    if (!conflictData) return
    const { serverPreset, localDraft } = conflictData
    updatePresetMutation.mutate({
      id: serverPreset.id,
      name: localDraft.name,
      param_values: localDraft.paramValues,
      applied_assets: localDraft.appliedAssets,
      batch_size: localDraft.batchSize,
      seed_mode: localDraft.seedMode,
      seed: localDraft.seed,
      base_updated_at: serverPreset.updated_at,
    })
    setConflictData(null)
  }

  const handleResolveConflictSaveAsNew = (newName: string) => {
    if (!conflictData) return
    const { localDraft } = conflictData
    createPresetMutation.mutate({
      name: newName,
      paramValues: localDraft.paramValues,
      appliedAssets: localDraft.appliedAssets,
      batchSize: localDraft.batchSize,
      seedMode: localDraft.seedMode,
      seed: localDraft.seed,
    })
    setConflictData(null)
  }

  return {
    presets,
    conflictData,
    setConflictData,
    handleResolveConflictUseServer,
    handleResolveConflictOverwrite,
    handleResolveConflictSaveAsNew,
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
    handleSelectPresetTab,
    isPresetOpen,
    setIsPresetOpen,
    newPresetName,
    setNewPresetName,
    isPresetManagerOpen,
    setIsPresetManagerOpen,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
