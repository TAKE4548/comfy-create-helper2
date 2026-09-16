/**
 * useSnapshotActions — handles snapshot save, load, and related state.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi, promptMetadataApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'

export function useSnapshotActions(selectedWorkflowId: number | null) {
  const { selectedImg, paramValues, appliedAssets, setErrorToast } = useGenerationStore()
  const qc = useQueryClient()

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)

  const saveSnapshot = useMutation({
    mutationFn: async ({ albumId, newAlbumName, imagePaths }: { albumId: number | null; newAlbumName?: string; imagePaths?: string[] }) => {
      if (!selectedWorkflowId) return

      const targetImgs = imagePaths && imagePaths.length > 0 ? imagePaths : (selectedImg ? [selectedImg] : [])
      if (targetImgs.length === 0) return

      await Promise.all(
        targetImgs.map(async (img) => {
          let resolvedParamValues = paramValues
          let resolvedAppliedAssets = appliedAssets

          // クエリパラメータ t から promptId を抽出してキャッシュからアセットメタデータを復元
          try {
            const urlObj = new URL(img, window.location.origin)
            const t = urlObj.searchParams.get('t')
            if (t) {
              const cached = localStorage.getItem(`prompt-surgeon-meta-${t}`)
              if (cached) {
                const parsed = JSON.parse(cached)
                if (parsed.paramValues && parsed.appliedAssets) {
                  resolvedParamValues = parsed.paramValues
                  resolvedAppliedAssets = parsed.appliedAssets
                }
              } else {
                // 端末跨ぎ・別ブラウザ対応: サーバーDBから取得
                try {
                  const serverMeta = await promptMetadataApi.get(t)
                  if (serverMeta && serverMeta.param_values) {
                    resolvedParamValues = serverMeta.param_values
                    resolvedAppliedAssets = serverMeta.applied_assets || {}
                  }
                } catch (err) {
                  console.warn(`[Snapshot] Could not fetch server metadata for prompt ${t}:`, err)
                }
              }
            }
          } catch (e) {
            console.error('Failed to resolve metadata from image URL:', e)
          }


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
            workflow_id: selectedWorkflowId,
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
