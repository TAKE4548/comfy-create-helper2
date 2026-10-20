import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import { generationApi, snapshotsApi } from '../../../api/client'
import type { ImageAvailability, ImageIdentity, ResidualHistoryItem, ResidualHistoryResponse } from '../../../api/domains/generation'
import { createTrialAvailabilityController } from '../../../services/trialImageAvailability'
import { collectDisplayedIdentities, mergeResidualHistory } from '../../../services/residualHistory'
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

export type ResidualHistoryStatus = 'waiting' | 'checking' | 'complete' | 'partial' | 'error'

interface ResidualSyncRecord {
  status: ResidualHistoryStatus
  hasDisplayedBaseline: boolean
  started: boolean
  generation: number
  controller: AbortController | null
  examined: ImageIdentity[]
  owners: Map<object, object>
  retiring: Set<object>
  listeners: Set<(status: ResidualHistoryStatus) => void>
}

const residualSyncRecords = new WeakMap<ReturnType<typeof useQueryClient>, ResidualSyncRecord>()

function getResidualSyncRecord(queryClient: ReturnType<typeof useQueryClient>): ResidualSyncRecord {
  let record = residualSyncRecords.get(queryClient)
  if (!record) {
    record = { status: 'waiting', hasDisplayedBaseline: false, started: false, generation: 0, controller: null, examined: [], owners: new Map(), retiring: new Set(), listeners: new Set() }
    residualSyncRecords.set(queryClient, record)
  }
  return record
}

function setResidualSyncStatus(record: ResidualSyncRecord, status: ResidualHistoryStatus) {
  record.status = status
  for (const listener of record.listeners) listener(status)
}

function identityKey(identity: ImageIdentity): string {
  return JSON.stringify([identity.filename, identity.subfolder || '', identity.type || 'output'])
}

function identityViewUrl(identity: ImageIdentity): string {
  const query = new URLSearchParams({ filename: identity.filename, subfolder: identity.subfolder || '', type: identity.type || 'output' })
  return `/view?${query.toString()}`
}

function validResidualResponse(value: ResidualHistoryResponse): boolean {
  return Boolean(value && Array.isArray(value.items) && Array.isArray(value.rejected) && typeof value.has_more === 'boolean' &&
    value.items.every((item) => item?.availability === 'present' && item.identity && typeof item.identity.filename === 'string' &&
      typeof item.identity.subfolder === 'string' && typeof item.identity.type === 'string' && typeof item.view_url === 'string' &&
      (item.session_id === null || typeof item.session_id === 'string')) &&
    value.rejected.every((item) => item?.identity && typeof item.identity.filename === 'string' &&
      typeof item.identity.subfolder === 'string' && typeof item.identity.type === 'string' &&
      (item.availability === 'missing' || item.availability === 'unknown')))
}

export function useGenerateDisplayState({
  selectedWorkflowId,
}: UseGenerateDisplayStateProps) {
  const store = useGenerationStore()
  const isRestoring = useIsRestoring()
  const queryClient = useQueryClient()
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
  const [trialAvailability] = useState(() => createTrialAvailabilityController(
    (identity: ImageIdentity): Promise<ImageAvailability> => generationApi.imageAvailability(identity),
  ))
  const residualRecord = getResidualSyncRecord(queryClient)
  const [residualHistoryStatus, setResidualHistoryStatus] = useState<ResidualHistoryStatus>(residualRecord.status)
  const [residualRetryVersion, setResidualRetryVersion] = useState(0)
  const ownerRef = useRef<object>({})
  const connectedRef = useRef(false)
  const connectionGenerationRef = useRef(0)
  const [isModalPreviewOpen, setIsModalPreviewOpen] = useState(false)
  const [modalPreviewIndex, setModalPreviewIndex] = useState(0)

  const removeSelectedIdentityRef = useRef<(identity: string) => void>(() => {})
  const confirmedMissingRef = useRef(new Set<string>())
  const snapshotMissing = useMemo(() => new Set<string>(), [])
  const foreignManagedIdentities = useMemo(() => new Set((store.generationSnapshot?.jobs ?? [])
    .filter((job) => job.session_id !== clientId)
    .flatMap((job) => job.outputs
      .map((output) => imageIdentity(output.view_url)))), [store.generationSnapshot, clientId])
  const unavailableImages = useMemo(() => new Set<string>(), [])

  const applyMissing = useCallback((_url: string) => {
    // REQ-379: BE自立キャッシュ正本化により、ComfyUI元画像不在による強制除外は行わない
  }, [])

  const retryResidualHistory = useCallback(() => {
    residualRecord.generation += 1
    residualRecord.controller?.abort()
    residualRecord.controller = null
    residualRecord.started = false
    setResidualSyncStatus(residualRecord, 'waiting')
    setResidualRetryVersion((version) => version + 1)
  }, [residualRecord])

  useEffect(() => {
    const owner = ownerRef.current
    const lease = {}
    residualRecord.owners.set(owner, lease)
    residualRecord.retiring.delete(owner)
    return () => {
      residualRecord.retiring.add(owner)
      queueMicrotask(() => {
        if (residualRecord.owners.get(owner) !== lease) return
        residualRecord.owners.delete(owner)
        residualRecord.retiring.delete(owner)
        if (residualRecord.owners.size !== 0 || residualRecord.status !== 'checking') return
        residualRecord.generation += 1
        residualRecord.controller?.abort()
        residualRecord.controller = null
        setResidualSyncStatus(residualRecord, 'error')
      })
    }
  }, [residualRecord])

  useEffect(() => {
    const listener = (status: ResidualHistoryStatus) => setResidualHistoryStatus(status)
    residualRecord.listeners.add(listener)
    setResidualHistoryStatus(residualRecord.status)
    return () => { residualRecord.listeners.delete(listener) }
  }, [residualRecord])

  useEffect(() => {
    const generation = ++connectionGenerationRef.current
    connectedRef.current = true
    const owner = ownerRef.current
    const snapshotOutputs = (store.generationSnapshot?.jobs ?? []).flatMap((job) => job.outputs)
    for (const output of snapshotOutputs) {
      trialAvailability.adopt(output.view_url, output.availability)
      if (output.availability === 'missing') applyMissing(output.view_url)
    }
    trialAvailability.retainOwnerImages(owner, snapshotOutputs
      .filter((output) => output.availability === 'present' || output.availability === 'missing')
      .map((output) => output.view_url))
    const unsubscribe = trialAvailability.subscribe((url, status) => {
      if (!connectedRef.current) return
      if (status === 'missing') applyMissing(url)
      if (status === 'present' || status === 'missing') {
        window.dispatchEvent(new CustomEvent('comfy-image-availability', {
          detail: { url, availability: status },
        }))
      }
    })
    return () => {
      connectedRef.current = false
      unsubscribe()
      trialAvailability.releaseOwner(owner)
      const cleanupGeneration = ++connectionGenerationRef.current
      queueMicrotask(() => {
        if (connectionGenerationRef.current === cleanupGeneration && generation < cleanupGeneration) {
          trialAvailability.dispose()
        }
      })
    }
  }, [trialAvailability, applyMissing, store.generationSnapshot])

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
      return uniqueImages(filterKnownForeign(base), unavailableImages)
    },
    // rawImages が空配列のときは initialData を設定せず、PersistQueryClientProvider によるキャッシュ復元値を保持させる
    initialData: rawImages.length > 0 ? rawImages : undefined,
    staleTime: Infinity,
  })

  const displayImages = uniqueImages(
    filterKnownForeign(queryData ?? rawImages),
    unavailableImages
  )

  useEffect(() => {
    if (isRestoring) return
    const currentStore = useGenerationStore.getState()
    const hasBaseline = [
      queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }]),
      queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }]),
      currentStore.comfyHistoryImages,
      currentStore.batchImages,
    ].some((images) => Array.isArray(images) && images.length > 0)
    if (hasBaseline) residualRecord.hasDisplayedBaseline = true
    if (residualRecord.started) return
    if (!hasBaseline) {
      residualRecord.started = true
      setResidualSyncStatus(residualRecord, 'complete')
      return
    }
    if (!currentStore.generationSnapshot) return

    residualRecord.started = true
    const controller = new AbortController()
    residualRecord.controller = controller
    const generation = residualRecord.generation
    const active = () => generation === residualRecord.generation && residualRecord.owners.size > residualRecord.retiring.size
    setResidualSyncStatus(residualRecord, 'checking')

    void (async () => {
      const examined = residualRecord.examined.map((identity) => ({ ...identity }))
      const examinedKeys = new Set(examined.map(identityKey))
      const priorAddedIdentities: string[] = []
      let pages = 0
      let processed = 0
      try {
        while (pages < 20 && processed < 200 && active()) {
          const latestStore = useGenerationStore.getState()
          const unavailable = new Set([...snapshotMissing, ...confirmedMissingRef.current])
          const allQuery = queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }]) ?? []
          const ownQuery = queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }]) ?? []
          const all = uniqueImages([...allQuery, ...latestStore.comfyHistoryImages], unavailable)
          const own = uniqueImages(filterKnownForeign([...ownQuery, ...latestStore.batchImages]), unavailable)
          const known = collectDisplayedIdentities({ all, own, missing: new Set(), clientId: latestStore.clientId || '' })
          pages += 1
          const response = await generationApi.residualHistory({ known, examined: [...examined] }, controller.signal)
          if (!active()) return
          if (!validResidualResponse(response)) {
            setResidualSyncStatus(residualRecord, pages === 1 ? 'error' : 'partial')
            return
          }

          const pageItems: ResidualHistoryItem[] = []
          const pageRejected: ResidualHistoryResponse['rejected'] = []
          const pageIdentities = new Set<string>()
          for (const item of response.items) {
            const key = identityKey(item.identity)
            if (pageIdentities.has(key) || processed + pageIdentities.size >= 200) continue
            pageIdentities.add(key)
            pageItems.push({ ...item, view_url: toSameOriginViewUrl(item.view_url) })
          }
          for (const item of response.rejected) {
            const key = identityKey(item.identity)
            if (pageIdentities.has(key) || processed + pageIdentities.size >= 200) continue
            pageIdentities.add(key)
            pageRejected.push(item)
          }
          if (pageIdentities.size === 0 && response.has_more) {
            setResidualSyncStatus(residualRecord, 'partial')
            return
          }

          for (const identity of [...pageItems.map((item) => item.identity), ...pageRejected.map((item) => item.identity)]) {
            const key = identityKey(identity)
            if (!examinedKeys.has(key)) {
              examinedKeys.add(key)
              examined.push(identity)
            }
          }
          const retryExaminedByKey = new Map(residualRecord.examined.map((identity) => [identityKey(identity), identity]))
          for (const item of pageItems) retryExaminedByKey.set(identityKey(item.identity), item.identity)
          for (const item of pageRejected) {
            if (item.availability === 'missing') retryExaminedByKey.set(identityKey(item.identity), item.identity)
            else retryExaminedByKey.delete(identityKey(item.identity))
          }
          residualRecord.examined = [...retryExaminedByKey.values()]
          processed += pageIdentities.size

          for (const item of pageItems) {
            trialAvailability.adopt(item.view_url, 'present')
            priorAddedIdentities.push(identityKey(item.identity))
          }
          for (const item of pageRejected) {
            if (item.availability === 'missing') {
              const url = identityViewUrl(item.identity)
              trialAvailability.adopt(url, 'missing')
              applyMissing(url)
            }
          }

          const beforeMergeStore = useGenerationStore.getState()
          const currentUnavailable = new Set([...snapshotMissing, ...confirmedMissingRef.current])
          const currentAll = uniqueImages([
            ...(queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }]) ?? []),
            ...beforeMergeStore.comfyHistoryImages,
          ], currentUnavailable)
          const currentOwn = uniqueImages(filterKnownForeign([
            ...(queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }]) ?? []),
            ...beforeMergeStore.batchImages,
          ]), currentUnavailable)
          const mergeHistory = {
            all: currentAll,
            own: currentOwn,
            missing: new Set<string>(),
            clientId: beforeMergeStore.clientId || '',
          }
          const mergeItems = pageItems.filter((item) => trialAvailability.getStatus(item.view_url) !== 'missing')
          const currentIdentityKeys = new Set(collectDisplayedIdentities(mergeHistory).map(identityKey))
          const newCandidateCount = mergeItems.filter((item) => !currentIdentityKeys.has(identityKey(item.identity))).length
          const currentOwnIdentityKeys = new Set(collectDisplayedIdentities({ ...mergeHistory, all: [], missing: new Set() }).map(identityKey))
          const expectedOwnCount = mergeItems.filter((item) => item.session_id === mergeHistory.clientId &&
            !currentOwnIdentityKeys.has(identityKey(item.identity))).length
          const merged = mergeResidualHistory(mergeHistory, mergeItems, priorAddedIdentities)
          const mergedAll = uniqueImages(merged.all, currentUnavailable)
          const mergedOwn = uniqueImages(merged.own, currentUnavailable)
          const mergedOwnIdentityKeys = new Set(collectDisplayedIdentities({ all: [], own: mergedOwn, missing: new Set(), clientId: mergeHistory.clientId }).map(identityKey))
          const actualOwnCount = mergeItems.filter((item) => item.session_id === mergeHistory.clientId &&
            !currentOwnIdentityKeys.has(identityKey(item.identity)) && mergedOwnIdentityKeys.has(identityKey(item.identity))).length
          if (!active()) return
          queryClient.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }], mergedAll)
          queryClient.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }], mergedOwn)
          useGenerationStore.setState({ comfyHistoryImages: mergedAll, batchImages: mergedOwn })

          if (merged.added.length < newCandidateCount || actualOwnCount < expectedOwnCount) {
            setResidualSyncStatus(residualRecord, 'partial')
            return
          }

          if (!response.has_more) {
            setResidualSyncStatus(residualRecord, 'complete')
            return
          }
          if (response.has_more && newCandidateCount === 0) {
            setResidualSyncStatus(residualRecord, 'partial')
            return
          }
          if (processed >= 200 || pages >= 20) {
            setResidualSyncStatus(residualRecord, 'partial')
            return
          }
        }
        if (active()) setResidualSyncStatus(residualRecord, 'partial')
      } catch {
        if (active()) setResidualSyncStatus(residualRecord, 'error')
      } finally {
        if (residualRecord.controller === controller) residualRecord.controller = null
      }
    })()
  }, [
    isRestoring, residualRecord, residualRetryVersion, queryClient, store.generationSnapshot,
    rawImages, queryData, filterKnownForeign, snapshotMissing, trialAvailability, applyMissing,
  ])

  // Synchronize query cache if store rawImages changes (マウント初期の空配列によるキャッシュ消去を防止)
  useEffect(() => {
    if (rawImages.length === 0 && foreignManagedIdentities.size === 0 && unavailableImages.size === 0) return

    const unavailableRaw = uniqueImages(rawImages, unavailableImages)
    if (unavailableRaw.length !== rawImages.length) {
      if (filterOwnSession) useGenerationStore.setState({ batchImages: unavailableRaw })
      else useGenerationStore.setState({ comfyHistoryImages: unavailableRaw })
    }

    const queryKey = ['generateDisplayImages', { filterOwnSession }]
    const currentQueryData = queryClient.getQueryData<string[]>(queryKey)
    if (!currentQueryData || currentQueryData.length === 0) {
      queryClient.setQueryData(queryKey, unavailableRaw)
    } else {
      const merged = uniqueImages(filterKnownForeign([...unavailableRaw, ...currentQueryData]), unavailableImages)
      if (merged.length !== currentQueryData.length || !merged.every((v, i) => v === currentQueryData[i])) {
        queryClient.setQueryData(queryKey, merged)
      }
    }
    for (const own of [false, true]) {
      queryClient.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: own }], (old) => {
        if (!old) return old
        const filtered = uniqueImages(old, unavailableImages)
        return filtered.length === old.length ? old : filtered
      })
    }
  }, [rawImages, unavailableImages, filterOwnSession, queryClient, filterKnownForeign, foreignManagedIdentities])

  useEffect(() => {
    const handleAvailability = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string; availability?: string }>).detail
      if (!detail?.url || (detail.availability !== 'missing' && detail.availability !== 'present')) return
      const current = trialAvailability.getStatus(detail.url)
      if (detail.availability === 'missing' && current !== 'missing') trialAvailability.adopt(detail.url, 'missing')
      else if (detail.availability === 'missing' && !confirmedMissingRef.current.has(imageIdentity(detail.url))) applyMissing(detail.url)
      else if (current !== 'present' && current !== 'missing') trialAvailability.adopt(detail.url, 'present')
    }
    window.addEventListener('comfy-image-availability', handleAvailability)
    return () => window.removeEventListener('comfy-image-availability', handleAvailability)
  }, [applyMissing, trialAvailability])

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
            uniqueImages(allImages, unavailableImages)
          )
        }
        if (ownImages) {
          queryClient.setQueryData<string[]>(
            ['generateDisplayImages', { filterOwnSession: true }],
            uniqueImages(ownImages, unavailableImages)
          )
        }
        trialAvailability.refreshVisible()
      }
    }
    window.addEventListener('comfy-job-event', handleJobEvent)
    return () => {
      window.removeEventListener('comfy-job-event', handleJobEvent)
    }
  }, [addHistoryImage, queryClient, previewAutoFollow, unavailableImages, trialAvailability])

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
      if (lastUrl && sortedDisplayImages.includes(lastUrl) && !unavailableImages.has(imageIdentity(lastUrl))) {
        if (lastUrl !== selectedImg) {
          setSelectedImg(lastUrl)
        }
      }
    }
  }, [selectedIds, isMultiSelectMode, sortedDisplayImages, selectedImg, setSelectedImg, unavailableImages])

  // Visibility / focus refresh
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!store.isConnected) {
          store.initialize({ force: true })
        }
        store.fetchQueue()
        void store.loadSnapshot?.()
        if (!residualRecord.hasDisplayedBaseline && residualRecord.status !== 'waiting' && residualRecord.status !== 'checking') {
          store.fetchHistory()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [store, residualRecord])


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
        const idx = sortedDisplayImages.indexOf(targetUrl)
        if (idx !== -1) {
          pendingAutoFollowUrlRef.current = null
          setModalPreviewIndex(idx)
          currentModalUrlRef.current = targetUrl
          return
        }
      }
      if (currentModalUrlRef.current) {
        const newIdx = sortedDisplayImages.indexOf(currentModalUrlRef.current)
        if (newIdx !== -1 && newIdx !== modalPreviewIndex) {
          setModalPreviewIndex(newIdx)
        } else if (newIdx === -1) {
          if (sortedDisplayImages.length === 0) {
            setIsModalPreviewOpen(false)
            currentModalUrlRef.current = null
          } else {
            const fallbackIndex = Math.min(modalPreviewIndex, sortedDisplayImages.length - 1)
            setModalPreviewIndex(fallbackIndex)
            currentModalUrlRef.current = sortedDisplayImages[fallbackIndex]
          }
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
    trialAvailability,
    residualHistoryStatus,
    retryResidualHistory,
  }
}
