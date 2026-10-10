import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { snapshotsApi } from '../../../api/client'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { useImageNavigation } from './useImageNavigation'
import { useMultiSelect } from '../../../hooks/useMultiSelect'
import { promptToSetMapCache } from '../../../utils/promptToSetMapCache'
import { toSameOriginViewUrl } from '../../../utils/thumbnailUrl'

function imageIdentity(value: string): string {
  try {
    const url = new URL(value, window.location.origin)
    if (url.pathname === '/view' && url.searchParams.has('filename')) {
      return JSON.stringify([
        url.searchParams.get('filename'),
        url.searchParams.get('subfolder') || '',
        url.searchParams.get('type') || 'output',
      ])
    }
  } catch {
    // Non-URL legacy values use their literal value as identity.
  }
  return value
}

function uniqueImages(images: string[], unavailable: Set<string>): string[] {
  const seen = new Set<string>()
  return images.map(toSameOriginViewUrl).filter((url) => {
    const identity = imageIdentity(url)
    if (unavailable.has(identity) || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

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
    previewAutoFollow,
    togglePreviewAutoFollow,
  } = store

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [, setAvailabilityRevision] = useState(0)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)

  const queryClient = useQueryClient()
  const removeSelectedIdentityRef = useRef<(identity: string) => void>(() => {})
  const confirmedMissingRef = useRef(new Set<string>())
  const confirmedPresentRef = useRef(new Set<string>())
  const snapshotImages = useMemo(() => (store.generationSnapshot?.jobs ?? []).flatMap((job) =>
    job.outputs
      .filter((output) => output.availability !== 'missing')
      .map((output) => output.view_url)
  ), [store.generationSnapshot])
  const snapshotMissing = useMemo(() => new Set((store.generationSnapshot?.jobs ?? []).flatMap((job) =>
    job.outputs.filter((output) => output.availability === 'missing').map((output) => imageIdentity(output.view_url))
  )), [store.generationSnapshot])
  const foreignManagedIdentities = useMemo(() => new Set((store.generationSnapshot?.jobs ?? [])
    .filter((job) => job.session_id !== clientId)
    .flatMap((job) => job.outputs
      .filter((output) => output.availability !== 'missing')
      .map((output) => imageIdentity(output.view_url)))), [store.generationSnapshot, clientId])
  const unavailableImages = useMemo(() => new Set([
    ...[...snapshotMissing].filter((identity) => !confirmedPresentRef.current.has(identity)),
    ...confirmedMissingRef.current,
  ]), [snapshotMissing, confirmedMissingRef.current.size, confirmedPresentRef.current.size])

  // ── Snapshots Query ──
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummaryWithParams[]>,
    enabled: !!selectedWorkflowId,
  })

  const rawImages = useMemo(() => {
    return filterOwnSession ? batchImages : comfyHistoryImages
  }, [filterOwnSession, batchImages, comfyHistoryImages])
  const filterKnownForeign = useCallback((images: string[]) => filterOwnSession
    ? images.filter((image) => !foreignManagedIdentities.has(imageIdentity(image)))
    : images, [filterOwnSession, foreignManagedIdentities])

  const queryKey = useMemo(
    () => ['generateDisplayImages', { filterOwnSession: !!filterOwnSession }],
    [filterOwnSession]
  )

  const { data: queryData } = useQuery<string[]>({
    queryKey,
    queryFn: () => {
      const storeState = useGenerationStore.getState()
      const base = filterOwnSession ? storeState.batchImages : storeState.comfyHistoryImages
      return uniqueImages(filterKnownForeign([...base, ...snapshotImages]), unavailableImages)
    },
    // rawImages が空配列のときは initialData を設定せず、PersistQueryClientProvider によるキャッシュ復元値を保持させる
    initialData: rawImages.length > 0 ? rawImages : undefined,
    staleTime: Infinity,
  })

  const displayImages = uniqueImages(
    filterKnownForeign(queryData ?? (rawImages.length > 0 ? [...rawImages, ...snapshotImages] : snapshotImages)),
    unavailableImages
  )

  // Synchronize query cache if store rawImages changes (マウント初期の空配列によるキャッシュ消去を防止)
  useEffect(() => {
    if (rawImages.length === 0 && snapshotImages.length === 0 && foreignManagedIdentities.size === 0) return

    queryClient.setQueryData<string[]>(
      ['generateDisplayImages', { filterOwnSession: !!filterOwnSession }],
      (old) => {
        return uniqueImages(filterKnownForeign([...rawImages, ...snapshotImages, ...(old || [])]), unavailableImages)
      }
    )
  }, [rawImages, snapshotImages, unavailableImages, filterOwnSession, queryClient, filterKnownForeign, foreignManagedIdentities])

  useEffect(() => {
    const handleAvailability = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; availability?: string }>).detail
      if (!detail?.url || (detail.availability !== 'missing' && detail.availability !== 'present')) return
      const normalizedUrl = toSameOriginViewUrl(detail.url)
      const identity = imageIdentity(normalizedUrl)
      if (detail.availability === 'present') {
        confirmedMissingRef.current.delete(identity)
        confirmedPresentRef.current.add(identity)
        setAvailabilityRevision((revision) => revision + 1)
        const nowUnavailable = new Set([
          ...[...snapshotMissing].filter((item) => !confirmedPresentRef.current.has(item)),
          ...confirmedMissingRef.current,
        ])
        for (const own of [false, true]) {
          queryClient.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: own }], (old) =>
            uniqueImages(old ?? (own ? useGenerationStore.getState().batchImages : useGenerationStore.getState().comfyHistoryImages), nowUnavailable)
          )
        }
        return
      }
      confirmedPresentRef.current.delete(identity)
      confirmedMissingRef.current.add(identity)
      setAvailabilityRevision((revision) => revision + 1)
      const nowUnavailable = new Set([
        ...[...snapshotMissing].filter((item) => !confirmedPresentRef.current.has(item)),
        ...confirmedMissingRef.current,
      ])
      for (const own of [false, true]) {
        queryClient.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: own }], (old) =>
          uniqueImages(old ?? (own
            ? useGenerationStore.getState().batchImages
            : useGenerationStore.getState().comfyHistoryImages), nowUnavailable)
        )
      }
      const selected = useGenerationStore.getState().selectedImg
      if (selected && imageIdentity(selected) === identity) setSelectedImg(null)
      removeSelectedIdentityRef.current(identity)
    }
    window.addEventListener('comfy-image-availability', handleAvailability)
    return () => window.removeEventListener('comfy-image-availability', handleAvailability)
  }, [queryClient, setSelectedImg, snapshotMissing])

  const addHistoryImage = useCallback(
    (imageUrl: string, isOwnSession: boolean = true) => {
      // 1. Update all-session cache
      queryClient.setQueryData<string[]>(
        ['generateDisplayImages', { filterOwnSession: false }],
        (old = comfyHistoryImages) => {
          return uniqueImages([imageUrl, ...(old || []).filter((x) => imageIdentity(x) !== imageIdentity(imageUrl))], unavailableImages).slice(0, 200)
        }
      )

      // 2. If own session, also update own-session cache
      if (isOwnSession) {
        queryClient.setQueryData<string[]>(
          ['generateDisplayImages', { filterOwnSession: true }],
          (old = batchImages) => {
          return uniqueImages([imageUrl, ...(old || []).filter((x) => imageIdentity(x) !== imageIdentity(imageUrl))], unavailableImages).slice(0, 8)
          }
        )
      }
    },
    [queryClient, comfyHistoryImages, batchImages, unavailableImages]
  )

  // Keep track of the currently viewed image in modal to protect context on list update
  const currentModalUrlRef = useRef<string | null>(null)
  // Track newest generated image URL to follow in modal preview
  const pendingAutoFollowUrlRef = useRef<string | null>(null)

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
        const isOwn = customEvent.detail.isOwn ?? true
        for (const imgUrl of customEvent.detail.images) {
          addHistoryImage(imgUrl, isOwn)
        }
        if (isOwn && previewAutoFollow && customEvent.detail.images.length > 0) {
          pendingAutoFollowUrlRef.current = customEvent.detail.images[0]
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
  }, [addHistoryImage, queryClient, previewAutoFollow])

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
    toggleItem,
    getLongPressHandlers,
    isSelected,
    exitMultiSelectMode,
    selectAll,
    clearSelection,
  } = useMultiSelect<string>({ items: historyItems })
  removeSelectedIdentityRef.current = (identity) => {
    for (const selectedId of selectedIds) {
      if (imageIdentity(selectedId) === identity) toggleItem(selectedId)
    }
  }

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
  // or auto-follows newly generated image if previewAutoFollow is enabled
  useEffect(() => {
    if (isModalPreviewOpen) {
      if (previewAutoFollow && pendingAutoFollowUrlRef.current) {
        const targetUrl = pendingAutoFollowUrlRef.current
        pendingAutoFollowUrlRef.current = null
        const idx = sortedDisplayImages.indexOf(targetUrl)
        if (idx !== -1) {
          setModalPreviewIndex(idx)
          currentModalUrlRef.current = targetUrl
          return
        }
      }
      if (currentModalUrlRef.current) {
        const newIdx = sortedDisplayImages.indexOf(currentModalUrlRef.current)
        if (newIdx !== -1 && newIdx !== modalPreviewIndex) {
          setModalPreviewIndex(newIdx)
        }
      }
    }
  }, [sortedDisplayImages, isModalPreviewOpen])

  const handleToggleAutoFollow = useCallback(() => {
    const nextFollow = !previewAutoFollow
    togglePreviewAutoFollow()
    if (nextFollow && sortedDisplayImages.length > 0) {
      const latestIdx = sortOrder === 'desc' ? 0 : sortedDisplayImages.length - 1
      const latestUrl = sortedDisplayImages[latestIdx]
      if (latestUrl) {
        setSelectedImg(latestUrl)
        if (isModalPreviewOpen) {
          setModalPreviewIndex(latestIdx)
          currentModalUrlRef.current = latestUrl
        }
      }
    }
  }, [previewAutoFollow, togglePreviewAutoFollow, sortedDisplayImages, sortOrder, setSelectedImg, isModalPreviewOpen])

  const handleOpenModalPreview = () => {
    const currentImg = previewImage || selectedImg
    const idx = currentImg ? sortedDisplayImages.indexOf(currentImg) : -1
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
    previewAutoFollow,
    handleToggleAutoFollow,
    filterOwnSession,
    setFilterOwnSession,
    addHistoryImage,
    otherSessionCount,
  }
}
