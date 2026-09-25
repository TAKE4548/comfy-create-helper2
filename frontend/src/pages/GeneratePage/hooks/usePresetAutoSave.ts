import { useEffect, useRef, useCallback } from 'react'
import type { WorkflowPreset } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { isStateEqual, type HistoryState, type UpdatePresetArgs } from './presetStateUtils'

export interface UsePresetAutoSaveProps {
  selectedWorkflowId: number | null
  activeSetId: string | number | null
  currentState: HistoryState
  presets: WorkflowPreset[] | undefined
  presetsRef: React.MutableRefObject<WorkflowPreset[] | undefined>
  isInitialSyncRef: React.MutableRefObject<boolean>
  lastSavedStateRef: React.MutableRefObject<Record<string | number, HistoryState>>
  presetUpdatedAtRef: React.MutableRefObject<Record<number, string>>
  onPerformUpdatePreset: (args: UpdatePresetArgs) => void
  onRecordHistory?: (id: string | number, state: HistoryState) => void
}

export interface UsePresetAutoSaveReturn {
  flushAutoSave: () => void
  clearTimer: () => void
}

export function usePresetAutoSave({
  selectedWorkflowId,
  activeSetId,
  currentState,
  presets,
  presetsRef,
  isInitialSyncRef,
  lastSavedStateRef,
  presetUpdatedAtRef,
  onPerformUpdatePreset,
  onRecordHistory,
}: UsePresetAutoSaveProps): UsePresetAutoSaveReturn {
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  const flushAutoSave = useCallback(() => {
    clearTimer()
    if (!isInitialSyncRef.current) return

    const currentStore = useGenerationStore.getState ? useGenerationStore.getState() : undefined
    const targetActiveId = currentStore?.activeSetId ?? activeSetId
    if (!selectedWorkflowId || targetActiveId === null || targetActiveId === undefined) return
    const currentPresets = presetsRef.current || presets
    const activePreset = currentPresets?.find((p) => String(p.id) === String(targetActiveId))
    if (!activePreset) return

    const stateToSave: HistoryState = currentStore
      ? {
          paramValues: currentStore.paramValues,
          appliedAssets: currentStore.appliedAssets,
          batchSize: currentStore.batchSize,
          seedMode: currentStore.seedMode,
          seed: currentStore.seed,
        }
      : currentState

    // 【AC-2 遵守】ジョブ投入・タブ切替直前にインメモリ上の sets を同期的即時反映
    currentStore?.updateActiveSet?.(stateToSave)

    const currentLastSaved = lastSavedStateRef.current[targetActiveId]
    if (currentLastSaved && isStateEqual(currentLastSaved, stateToSave)) return

    const latestBaseUpdatedAt = presetUpdatedAtRef.current[activePreset.id] || activePreset.updated_at
    if (currentLastSaved && onRecordHistory) {
      onRecordHistory(targetActiveId, currentLastSaved)
    }

    lastSavedStateRef.current[targetActiveId] = stateToSave

    onPerformUpdatePreset({
      id: activePreset.id,
      name: activePreset.name,
      param_values: stateToSave.paramValues,
      applied_assets: stateToSave.appliedAssets,
      batch_size: stateToSave.batchSize,
      seed_mode: stateToSave.seedMode,
      seed: stateToSave.seed,
      base_updated_at: latestBaseUpdatedAt,
    })
  }, [clearTimer, isInitialSyncRef, selectedWorkflowId, activeSetId, presetsRef, presets, currentState, lastSavedStateRef, presetUpdatedAtRef, onRecordHistory, onPerformUpdatePreset])

  useEffect(() => {
    if (!isInitialSyncRef.current) return
    if (!selectedWorkflowId || activeSetId === null || activeSetId === undefined) return
    const currentPresets = presetsRef.current || presets
    const activePreset = currentPresets?.find((p) => String(p.id) === String(activeSetId))
    if (!activePreset) return

    const lastSaved = lastSavedStateRef.current[activeSetId]
    if (lastSaved && isStateEqual(lastSaved, currentState)) return

    clearTimer()
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null
      flushAutoSave()
    }, 1000)

    return clearTimer
  }, [currentState, activeSetId, selectedWorkflowId, isInitialSyncRef, presetsRef, presets, lastSavedStateRef, clearTimer, flushAutoSave])

  return { flushAutoSave, clearTimer }
}
