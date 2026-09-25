import { useEffect, useCallback } from 'react'
import type { Workflow, WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { GenerationSet } from '../../../store/types'
import { isStateEqual, isTimestampDifferent, type HistoryState, type PresetConflictData } from './presetStateUtils'
import { getInitialParams, healLegacyParamKeys } from './useWorkflowParams'
import { LS_KEYS } from '../../../utils/localStorageKeys'

export interface UsePresetStoreSyncProps {
  selectedWorkflowId: number | null
  workflow: Workflow | undefined
  presets: WorkflowPreset[] | undefined
  presetsRef: React.MutableRefObject<WorkflowPreset[] | undefined>
  isInitialSyncRef: React.MutableRefObject<boolean>
  prevWorkflowIdRef: React.MutableRefObject<number | null>
  lastSavedStateRef: React.MutableRefObject<Record<string | number, HistoryState>>
  presetUpdatedAtRef: React.MutableRefObject<Record<number, string>>
  setConflictData: (data: PresetConflictData | null) => void
  handleLoadPreset: (preset: WorkflowPreset) => void
  handleCreatePreset: (name: string) => void
  flushAutoSave: () => void
  isCreatePending?: boolean
}

export interface UsePresetStoreSyncReturn {
  handleSelectPresetTab: (presetId: string | number) => void
}

export function usePresetStoreSync({
  selectedWorkflowId,
  workflow,
  presets,
  presetsRef,
  isInitialSyncRef,
  prevWorkflowIdRef,
  lastSavedStateRef,
  presetUpdatedAtRef,
  setConflictData,
  handleLoadPreset,
  handleCreatePreset,
  flushAutoSave,
  isCreatePending = false,
}: UsePresetStoreSyncProps): UsePresetStoreSyncReturn {
  const handleSelectPresetTab = useCallback(
    (presetId: string | number) => {
      const currentStore = useGenerationStore.getState ? useGenerationStore.getState() : ({} as any)
      const currentActiveId = currentStore.activeSetId
      if (currentActiveId !== null && currentActiveId !== undefined && String(currentActiveId) !== String(presetId)) {
        flushAutoSave()
      }

      const targetId = Number(presetId)
      const currentPresets = presetsRef.current || presets
      const serverPreset = currentPresets?.find((p) => p.id === targetId)
      const prevUpdatedAt = presetUpdatedAtRef.current[targetId]
      const serverChanged = !!(
        serverPreset?.updated_at &&
        prevUpdatedAt &&
        isTimestampDifferent(serverPreset.updated_at, prevUpdatedAt)
      )

      const targetSet = currentStore.sets?.find(
        (s: any) => String(s.id) === String(presetId)
      )
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

      if (serverPreset && (serverChanged || !isDirty)) {
        // 別端末で更新あり、または自端末未編集（クリーン） → サーバー最新版をロード
        if (serverPreset.updated_at) {
          presetUpdatedAtRef.current[targetId] = serverPreset.updated_at
        }
        handleLoadPreset(serverPreset)
        return
      }

      // サーバー変更なし かつ ダーティな場合
      const latestStore = useGenerationStore.getState ? useGenerationStore.getState() : ({} as any)
      const isOpen = (latestStore.openPresetIds || []).map(String).includes(String(presetId))
      if (isOpen) {
        latestStore.setActiveSetId?.(presetId)
      } else if (serverPreset) {
        handleLoadPreset(serverPreset)
      } else {
        latestStore.setActiveSetId?.(presetId)
      }
    },
    [flushAutoSave, presetsRef, presets, presetUpdatedAtRef, lastSavedStateRef, setConflictData, handleLoadPreset]
  )

  // Sync presets query with sets & active tab
  useEffect(() => {
    if (!selectedWorkflowId || !presets) return

    if (prevWorkflowIdRef.current !== selectedWorkflowId) {
      prevWorkflowIdRef.current = selectedWorkflowId
      isInitialSyncRef.current = false
    }

    const currentStore = useGenerationStore.getState ? useGenerationStore.getState() : ({} as any)
    const existingSets: GenerationSet[] = currentStore.sets || []
    const existingSetsMap = new Map<string, GenerationSet>(existingSets.map((s: GenerationSet) => [String(s.id), s]))

    let currentActiveSetId = currentStore.activeSetId
    if ((currentActiveSetId === null || currentActiveSetId === undefined) && existingSets.length === 1) {
      currentActiveSetId = existingSets[0].id
    }
    const currentOpenPresetIds = currentStore.openPresetIds || []

    const checkedPresetsRaw = localStorage.getItem(`prompt-surgeon-checked-presets-${selectedWorkflowId}`)
    const checkedPresets: (string | number)[] | null = checkedPresetsRaw ? JSON.parse(checkedPresetsRaw) : null
    const defaultParams = workflow ? getInitialParams(workflow) : {}

    const rawMappedSets = presets.map((p) => {
      const existingSet = existingSetsMap.get(String(p.id))
      return {
        id: p.id,
        name: p.name,
        paramValues: healLegacyParamKeys({
          ...defaultParams,
          ...(p.param_values || {}),
        }),
        appliedAssets: p.applied_assets || {},
        promptChips: existingSet?.promptChips,
        batchSize: p.batch_size ?? 1,
        seedMode: (p.seed_mode || 'random') as 'random' | 'fixed',
        seed: p.seed !== undefined ? p.seed : 42,
        checked: checkedPresets === null ? true : checkedPresets.includes(p.id),
      }
    })

    const isFirstSync = !isInitialSyncRef.current
    let mappedSets: import('../../../store/types').GenerationSet[] = rawMappedSets
    if (!isFirstSync) {
      mappedSets = presets.map((p) => {
        const existing = existingSetsMap.get(String(p.id))
        const isActive =
          currentActiveSetId !== null && currentActiveSetId !== undefined && String(p.id) === String(currentActiveSetId)
        const lastSaved = lastSavedStateRef.current[p.id]

        let isDirty = false
        if (isActive) {
          const currentLocalState: HistoryState = {
            paramValues: currentStore.paramValues,
            appliedAssets: currentStore.appliedAssets,
            batchSize: currentStore.batchSize,
            seedMode: currentStore.seedMode,
            seed: currentStore.seed,
          }
          isDirty = lastSaved ? !isStateEqual(lastSaved, currentLocalState) : false
        } else if (existing) {
          const existingState: HistoryState = {
            paramValues: existing.paramValues,
            appliedAssets: existing.appliedAssets,
            batchSize: existing.batchSize,
            seedMode: existing.seedMode,
            seed: existing.seed,
          }
          isDirty = lastSaved ? !isStateEqual(lastSaved, existingState) : false
        }

        if (isDirty) {
          if (isActive) {
            return {
              ...existing,
              id: p.id,
              name: p.name,
              paramValues: currentStore.paramValues,
              appliedAssets: currentStore.appliedAssets,
              promptChips: currentStore.promptChips || existing?.promptChips,
              batchSize: currentStore.batchSize,
              seedMode: currentStore.seedMode,
              seed: currentStore.seed,
              checked: existing?.checked ?? (checkedPresets === null ? true : checkedPresets.includes(p.id)),
            }
          } else {
            return {
              ...existing!,
              id: p.id,
              name: p.name,
            }
          }
        }

        // Clean: SSoT is server DB!
        const serverParams = healLegacyParamKeys({
          ...defaultParams,
          ...(p.param_values || {}),
        })
        const serverAssets = p.applied_assets || {}
        const serverBatchSize = p.batch_size ?? 1
        const serverSeedMode = (p.seed_mode as 'random' | 'fixed') || 'random'
        const serverSeed = p.seed !== undefined ? p.seed : 42

        if (!isActive) {
          lastSavedStateRef.current[p.id] = {
            paramValues: serverParams,
            appliedAssets: serverAssets,
            batchSize: serverBatchSize,
            seedMode: serverSeedMode,
            seed: serverSeed,
          }
          if (p.updated_at) {
            presetUpdatedAtRef.current[p.id] = p.updated_at
          }
        }

        return {
          id: p.id,
          name: p.name,
          paramValues: serverParams,
          appliedAssets: serverAssets,
          promptChips: existing?.promptChips,
          batchSize: serverBatchSize,
          seedMode: serverSeedMode,
          seed: serverSeed,
          checked: existing?.checked ?? (checkedPresets === null ? true : checkedPresets.includes(p.id)),
        }
      })
    }

    const isSetsChanged =
      existingSets.length !== mappedSets.length ||
      JSON.stringify(existingSets) !== JSON.stringify(mappedSets)

    if (isSetsChanged) {
      currentStore.setSets?.(mappedSets)
    }

    if (presets && presets.length > 0) {
      const storedActiveStr = selectedWorkflowId
        ? localStorage.getItem(`${LS_KEYS.ACTIVE_SET_PREFIX}${selectedWorkflowId}`)
        : null
      const matchedByStored = storedActiveStr
        ? presets.find((p) => String(p.id) === String(storedActiveStr))
        : undefined
      const matchedByActive = currentActiveSetId
        ? presets.find((p) => String(p.id) === String(currentActiveSetId))
        : undefined
      const matchedPreset = matchedByStored || matchedByActive
      const targetActiveId = matchedPreset
        ? matchedPreset.id
        : currentOpenPresetIds.length > 0 && presets.some((p) => String(p.id) === String(currentOpenPresetIds[0]))
        ? currentOpenPresetIds[0]
        : presets[0].id
      const isInvalidActive =
        currentActiveSetId === null ||
        currentActiveSetId === undefined ||
        !currentOpenPresetIds.map(String).includes(String(currentActiveSetId))

      if (isFirstSync) {
        isInitialSyncRef.current = true
        presets.forEach((p) => {
          if (p.updated_at) {
            presetUpdatedAtRef.current[p.id] = p.updated_at
          }
          if (!lastSavedStateRef.current[p.id]) {
            lastSavedStateRef.current[p.id] = {
              paramValues: healLegacyParamKeys({
                ...defaultParams,
                ...(p.param_values || {}),
              }),
              appliedAssets: p.applied_assets || {},
              batchSize: p.batch_size ?? 1,
              seedMode: (p.seed_mode as 'random' | 'fixed') || 'random',
              seed: p.seed !== undefined ? p.seed : 42,
            }
          }
        })
        const activePreset = presets.find((p) => String(p.id) === String(targetActiveId))
        if (activePreset) {
          lastSavedStateRef.current[targetActiveId] = {
            paramValues: healLegacyParamKeys({
              ...defaultParams,
              ...(activePreset.param_values || {}),
            }),
            appliedAssets: activePreset.applied_assets || {},
            batchSize: activePreset.batch_size ?? 1,
            seedMode: (activePreset.seed_mode as 'random' | 'fixed') || 'random',
            seed: activePreset.seed !== undefined ? activePreset.seed : 42,
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
        } else if (
          currentActiveSetId !== null &&
          currentActiveSetId !== undefined &&
          !currentOpenPresetIds.map(String).includes(String(currentActiveSetId))
        ) {
          currentStore.openPreset?.(currentActiveSetId)
        }

        // Check if server activePreset has updated_at newer than presetUpdatedAtRef
        const activePreset = presets.find((p) => String(p.id) === String(targetActiveId))
        if (activePreset && activePreset.updated_at) {
          const prevUpdatedAt = presetUpdatedAtRef.current[activePreset.id]
          if (prevUpdatedAt && isTimestampDifferent(activePreset.updated_at, prevUpdatedAt)) {
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
      if (!isCreatePending) {
        handleCreatePreset('Set 1')
      }
    }
  }, [presets, selectedWorkflowId, workflow, isCreatePending, handleCreatePreset])

  return { handleSelectPresetTab }
}
