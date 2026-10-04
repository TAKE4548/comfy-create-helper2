/**
 * useSnapshotActions — handles snapshot save, load, and related state.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi } from '../../../api/client'
import { getMetadataView, resolveRecordedMetadata } from '../../../utils/promptRecord'
import { ASSOCIATIONS_KEY } from '../../../utils/generationRecord'
import { useGenerationStore } from '../../../store/useGenerationStore'

export function useSnapshotActions(selectedWorkflowId: number | null) {
  const { selectedImg, setErrorToast } = useGenerationStore()
  const qc = useQueryClient()

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)

  const saveSnapshot = useMutation({
    mutationFn: async ({ albumId, newAlbumName, imagePaths }: { albumId: number | null; newAlbumName?: string; imagePaths?: string[] }) => {
      if (!selectedWorkflowId) return

      const targetImgs = imagePaths && imagePaths.length > 0 ? imagePaths : (selectedImg ? [selectedImg] : [])
      if (targetImgs.length === 0) return

      await Promise.all(
        targetImgs.map(async (img) => {
          let promptId: string | null = null
          try { promptId = new URL(img, window.location.origin).searchParams.get('t') } catch {}
          const recorded = await resolveRecordedMetadata(promptId)
          const resolvedParamValues = JSON.parse(JSON.stringify(recorded?.paramValues ?? {}))
          const resolvedAppliedAssets = recorded?.appliedAssets ?? {}
          const view = getMetadataView(resolvedParamValues)
          const triggers = view.record?.assets.filter(a => a.type === 'lora' && a.origin === 'lora-trigger' && a.trigger_set_id != null)
            .map(a => ({ lora_id: a.asset_id, trigger_set_id: a.trigger_set_id, role: a.role })) ?? []
          if (triggers.length) resolvedParamValues[ASSOCIATIONS_KEY] = JSON.stringify({ version: 1, lora_trigger_sets: triggers })
          const activeLoras: { lora_id: number; strength: number; role: string }[] = []
          const activeTagSets: { tag_set_id: number; role: string }[] = []

          Object.entries(resolvedAppliedAssets).forEach(([role, assets]) => {
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

          return snapshotsApi.create({
            workflow_id: recorded?.workflowId ?? selectedWorkflowId,
            image_path: img,
            params: resolvedParamValues,
            album_id: albumId ?? undefined,
            new_album_name: newAlbumName ?? undefined,
            loras: activeLoras,
            tag_sets: activeTagSets,
          })
        })
      )
      qc.invalidateQueries({ queryKey: ['snapshots'] })
      qc.invalidateQueries({ queryKey: ['albums'] })
    },
    onSuccess: () => {
      setIsSaveModalOpen(false)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || ''
      setErrorToast({
        type: 'error',
        message: detail
          ? `スナップショットの保存に失敗しました: ${detail}`
          : 'スナップショットの保存に失敗しました。画像の取得エラーが発生しました。',
      })
    },
  })

  return {
    isSaveModalOpen,
    setIsSaveModalOpen,
    saveSnapshot,
  }
}
