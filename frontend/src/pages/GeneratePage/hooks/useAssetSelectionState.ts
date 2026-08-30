import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lorasApi, tagSetsApi, snapshotsApi } from '../../../api/client'
import type { Lora, TagSet } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import type { AppliedAsset } from '../../../store/useGenerationStore'

export interface UseAssetSelectionStateProps {
  setRoleCollapsed: (role: string, isCollapsed: boolean) => void
  loadSnapshotParams: (params: Record<string, any>) => void
}

export function useAssetSelectionState({
  setRoleCollapsed,
  loadSnapshotParams,
}: UseAssetSelectionStateProps) {
  const { addAppliedAsset, setAppliedAssets } = useGenerationStore()

  const { data: loras } = useQuery({
    queryKey: ['loras'],
    queryFn: () => lorasApi.list() as Promise<Lora[]>,
  })
  const { data: tagSets } = useQuery({
    queryKey: ['tag-sets'],
    queryFn: () => tagSetsApi.list() as Promise<TagSet[]>,
  })

  const [selectedLoraForModal, setSelectedLoraForModal] = useState<{ role: string; lora: Lora } | null>(null)
  const [selectedTriggerSetId, setSelectedTriggerSetId] = useState<number | 'default'>('default')
  const [loraStrength, setLoraStrength] = useState<number>(1.0)
  const [openAddAssetRole, setOpenAddAssetRole] = useState<string | null>(null)

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

  const handleAddTagSetAssetInternal = (role: string, ts: TagSet) => {
    addAppliedAsset(role, { type: 'tagset', assetId: ts.id, name: ts.name, tags: ts.tags || [] })
    setOpenAddAssetRole(null)
    setRoleCollapsed(role, false)
  }

  const handleAddTagSetAsset = (role: string, ts: TagSet) => {
    handleAddTagSetAssetInternal(role, ts)
  }

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
  }

  return {
    loras,
    tagSets,
    selectedLoraForModal,
    setSelectedLoraForModal,
    selectedTriggerSetId,
    setSelectedTriggerSetId,
    loraStrength,
    setLoraStrength,
    openAddAssetRole,
    setOpenAddAssetRole,
    handleAddLoraAsset,
    handleAddTagSetAsset,
    handleAddTagSetAssetInternal,
    handleLoadSnapshot,
  }
}
