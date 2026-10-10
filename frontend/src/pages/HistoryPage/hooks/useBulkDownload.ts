import { useState, useRef, useCallback } from 'react'
import JSZip from 'jszip'
import type { SnapshotSummary, Album } from '../../../api/types'

export interface BulkDownloadProgress {
  current: number
  total: number
  percent: number
  currentFilename?: string
}

export interface UseBulkDownloadProps {
  snapshots?: SnapshotSummary[]
  currentAlbum?: Album | null
  sortedAlbumItems?: { snapshot_id: number; image_path?: string | null }[]
}

export function useBulkDownload({
  snapshots,
  currentAlbum,
  sortedAlbumItems = [],
}: UseBulkDownloadProps = {}) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState<BulkDownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastParamsRef = useRef<{ snapshotIds: number[]; zipFilename: string; isAlbum: boolean } | null>(
    null
  )
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancelDownload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsDownloading(false)
    setProgress(null)
  }, [])

  const handleBulkDownload = useCallback(
    async (
      snapshotIds: number[],
      zipFilename: string,
      isAlbum = false
    ): Promise<boolean> => {
      if (snapshotIds.length === 0) return false
      setIsDownloading(true)
      setError(null)
      lastParamsRef.current = { snapshotIds, zipFilename, isAlbum }
      abortControllerRef.current = new AbortController()

      try {
        const zip = new JSZip()
        const usedNames = new Set<string>()

        const getUniqueFilename = (originalName: string, usedNames: Set<string>) => {
          if (!usedNames.has(originalName)) {
            usedNames.add(originalName)
            return originalName
          }
          const extIndex = originalName.lastIndexOf('.')
          const base = extIndex !== -1 ? originalName.slice(0, extIndex) : originalName
          const ext = extIndex !== -1 ? originalName.slice(extIndex) : ''
          let counter = 1
          let newName = `${base}_${counter}${ext}`
          while (usedNames.has(newName)) {
            counter++
            newName = `${base}_${counter}${ext}`
          }
          usedNames.add(newName)
          return newName
        }

        const getFilenameFromPath = (imagePath: string, snapshotId: number) => {
          const parts = imagePath.split('/')
          const lastPart = parts[parts.length - 1]
          if (lastPart === 'image' || !lastPart.includes('.')) {
            return `snapshot_${snapshotId}.png`
          }
          return lastPart
        }

        let orderedIds = [...snapshotIds]
        if (isAlbum) {
          const idToIndex = new Map(sortedAlbumItems.map((item, idx) => [item.snapshot_id, idx]))
          orderedIds.sort((a, b) => (idToIndex.get(a) ?? 0) - (idToIndex.get(b) ?? 0))
        }

        let fileIndex = 1
        const total = orderedIds.length
        let hasDownloadFailure = false

        for (let i = 0; i < total; i++) {
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Download aborted')
          }

          const id = orderedIds[i]
          let imgPath: string | null = null
          const snap = snapshots?.find((s) => s.id === id)
          if (snap) {
            imgPath = snap.image_path
          } else if (currentAlbum) {
            const albumItem = currentAlbum.items.find((item) => item.snapshot_id === id)
            if (albumItem) {
              imgPath = albumItem.image_path
            }
          }

          if (!imgPath) {
            hasDownloadFailure = true
            continue
          }

          let originalName = getFilenameFromPath(imgPath, id)
          if (isAlbum) {
            originalName = `${String(fileIndex).padStart(3, '0')}_${originalName}`
            fileIndex++
          }
          const uniqueName = getUniqueFilename(originalName, usedNames)

          setProgress({
            current: i + 1,
            total,
            percent: Math.round(((i + 1) / total) * 100),
            currentFilename: uniqueName,
          })

          try {
            const response = await fetch(imgPath, { signal: abortControllerRef.current?.signal })
            if (!response.ok) {
              console.error(`Failed to fetch image for snapshot ${id}: ${response.statusText}`)
              hasDownloadFailure = true
              continue
            }
            const blob = await response.blob()
            zip.file(uniqueName, blob)
          } catch (e: any) {
            if (e.name === 'AbortError') throw e
            console.error(`Error downloading snapshot ${id}:`, e)
            hasDownloadFailure = true
          }
        }

        if (hasDownloadFailure) {
          setError('一部の選択画像をダウンロードできませんでした。')
          return false
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(zipBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = zipFilename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        return true
      } catch (err: any) {
        if (err.message !== 'Download aborted') {
          const errorMsg = err?.message || String(err)
          setError(errorMsg)
          alert('Failed to create ZIP package: ' + errorMsg)
        }
        return false
      } finally {
        setIsDownloading(false)
        setProgress(null)
        abortControllerRef.current = null
      }
    },
    [snapshots, currentAlbum, sortedAlbumItems]
  )

  const retryLastDownload = useCallback(async () => {
    if (!lastParamsRef.current) return false
    const { snapshotIds, zipFilename, isAlbum } = lastParamsRef.current
    return handleBulkDownload(snapshotIds, zipFilename, isAlbum)
  }, [handleBulkDownload])

  return {
    isDownloading,
    progress,
    error,
    handleBulkDownload,
    retryLastDownload,
    cancelDownload,
  }
}
