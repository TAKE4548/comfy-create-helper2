import { StateCreator } from 'zustand'
import type { WorkflowPreset } from '../../api/types'
import { LS_KEYS } from '../../utils/localStorageKeys'
import { addAssetToPrompt, removeAssetFromPrompt } from '../../utils/promptUtils'
import { parseToChips, type TagChip } from '../../components/TagChipEditor/useChipParser'
import type { GenerationState, MultiSetState, MultiSetActions, GenerationSet, AppliedAsset } from '../types'

export const areChipsEqual = (a?: TagChip[], b?: TagChip[]): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  return a.every((chip, idx) => chip.id === b[idx].id && chip.enabled === b[idx].enabled && chip.text === b[idx].text)
}

export const chipsToString = (chips: TagChip[]): string => {
  return chips
    .filter((chip) => chip.enabled)
    .map((chip) => chip.text)
    .join(', ')
}

export function getEffectiveParamValues(
  paramValues: Record<string, string>,
  promptChips: Record<string, TagChip[]>
): Record<string, string> {
  const effective = { ...paramValues }
  for (const [role, chips] of Object.entries(promptChips || {})) {
    if (chips && chips.length > 0) {
      effective[role] = chipsToString(chips)
    }
  }
  return effective
}

export type MultiSetSlice = MultiSetState & MultiSetActions

export const createMultiSetSlice: StateCreator<GenerationState, [], [], MultiSetSlice> = (set, get) => {
  const storedWorkflowId = localStorage.getItem(LS_KEYS.WORKFLOW_ID)
    ? Number(localStorage.getItem(LS_KEYS.WORKFLOW_ID))
    : null

  let initialActiveSetId: string | number | null = null
  let initialOpenPresetIds: (string | number)[] = []
  let storedParams: Record<string, string> = {}
  let storedAppliedAssets: Record<string, AppliedAsset[]> = {}
  let storedBatchSize = 1
  let storedSeedMode: 'random' | 'fixed' = 'random'
  let storedSeed = 42

  if (storedWorkflowId !== null) {
    try {
      initialActiveSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + storedWorkflowId)
    } catch {}

    storedBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
    storedSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
    storedSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

    try {
      const stored = localStorage.getItem(`prompt-surgeon-open-presets-${storedWorkflowId}`)
      if (stored) {
        initialOpenPresetIds = JSON.parse(stored)
      }
    } catch {}
  }

  return {
    selectedWorkflowId: storedWorkflowId,
    paramValues: storedParams,
    appliedAssets: storedAppliedAssets,
    promptChips: {},
    batchSize: storedBatchSize,
    seedMode: storedSeedMode,
    seed: storedSeed,
    sets: [],
    activeSetId: initialActiveSetId,
    openPresetIds: initialOpenPresetIds,

    setSelectedWorkflowId: (id) => {
      set({ selectedWorkflowId: id })
      if (id !== null) {
        localStorage.setItem(LS_KEYS.WORKFLOW_ID, String(id))

        let activeSetId: string | number | null = null
        try {
          activeSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + id)
        } catch {}

        const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
        const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
        const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

        let openPresetIds: (string | number)[] = []
        try {
          const stored = localStorage.getItem(`prompt-surgeon-open-presets-${id}`)
          if (stored) {
            openPresetIds = JSON.parse(stored)
          }
        } catch {}

        set({
          sets: [],
          activeSetId,
          openPresetIds,
          paramValues: {},
          appliedAssets: {},
          promptChips: {},
          batchSize: defaultBatchSize,
          seedMode: defaultSeedMode,
          seed: defaultSeed,
        })
        get().fetchParamSyncGroups(id)
      } else {
        localStorage.removeItem(LS_KEYS.WORKFLOW_ID)
        set({
          sets: [],
          activeSetId: null,
          openPresetIds: [],
          paramValues: {},
          appliedAssets: {},
          promptChips: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          paramSyncGroups: [],
        })
      }
    },

    setParamValues: (values) => {
      set({ paramValues: values })
      get().updateActiveSet({ paramValues: values })
    },

    setPromptChips: (role, chips) => {
      const currentChips = get().promptChips?.[role]
      if (areChipsEqual(currentChips, chips)) {
        return
      }
      const updated = { ...(get().promptChips || {}), [role]: chips }
      set({ promptChips: updated })
      get().updateActiveSet({ promptChips: updated })
    },

    setAllPromptChips: (promptChips) => {
      set({ promptChips })
      get().updateActiveSet({ promptChips })
    },

    getEffectiveParamValues: () => {
      return getEffectiveParamValues(get().paramValues, get().promptChips)
    },

    addAppliedAsset: (role, asset) => {
      const current = get().appliedAssets
      const newAsset: AppliedAsset = {
        ...asset,
        id: `${asset.type}-${asset.assetId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        enabled: true,
      }
      const updated = { ...current, [role]: [...(current[role] || []), newAsset] }
      const currentParams = get().paramValues
      const updatedParams = {
        ...currentParams,
        [role]: addAssetToPrompt(currentParams[role] || '', newAsset.tags, newAsset.loraPromptString),
      }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    removeAppliedAsset: (role, id) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const assetToRemove = roleAssets.find((a) => a.id === id)
      const updated = { ...current, [role]: roleAssets.filter((a) => a.id !== id) }
      let updatedParams = get().paramValues
      if (assetToRemove?.enabled) {
        const currentPrompt = updatedParams[role] || ''
        updatedParams = {
          ...updatedParams,
          [role]: removeAssetFromPrompt(currentPrompt, assetToRemove.tags, assetToRemove.loraPromptString),
        }
      }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    toggleAppliedAsset: (role, id) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const asset = roleAssets.find((a) => a.id === id)
      if (!asset) return
      const nextEnabled = !asset.enabled
      const updated = { ...current, [role]: roleAssets.map((a) => (a.id === id ? { ...a, enabled: nextEnabled } : a)) }
      const currentPrompt = get().paramValues[role] || ''
      const updatedPrompt = nextEnabled
        ? addAssetToPrompt(currentPrompt, asset.tags, asset.loraPromptString)
        : removeAssetFromPrompt(currentPrompt, asset.tags, asset.loraPromptString)
      const updatedParams = { ...get().paramValues, [role]: updatedPrompt }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    setAppliedAssets: (assets) => {
      set({ appliedAssets: assets })
      get().updateActiveSet({ appliedAssets: assets })
    },

    setBatchSize: (size) => {
      set({ batchSize: size })
      localStorage.setItem(LS_KEYS.BATCH_SIZE, String(size))
      get().updateActiveSet({ batchSize: size })
    },

    setSeedMode: (mode) => {
      set({ seedMode: mode })
      localStorage.setItem(LS_KEYS.SEED_MODE, mode)
      get().updateActiveSet({ seedMode: mode })
    },

    setSeed: (seed) => {
      set({ seed })
      localStorage.setItem(LS_KEYS.SEED, String(seed))
      get().updateActiveSet({ seed })
    },

    initSets: (workflowId) => {
      const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
      const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
      const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

      const initialSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: 'Set 1',
        paramValues: {},
        appliedAssets: {},
        promptChips: {},
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed,
        checked: true,
      }
      const sets = [initialSet]
      const activeSetId = initialSet.id

      let openPresetIds: (string | number)[] = []
      try {
        const stored = localStorage.getItem(`prompt-surgeon-open-presets-${workflowId}`)
        if (stored) {
          openPresetIds = JSON.parse(stored)
        }
      } catch {}
      if (openPresetIds.length === 0) {
        openPresetIds = [initialSet.id]
      }
      localStorage.setItem(`prompt-surgeon-open-presets-${workflowId}`, JSON.stringify(openPresetIds))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + workflowId, String(activeSetId))

      set({
        sets,
        activeSetId,
        openPresetIds,
        paramValues: {},
        appliedAssets: {},
        promptChips: {},
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed,
      })
    },

    setActiveSetId: (id) => {
      const activeWfId = get().selectedWorkflowId

      const targetSet = get().sets.find((s) => String(s.id) === String(id))
      if (!targetSet) return

      if (activeWfId !== null && activeWfId !== undefined) {
        localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(id))
      }
      set({
        activeSetId: id,
        paramValues: targetSet.paramValues,
        appliedAssets: targetSet.appliedAssets,
        promptChips: targetSet.promptChips || {},
        batchSize: targetSet.batchSize,
        seedMode: targetSet.seedMode,
        seed: targetSet.seed,
      })
    },

    loadPresetData: (preset: WorkflowPreset, defaultParams: Record<string, string>) => {
      const activeWfId = get().selectedWorkflowId ?? preset.workflow_id ?? null

      const mergedParamValues = { ...defaultParams, ...(preset.param_values || {}) }
      const appliedAssets = preset.applied_assets || {}
      const batchSize = preset.batch_size ?? 1
      const seedMode = (preset.seed_mode as 'random' | 'fixed') || 'random'
      const seed = preset.seed !== undefined ? preset.seed : 42

      const openPresetIds = get().openPresetIds
      const nextOpenPresetIds = openPresetIds.includes(preset.id)
        ? openPresetIds
        : [...openPresetIds, preset.id]

      const initialPromptChips: Record<string, TagChip[]> = {}
      for (const [role, val] of Object.entries(mergedParamValues)) {
        if (val) {
          initialPromptChips[role] = parseToChips(val)
        }
      }

      const updatedSets = get().sets.map((s) => {
        if (String(s.id) === String(preset.id)) {
          return {
            ...s,
            name: preset.name || s.name,
            paramValues: mergedParamValues,
            appliedAssets,
            promptChips: initialPromptChips,
            batchSize,
            seedMode,
            seed,
          }
        }
        return s
      })

      const exists = updatedSets.some((s) => String(s.id) === String(preset.id))
      const finalSets = exists ? updatedSets : [
        ...updatedSets,
        {
          id: preset.id,
          name: preset.name,
          paramValues: mergedParamValues,
          appliedAssets,
          promptChips: initialPromptChips,
          batchSize,
          seedMode,
          seed,
          checked: true,
        },
      ]

      if (activeWfId !== null && activeWfId !== undefined) {
        localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(preset.id))
        if (!openPresetIds.includes(preset.id)) {
          localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(nextOpenPresetIds))
        }
      }

      set({
        ...(get().selectedWorkflowId === null && preset.workflow_id !== undefined ? { selectedWorkflowId: preset.workflow_id } : {}),
        activeSetId: preset.id,
        paramValues: mergedParamValues,
        appliedAssets,
        promptChips: initialPromptChips,
        batchSize,
        seedMode,
        seed,
        sets: finalSets,
        openPresetIds: nextOpenPresetIds,
      })
    },

    addSet: () => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const currentParamValues = { ...get().paramValues }
      const currentAppliedAssets = { ...get().appliedAssets }
      const currentPromptChips = { ...get().promptChips }
      const currentBatchSize = get().batchSize
      const currentSeedMode = get().seedMode
      const currentSeed = get().seed

      const newSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: `Set ${get().sets.length + 1}`,
        paramValues: currentParamValues,
        appliedAssets: currentAppliedAssets,
        promptChips: currentPromptChips,
        batchSize: currentBatchSize,
        seedMode: currentSeedMode,
        seed: currentSeed,
        checked: true,
      }

      const updatedSets = [...get().sets, newSet]
      const nextOpenPresetIds = [...get().openPresetIds, newSet.id]
      set({ sets: updatedSets, activeSetId: newSet.id, openPresetIds: nextOpenPresetIds, promptChips: currentPromptChips })
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(newSet.id))
      localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(nextOpenPresetIds))
    },

    removeSet: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      get().closePreset(id)

      const remainingOpenPresetIds = get().openPresetIds.filter((x) => String(x) !== String(id))
      let nextActiveId = get().activeSetId

      if (String(nextActiveId) === String(id)) {
        nextActiveId = remainingOpenPresetIds.length > 0 ? remainingOpenPresetIds[0] : null

        set({ activeSetId: nextActiveId })
        if (nextActiveId !== null) {
          localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(nextActiveId))
          const nextActiveSet = get().sets.find((s) => String(s.id) === String(nextActiveId))
          if (nextActiveSet) {
            set({
              paramValues: nextActiveSet.paramValues,
              appliedAssets: nextActiveSet.appliedAssets,
              promptChips: nextActiveSet.promptChips || {},
              batchSize: nextActiveSet.batchSize,
              seedMode: nextActiveSet.seedMode,
              seed: nextActiveSet.seed,
            })
          }
        } else {
          localStorage.removeItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId)
        }
      }
    },

    renameSet: (id, name) => {
      const updatedSets = get().sets.map((s) => (String(s.id) === String(id) ? { ...s, name } : s))
      set({ sets: updatedSets })
    },

    toggleSetChecked: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map((s) => (String(s.id) === String(id) ? { ...s, checked: !s.checked } : s))
      set({ sets: updatedSets })

      const checkedIds = updatedSets.filter((s) => s.checked).map((s) => s.id)
      localStorage.setItem(`prompt-surgeon-checked-presets-${activeWfId}`, JSON.stringify(checkedIds))
    },

    setAllSetsChecked: (checked) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map((s) => ({ ...s, checked }))
      set({ sets: updatedSets })

      const checkedIds = checked ? updatedSets.map((s) => s.id) : []
      localStorage.setItem(`prompt-surgeon-checked-presets-${activeWfId}`, JSON.stringify(checkedIds))
    },

    updateActiveSet: (updates) => {
      const activeSetId = get().activeSetId
      if (activeSetId === null || activeSetId === undefined) return
      const currentSets = get().sets

      const updatedSets = currentSets.map((s) => {
        if (String(s.id) === String(activeSetId)) {
          return { ...s, ...updates }
        }
        return s
      })

      set({ sets: updatedSets })
    },

    setSets: (sets) => {
      set({ sets })
    },

    openPreset: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      const openPresetIds = get().openPresetIds
      if (!openPresetIds.includes(id)) {
        const next = [...openPresetIds, id]
        set({ openPresetIds: next })
        localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(next))
      }
    },

    closePreset: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      const next = get().openPresetIds.filter((x) => String(x) !== String(id))
      set({ openPresetIds: next })
      localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(next))
    },
  }
}
