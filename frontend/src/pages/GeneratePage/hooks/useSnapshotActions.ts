/**
 * useSnapshotActions — handles snapshot save, load, and related state.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'

export function useSnapshotActions(selectedWorkflowId: number | null) {
  const { selectedImg, paramValues, appliedAssets } = useGenerationStore()
  const qc = useQueryClient()

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)

  const saveSnapshot = useMutation({
    mutationFn: async ({ albumId, newAlbumName }: { albumId: number | null; newAlbumName?: string }) => {
      if (!selectedWorkflowId || !selectedImg) return
      const activeLoras: { lora_id: number; strength: number; role: string }[] = []
      const activeTagSets: { tag_set_id: number; role: string }[] = []

      Object.entries(appliedAssets).forEach(([role, assets]) => {
        assets.forEach((a) => {
          if (!a.enabled) return
          if (a.type === 'lora') {
            let strength = 1.0
            if (a.loraPromptString) {
              const parts = a.loraPromptString.replace(/[<>]/g, '').split(':')
              if (parts.length >= 3) strength = parseFloat(parts[2]) || 1.0
            }
            activeLoras.push({ lora_id: a.assetId, strength, role })
          } else if (a.type === 'tagset') {
            activeTagSets.push({ tag_set_id: a.assetId, role })
          }
        })
      })

      await snapshotsApi.create({
        workflow_id: selectedWorkflowId,
        image_path: selectedImg,
        params: paramValues,
        album_id: albumId ?? undefined,
        new_album_name: newAlbumName ?? undefined,
        loras: activeLoras,
        tag_sets: activeTagSets,
      })
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['albums'] })
    },
    onSuccess: () => {
      setIsSaveModalOpen(false)
    },
  })

  return {
    isSaveModalOpen,
    setIsSaveModalOpen,
    saveSnapshot,
  }
}
