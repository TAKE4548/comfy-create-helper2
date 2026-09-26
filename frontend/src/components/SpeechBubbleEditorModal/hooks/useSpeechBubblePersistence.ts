import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { snapshotsApi, albumsApi, llmPromptsApi } from '../../../api/client'
import type { SnapshotSummary, Album } from '../../../api/types'
import type { SpeechBubble } from '../../../types/speechBubble'
import { drawSpeechBubble } from '../../../utils/speechBubbleRenderer'
import { LS_KEYS } from '../../../utils/localStorageKeys'

export interface UseSpeechBubblePersistenceOptions {
  snapshot: SnapshotSummary
  initialAlbumId?: number
  albums?: Album[]
  imageObj: HTMLImageElement | null
  bubbles: SpeechBubble[]
  setBubbles: React.Dispatch<React.SetStateAction<SpeechBubble[]>>
  selectedBubbleId: string | null
  activeFontFamily: string
  currentSourceSnapshotId: number
  currentImageUrl: string
  onSaved: () => void
  onClose: () => void
}

export interface UseSpeechBubblePersistenceReturn {
  saveMode: 'new' | 'overwrite'
  setSaveMode: React.Dispatch<React.SetStateAction<'new' | 'overwrite'>>
  targetAlbumId: number | 'new' | ''
  setTargetAlbumId: React.Dispatch<React.SetStateAction<number | 'new' | ''>>
  newAlbumName: string
  setNewAlbumName: React.Dispatch<React.SetStateAction<string>>
  isSaving: boolean
  isDrafting: boolean
  handleGenerateDraft: () => Promise<void>
  handleSave: () => Promise<void>
}

export function useSpeechBubblePersistence({
  snapshot,
  initialAlbumId,
  albums,
  imageObj,
  bubbles,
  setBubbles,
  selectedBubbleId,
  activeFontFamily,
  currentSourceSnapshotId,
  currentImageUrl,
  onSaved,
  onClose,
}: UseSpeechBubblePersistenceOptions): UseSpeechBubblePersistenceReturn {
  const qc = useQueryClient()

  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new')
  const [targetAlbumId, setTargetAlbumId] = useState<number | 'new' | ''>(() => {
    try {
      const saved = localStorage.getItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH)
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) {
        return Number(saved)
      }
    } catch {}
    if (initialAlbumId !== undefined) return initialAlbumId
    return 'new'
  })
  const [newAlbumName, setNewAlbumName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)

  useEffect(() => {
    if (typeof targetAlbumId === 'number' && albums && albums.length > 0) {
      const exists = albums.some((a) => a.id === targetAlbumId)
      if (!exists) {
        if (initialAlbumId !== undefined && albums.some((a) => a.id === initialAlbumId)) {
          setTargetAlbumId(initialAlbumId)
        } else {
          setTargetAlbumId('new')
        }
      }
    }
  }, [albums, targetAlbumId, initialAlbumId])

  const handleGenerateDraft = async () => {
    if (!selectedBubbleId) return
    setIsDrafting(true)
    try {
      const res = await llmPromptsApi.speechDraft(snapshot.id)
      setBubbles((prev) =>
        prev.map((b) => (b.id === selectedBubbleId ? { ...b, text: res.draft } : b))
      )
    } catch (err: any) {
      console.error(err)
      alert('セリフドラフト生成に失敗しました: ' + (err?.message || String(err)))
    } finally {
      setIsDrafting(false)
    }
  }

  const handleSave = async () => {
    if (!imageObj || bubbles.length === 0) return
    if (targetAlbumId === 'new' && !newAlbumName.trim()) {
      alert('新規アルバム名を入力してください')
      return
    }

    setIsSaving(true)
    try {
      const offCanvas = document.createElement('canvas')
      offCanvas.width = imageObj.naturalWidth
      offCanvas.height = imageObj.naturalHeight
      const offCtx = offCanvas.getContext('2d')
      if (!offCtx) throw new Error('Offscreen canvas context generation failed')

      // Draw background image
      offCtx.drawImage(imageObj, 0, 0, offCanvas.width, offCanvas.height)

      // Draw all speech bubbles without selection outline at 1:1 scale
      bubbles.forEach((bubble) => {
        drawSpeechBubble(offCtx, bubble, false, 1, 1, activeFontFamily)
      })

      const blob = await new Promise<Blob | null>((resolve) => offCanvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Canvas blob generation failed')

      const uploadRes = await snapshotsApi.upload(blob)
      const parentSnapshot = await snapshotsApi.get(currentSourceSnapshotId)

      const updatedParams = {
        ...(parentSnapshot.params || {}),
        speech_bubbles: bubbles,
        base_snapshot_id: currentSourceSnapshotId,
        base_image_path: currentImageUrl,
      }

      let savedSnapshotId: number

      if (saveMode === 'overwrite') {
        await snapshotsApi.patch(snapshot.id, {
          image_path: uploadRes.image_path,
          thumbnail_path: uploadRes.thumbnail_path,
          params: updatedParams,
        })
        savedSnapshotId = snapshot.id
      } else {
        const created = await snapshotsApi.create({
          workflow_id: parentSnapshot.workflow_id,
          image_path: uploadRes.image_path,
          params: updatedParams,
          source_snapshot_id: parentSnapshot.id,
        })
        savedSnapshotId = created.id
      }

      if (targetAlbumId === 'new') {
        const createdAlbum = await albumsApi.create({
          name: newAlbumName.trim(),
          snapshot_ids: [savedSnapshotId],
        })
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, String(createdAlbum.id))
        } catch {}
      } else if (typeof targetAlbumId === 'number') {
        await albumsApi.addItems(targetAlbumId, [savedSnapshotId])
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, String(targetAlbumId))
        } catch {}
      } else {
        try {
          localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, '')
        } catch {}
      }

      await qc.invalidateQueries({ queryKey: ['albums'] })
      await qc.invalidateQueries({ queryKey: ['snapshots'] })

      onSaved()
      onClose()
    } catch (err: any) {
      console.error(err)
      alert('画像の保存に失敗しました: ' + (err?.message || String(err)))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    saveMode,
    setSaveMode,
    targetAlbumId,
    setTargetAlbumId,
    newAlbumName,
    setNewAlbumName,
    isSaving,
    isDrafting,
    handleGenerateDraft,
    handleSave,
  }
}
