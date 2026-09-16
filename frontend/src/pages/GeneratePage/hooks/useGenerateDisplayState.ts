import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { useImageNavigation } from './useImageNavigation'
import { useMultiSelect } from '../../../hooks/useMultiSelect'
import { promptToSetMapCache } from '../../../utils/promptToSetMapCache'

export interface SnapshotSummaryWithParams {
  id: number
  workflow_id: number
  image_path: string | null
  thumbnail_path?: string | null
  created_at: string
  params?: Record<string, any>
}

export interface UseGenerateDisplayStateProps {
  selectedWorkflowId: number | null
}

export function useGenerateDisplayState({
  selectedWorkflowId,
}: UseGenerateDisplayStateProps) {
  const store = useGenerationStore()
  const {
    clientId,
    batchImages,
    selectedImg,
    setSelectedImg,
    comfyHistoryImages,
    filterOwnSession,
    setFilterOwnSession,
    activeClientId,
    isGenerating,
    activeBatch,
    queueRunning = [],
    queuePending = [],
    previewImage,
  } = store

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)

  const queryClient = useQueryClient()

  // ── Snapshots Query ──
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummaryWithParams[]>,
    enabled: !!selectedWorkflowId,
  })

  const rawImages = useMemo(() => {
    return filterOwnSession ? batchImages : comfyHistoryImages
  }, [filterOwnSession, batchImages, comfyHistoryImages])

  const queryKey = useMemo(
    () => ['generateDisplayImages', { filterOwnSession: !!filterOwnSession }],
    [filterOwnSession]
  )

  const { data: queryData } = useQuery<string[]>({
    queryKey,
    queryFn: () => {
      const storeState = useGenerationStore.getState()
      return filterOwnSession ? storeState.batchImages : storeState.comfyHistoryImages
    },
    // rawImages が空配列のときは initialData を設定せず、PersistQueryClientProvider によるキャッシュ復元値を保持させる
    initialData: rawImages.length > 0 ? rawImages : undefined,
    staleTime: Infinity,
  })

  const displayImages = queryData ?? (rawImages.length > 0 ? rawImages : [])

  // Synchronize query cache if store rawImages changes (マウント初期の空配列によるキャッシュ消去を防止)
  useEffect(() => {
    if (rawImages.length === 0) return

    queryClient.setQueryData<string[]>(
      ['generateDisplayImages', { filterOwnSession: !!filterOwnSession }],
      (old) => {
        if (!old || old.length === 0) return rawImages
        const oldSet = new Set(old)
        const appended = rawImages.filter((x) => !oldSet.has(x))
        if (appended.length > 0) {
          return [...old, ...appended]
        }
        return old
      }
    )
  }, [rawImages, filterOwnSession, queryClient])

  const addHistoryImage = useCallback(
    (imageUrl: string, isOwnSession: boolean = true) => {
      // 1. Update all-session cache
      queryClient.setQueryData<string[]>(
        ['generateDisplayImages', { filterOwnSession: false }],
        (old = comfyHistoryImages) => {
          return [imageUrl, ...(old || []).filter((x) => x !== imageUrl)].slice(0, 200)
        }
      )

      // 2. If own session, also update own-session cache
      if (isOwnSession) {
        queryClient.setQueryData<string[]>(
          ['generateDisplayImages', { filterOwnSession: true }],
          (old = batchImages) => {
            return [imageUrl, ...(old || []).filter((x) => x !== imageUrl)].slice(0, 8)
          }
        )
      }
    },
    [queryClient, comfyHistoryImages, batchImages]
  )

  // Listen to comfy-job-event for real-time image completion & history sync
  useEffect(() => {
    const handleJobEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        type?: string
        images?: string[]
        isOwn?: boolean
        allImages?: string[]
        ownImages?: string[]
      }>
      if (customEvent.detail?.type === 'executed' && customEvent.detail.images) {
        for (const imgUrl of customEvent.detail.images) {
          addHistoryImage(imgUrl, customEvent.detail.isOwn ?? true)
        }
      } else if (customEvent.detail?.type === 'history-fetched') {
        const allImages = customEvent.detail.allImages
        const ownImages = customEvent.detail.ownImages
        if (allImages) {
          queryClient.setQueryData<string[]>(
            ['generateDisplayImages', { filterOwnSession: false }],
            allImages
          )
        }
        if (ownImages) {
          queryClient.setQueryData<string[]>(
            ['generateDisplayImages', { filterOwnSession: true }],
            ownImages
          )
        }
      }
    }
    window.addEventListener('comfy-job-event', handleJobEvent)
    return () => {
      window.removeEventListener('comfy-job-event', handleJobEvent)
    }
  }, [addHistoryImage, queryClient])

  const otherSessionCount = useMemo(() => {
    const ownSet = new Set(batchImages)
    return comfyHistoryImages.filter((img) => !ownSet.has(img)).length
  }, [comfyHistoryImages, batchImages])

  const sortedDisplayImages = useMemo(() => {
    return sortOrder === 'desc' ? displayImages : [...displayImages].reverse()
  }, [displayImages, sortOrder])

  const getSetNameForImage = (imgUrl: string) => {
    return promptToSetMapCache.getSetNameForUrl(imgUrl)
  }

  const sortedSnapshots = useMemo(() => {
    if (!Array.isArray(snapshots)) return []
    const copy = [...snapshots] as SnapshotSummaryWithParams[]
    return sortOrder === 'desc'
      ? copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [snapshots, sortOrder])

  const { handlePrevImg, handleNextImg } = useImageNavigation(sortedDisplayImages)

  const historyItems = useMemo(() => {
    return sortedDisplayImages.map((url) => ({ id: url, url }))
  }, [sortedDisplayImages])

  const {
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
  } = useMultiSelect<string>({ items: historyItems })

  const snapshotIdsForDisplay = useMemo(() => {
    return sortedDisplayImages.map((img) => {
      const found = sortedSnapshots?.find((s) => s.image_path === img)
      return found ? found.id : null
    })
  }, [sortedDisplayImages, sortedSnapshots])

  const showStrip =
    sortedDisplayImages.length > 0 || (!!sortedSnapshots && sortedSnapshots.length > 0)
  const hasHistory = !!selectedWorkflowId && !!sortedSnapshots && sortedSnapshots.length > 0

  const isGeneratingHere =
    isGenerating &&
    (activeClientId === clientId ||
      (activeBatch !== null && activeBatch.some((j) => j.status === 'generating' || j.status === 'pending')))

  const isOtherSessionGenerating = isGenerating && !isGeneratingHere

  const allQueueCount = useMemo(() => {
    return (queueRunning?.length || 0) + (queuePending?.length || 0)
  }, [queueRunning, queuePending])

  const totalQueueCount = useMemo(() => {
    if (!filterOwnSession) return allQueueCount
    const filterJob = (job: any) => job[3]?.client_id === clientId
    return (queueRunning?.filter(filterJob).length || 0) + (queuePending?.filter(filterJob).length || 0)
  }, [queueRunning, queuePending, filterOwnSession, clientId, allQueueCount])

  // MultiSelect selection tracking
  useEffect(() => {
    if (isMultiSelectMode && selectedIds.size > 0) {
      const idsArray = Array.from(selectedIds)
      const lastUrl = idsArray[idsArray.length - 1]
      if (lastUrl && sortedDisplayImages.includes(lastUrl)) {
        if (lastUrl !== selectedImg) {
          setSelectedImg(lastUrl)
        }
      }
    }
  }, [selectedIds, isMultiSelectMode, sortedDisplayImages, selectedImg, setSelectedImg])

  // Visibility / focus refresh
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!store.isConnected) {
          store.initialize({ force: true })
        }
        store.fetchQueue()
        store.fetchHistory()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [store])


  // Keep track of the currently viewed image in modal to protect context on list update
  const currentModalUrlRef = useRef<string | null>(null)

  // Update currentModalUrlRef when user manually navigates in modal or opens modal
  useEffect(() => {
    if (isModalPreviewOpen) {
      currentModalUrlRef.current = sortedDisplayImages[modalPreviewIndex] ?? null
    } else {
      currentModalUrlRef.current = null
    }
  }, [modalPreviewIndex, isModalPreviewOpen])

  const effectiveModalIndex = useMemo(() => {
    if (!isModalPreviewOpen || !currentModalUrlRef.current) return modalPreviewIndex
    const newIdx = sortedDisplayImages.indexOf(currentModalUrlRef.current)
    return newIdx !== -1 ? newIdx : modalPreviewIndex
  }, [isModalPreviewOpen, modalPreviewIndex, sortedDisplayImages])

  // When sortedDisplayImages changes, adjust modalPreviewIndex so the viewed image remains the same
  useEffect(() => {
    if (isModalPreviewOpen && currentModalUrlRef.current) {
      const newIdx = sortedDisplayImages.indexOf(currentModalUrlRef.current)
      if (newIdx !== -1 && newIdx !== modalPreviewIndex) {
        setModalPreviewIndex(newIdx)
      }
    }
  }, [sortedDisplayImages, isModalPreviewOpen])

  const handleOpenModalPreview = () => {
    const currentImg = previewImage || selectedImg
    if (!currentImg) return
    const idx = sortedDisplayImages.indexOf(currentImg)
    const targetIdx = idx >= 0 ? idx : 0
    setModalPreviewIndex(targetIdx)
    currentModalUrlRef.current = sortedDisplayImages[targetIdx] ?? null
    setIsModalPreviewOpen(true)
  }

  return {
    snapshots,
    sortOrder,
    setSortOrder,
    displayImages,
    sortedDisplayImages,
    getSetNameForImage,
    sortedSnapshots,
    handlePrevImg,
    handleNextImg,
    isMultiSelectMode,
    selectedIds,
    handleItemClick,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
    snapshotIdsForDisplay,
    showStrip,
    hasHistory,
    isGeneratingHere,
    isOtherSessionGenerating,
    allQueueCount,
    totalQueueCount,
    isModalPreviewOpen,
    setIsModalPreviewOpen,
    modalPreviewIndex,
    setModalPreviewIndex,
    effectiveModalIndex,
    handleOpenModalPreview,
    filterOwnSession,
    setFilterOwnSession,
    addHistoryImage,
    otherSessionCount,
  }
}
