import { useState, useCallback } from 'react'
import type { WorkflowPreset } from '../../../api/types'
import type { PresetConflictData, HistoryState, UpdatePresetArgs } from './presetStateUtils'

export interface UsePresetConflictProps {
  onLoadPreset: (preset: WorkflowPreset) => void
  onUpdatePreset: (args: UpdatePresetArgs) => void
  onCreatePreset: (name: string, draft: HistoryState) => void
}

export interface UsePresetConflictReturn {
  conflictData: PresetConflictData | null
  setConflictData: (data: PresetConflictData | null) => void
  handleResolveConflictUseServer: () => void
  handleResolveConflictOverwrite: () => void
  handleResolveConflictSaveAsNew: (newName: string) => void
}

export function usePresetConflict({
  onLoadPreset,
  onUpdatePreset,
  onCreatePreset,
}: UsePresetConflictProps): UsePresetConflictReturn {
  const [conflictData, setConflictData] = useState<PresetConflictData | null>(null)

  const handleResolveConflictUseServer = useCallback(() => {
    if (!conflictData) return
    onLoadPreset(conflictData.serverPreset)
    setConflictData(null)
  }, [conflictData, onLoadPreset])

  const handleResolveConflictOverwrite = useCallback(() => {
    if (!conflictData) return
    const { serverPreset, localDraft } = conflictData
    onUpdatePreset({
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
  }, [conflictData, onUpdatePreset])

  const handleResolveConflictSaveAsNew = useCallback(
    (newName: string) => {
      if (!conflictData) return
      const { localDraft } = conflictData
      onCreatePreset(newName, {
        paramValues: localDraft.paramValues,
        appliedAssets: localDraft.appliedAssets,
        batchSize: localDraft.batchSize,
        seedMode: localDraft.seedMode,
        seed: localDraft.seed,
      })
      setConflictData(null)
    },
    [conflictData, onCreatePreset]
  )

  return {
    conflictData,
    setConflictData,
    handleResolveConflictUseServer,
    handleResolveConflictOverwrite,
    handleResolveConflictSaveAsNew,
  }
}
