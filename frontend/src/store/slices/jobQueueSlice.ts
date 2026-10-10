import { StateCreator } from 'zustand'
import { comfyApi } from '../../api/client'
import { generationApi } from '../../api/domains/generation'
import { GenerationApiError } from '../../api/domains/generation'
import type { BatchAccepted, BatchRequest, CancelResult, GenerationSnapshot, UpstreamQueueView, CancelScope } from '../../api/domains/generation'
import { LS_KEYS } from '../../utils/localStorageKeys'
import type { GenerationState, JobQueueState, JobQueueActions, ComfyHistoryItem, QueuePromptOptions, BatchJob } from '../types'
import { comfyWsService } from '../services/comfyWebSocketService'
import { parseQueueSubmissionFailure } from '../../utils/queueSubmissionFailure'
import { prunePromptMetadataCache } from '../../utils/promptMetadataCache'

export type JobQueueSlice = JobQueueState & JobQueueActions

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function submitBatchWithLookup(payload: BatchRequest, signal?: AbortSignal): Promise<Pick<BatchAccepted, 'batch_id' | 'job_ids'>> {
  try {
    const accepted = await generationApi.submitBatch(payload, signal)
    return { batch_id: accepted.batch_id, job_ids: accepted.job_ids }
  } catch (error) {
    if (!(error instanceof GenerationApiError) || error.detail.outcome !== 'unconfirmed') throw error
    try {
      return await generationApi.getRequest(payload.request_id)
    } catch {
      throw error
    }
  }
}

export function projectQueue(snapshot: GenerationSnapshot, upstream: UpstreamQueueView): { running: any[]; pending: any[] } {
  const managed = (job: GenerationSnapshot['jobs'][number]) => [0, job.job_id, job, { client_id: job.session_id }, []] as any
  const running = snapshot.jobs.filter((job) => job.status === 'running').map(managed)
  const pending = snapshot.jobs.filter((job) => ['queued', 'submitting', 'unconfirmed'].includes(job.status)).map(managed)
  const seen = new Set(snapshot.jobs.map((job) => job.prompt_id).filter(Boolean))
  for (const item of upstream.running) {
    if (seen.has(item.prompt_id)) continue
    running.push([0, item.prompt_id, {}, { client_id: item.client_id ?? undefined }, []])
  }
  for (const item of upstream.pending) {
    if (seen.has(item.prompt_id)) continue
    pending.push([0, item.prompt_id, {}, { client_id: item.client_id ?? undefined }, []])
  }
  return { running, pending }
}

function historyImageIdentity(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin)
    const filename = parsed.searchParams.get('filename')
    const subfolder = parsed.searchParams.get('subfolder')
    const type = parsed.searchParams.get('type')
    const promptId = parsed.searchParams.get('t')
    if (filename === null || subfolder === null || type === null || promptId === null) return null
    return JSON.stringify([filename, subfolder, type, promptId])
  } catch {
    return null
  }
}

export const createJobQueueSlice: StateCreator<GenerationState, [], [], JobQueueSlice> = (set, get) => {
  const storedFilterOwn = localStorage.getItem(LS_KEYS.FILTER_OWN) === 'true'
  let preserveSelectionForActiveHistoryFetch = false

  let storedBatchImages: string[] = []
  try {
    storedBatchImages = JSON.parse(localStorage.getItem(LS_KEYS.BATCH_IMAGES) || '[]')
    storedBatchImages = storedBatchImages.filter((img) => !img.startsWith('blob:'))
  } catch {}

  const storedSelectedImg = localStorage.getItem(LS_KEYS.SELECTED_IMG)
  const verifiedSelectedImg =
    storedSelectedImg && !storedSelectedImg.startsWith('blob:') ? storedSelectedImg : null

  const storedAutoFollow = localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)
  const initialAutoFollow = storedAutoFollow !== null ? storedAutoFollow === 'true' : true

  return {
    filterOwnSession: storedFilterOwn,
    generationSnapshot: null,
    generationSyncing: false,
    batchImages: storedBatchImages,
    selectedImg: verifiedSelectedImg,
    previewAutoFollow: initialAutoFollow,
    comfyHistoryImages: [],
    queueRunning: [],
    queuePending: [],
    isBatchSubmitting: false,
    activeBatch: null,
    vramWaitStatus: null,

    setFilterOwnSession: (filter) => {
      set({ filterOwnSession: filter })
      localStorage.setItem(LS_KEYS.FILTER_OWN, String(filter))
    },

    setPreviewAutoFollow: (autoFollow) => {
      set({ previewAutoFollow: autoFollow })
      localStorage.setItem(LS_KEYS.PREVIEW_AUTO_FOLLOW, String(autoFollow))
    },

    togglePreviewAutoFollow: () => {
      const next = !get().previewAutoFollow
      set({ previewAutoFollow: next })
      localStorage.setItem(LS_KEYS.PREVIEW_AUTO_FOLLOW, String(next))
    },

    setSelectedImg: (img) => {
      const prevUrl = get().previewImage
      if (prevUrl && prevUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(prevUrl) } catch {}
      }
      set({ selectedImg: img, previewImage: null })
      if (img && !img.startsWith('blob:')) {
        localStorage.setItem(LS_KEYS.SELECTED_IMG, img)
      } else {
        localStorage.removeItem(LS_KEYS.SELECTED_IMG)
      }
    },

    setIsBatchSubmitting: (value) => set({ isBatchSubmitting: value }),
    setActiveBatch: (batch) => set({ activeBatch: batch }),

    updateBatchJobStatus: (promptId, status) => {
      const batch = get().activeBatch
      if (!batch) return
      const updated = batch.map((job) => (job.promptId === promptId ? { ...job, status } : job))
      set({ activeBatch: updated })

      const allFinished = updated.every((job) => job.status === 'completed' || job.status === 'failed')
      if (allFinished) {
        set({ isGenerating: false })
      }
    },

    setVramWaitStatus: (status) => set({ vramWaitStatus: status }),

    cancelVramWait: () => {
      set({ vramWaitStatus: null })
      get().abortSubmission?.()
    },

    submitGenerationBatch: async (payload: BatchRequest) => {
      const accepted = await submitBatchWithLookup(payload)
      await get().fetchQueue()
      return { batch_id: accepted.batch_id, job_ids: accepted.job_ids }
    },

    queuePrompt: async (workflow, metadata, options?: QueuePromptOptions) => {
      if (options?.signal?.aborted) return null
      const frozenMetadata = JSON.parse(JSON.stringify({
        paramValues: metadata?.paramValues ?? get().paramValues,
        appliedAssets: metadata?.appliedAssets ?? get().appliedAssets,
        workflowId: metadata?.workflowId ?? get().selectedWorkflowId,
      }))
      try {
        const requestId = createRequestId()
        const accepted = await submitBatchWithLookup({
          request_id: requestId,
          session_id: get().clientId,
          scope: 'normal',
          items: [{
            graph: workflow,
            ...(frozenMetadata.workflowId != null ? { workflow_id: frozenMetadata.workflowId } : {}),
            param_values: frozenMetadata.paramValues,
            applied_assets: frozenMetadata.appliedAssets,
          }],
        }, options?.signal)
        const jobId = accepted.job_ids[0] ?? null
        if (!jobId) {
          const failure = { reason: '受付応答にjob_idがありません', outcome: 'unconfirmed' as const }
          if (options?.onSubmissionFailure) {
            try { options.onSubmissionFailure(failure) } catch (callbackError) { console.error('Queue submission failure callback failed:', callbackError) }
          } else get().setErrorToast({ message: failure.reason, type: 'error' })
          return null
        }
        if (options?.signal?.aborted) return null
        try {
          prunePromptMetadataCache(jobId)
          localStorage.setItem(`prompt-surgeon-meta-${jobId}`, JSON.stringify({
            paramValues: frozenMetadata.paramValues,
            appliedAssets: frozenMetadata.appliedAssets,
            workflowId: frozenMetadata.workflowId,
            timestamp: Date.now(),
          }))
        } catch (error) {
          console.warn('[PromptMetadata] Failed to persist local metadata cache:', error)
        }
        try { localStorage.setItem(LS_KEYS.CURRENT_PROMPT_ID, jobId) } catch {}
        set({
          isGenerating: true,
          ...(options?.isBatchIntermediate ? {} : { previewImage: null, progress: null }),
          currentPromptId: jobId,
          activeClientId: get().clientId,
          currentWorkflow: workflow as Record<string, any>,
        })
        if (!options?.skipQueueFetch && !options?.signal?.aborted) await get().fetchQueue()
        return jobId
      } catch (error: any) {
        if (error?.name === 'AbortError' || options?.signal?.aborted) return null
        const failure = error instanceof GenerationApiError && error.detail.outcome === 'unconfirmed'
          ? { reason: error.message, outcome: 'unconfirmed' as const }
          : parseQueueSubmissionFailure(error)
        if (options?.onSubmissionFailure) {
          try { options.onSubmissionFailure(failure) } catch (callbackError) {
            console.error('Queue submission failure callback failed:', callbackError)
          }
        } else get().setErrorToast({ message: failure.reason, type: 'error' })
        return null
      }
    },

    cancelGeneration: async () => {
      await get().cancelAllJobs()
    },

    fetchHistory: async (options) => {
      if (options?.preserveSelection) preserveSelectionForActiveHistoryFetch = true
      const activeFetchPromise = comfyWsService.getActiveFetchHistoryPromise()
      if (activeFetchPromise) {
        return activeFetchPromise
      }
      preserveSelectionForActiveHistoryFetch = options?.preserveSelection === true
      const execute = async () => {
        try {
          const data = await comfyApi.getHistory(200)
          const allImages: string[] = []
          const ownImages: string[] = []
          const foreignImages: string[] = []
          const clientId = get().clientId

          const entries = Object.entries(data || {}) as [string, ComfyHistoryItem][]
          const sortedEntries = entries.sort(([, itemA], [, itemB]) => {
            const indexA = itemA?.prompt ? itemA.prompt[0] : 0
            const indexB = itemB?.prompt ? itemB.prompt[0] : 0
            return indexB - indexA
          })

          sortedEntries.forEach(([, item]) => {
            if (!item) return
            const promptId = item.prompt?.[1]
            const managedOwner = promptId
              ? get().generationSnapshot?.jobs.find((job) => job.prompt_id === promptId)?.session_id
              : undefined
            const legacyOwner = item.prompt?.[3]?.client_id
            const isOwnPrompt = managedOwner !== undefined
              ? managedOwner === clientId
              : typeof legacyOwner === 'string'
                ? legacyOwner === clientId
                : undefined
            if (item.outputs) {
              Object.values(item.outputs).forEach((out) => {
                if (out?.images) {
                  out.images.forEach((img) => {
                    const url = `/api/comfy/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${encodeURIComponent(promptId ?? '')}`
                    allImages.push(url)
                    if (isOwnPrompt === true) ownImages.push(url)
                    else if (isOwnPrompt === false) foreignImages.push(url)
                  })
                }
              })
            }
          })

          const nextComfyHistoryImages = allImages.slice(0, 200)

          set((state) => {
            const foreignIdentities = new Set(foreignImages.map(historyImageIdentity).filter((identity): identity is string => identity !== null))
            const retainedCache = state.batchImages.filter((image) => {
              const identity = historyImageIdentity(image)
              return identity === null || !foreignIdentities.has(identity)
            })
            const nextBatch = Array.from(new Set([...ownImages, ...retainedCache])).slice(0, 200)
            localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(nextBatch))

            const preserveSelection = preserveSelectionForActiveHistoryFetch
            const nextSelected = preserveSelection
              ? state.selectedImg
              : state.selectedImg || (state.filterOwnSession ? nextBatch[0] : allImages[0]) || null

            if (!preserveSelection && nextSelected && !state.selectedImg) {
              localStorage.setItem(LS_KEYS.SELECTED_IMG, nextSelected)
            }

            return {
              comfyHistoryImages: nextComfyHistoryImages,
              batchImages: nextBatch,
              selectedImg: preserveSelection ? state.selectedImg : nextSelected,
            }
          })
          window.dispatchEvent(
            new CustomEvent('comfy-job-event', {
              detail: {
                type: 'history-fetched',
                allImages: nextComfyHistoryImages,
                ownImages: ownImages.slice(0, 200),
              },
            })
          )
        } catch (e) {
          console.error('Failed to fetch comfy history:', e)
        }
      }
      const fetchPromise = execute()
      comfyWsService.setActiveFetchHistoryPromise(fetchPromise)
      try {
        await fetchPromise
      } finally {
        preserveSelectionForActiveHistoryFetch = false
        comfyWsService.setActiveFetchHistoryPromise(null)
      }
    },

    fetchQueue: async () => {
      set({ generationSyncing: true })
      try {
        const [snapshot, upstream] = await Promise.all([generationApi.getState(), generationApi.getUpstreamQueue()])
        // Apply through the shared epoch/revision gate so a delayed HTTP
        // response cannot roll back a newer WebSocket snapshot.
        if (!get().applyGenerationSnapshot(snapshot, upstream)) {
          set({ generationSyncing: false })
          return
        }
        set({ generationSyncing: false })
        const current = get()
        if (current.queueRunning.length) {
          const active = current.queueRunning[0]
          if (active[3]?.client_id) set({ activeClientId: active[3].client_id })
          if (!get().currentWorkflow && active[2] && typeof active[2] === 'object' && !active[2].job_id) {
            set({ currentWorkflow: active[2] })
          }
        }
        const activeBatch = get().activeBatch
        if (activeBatch && !get().isBatchSubmitting) {
          const jobs = new Map((current.generationSnapshot?.jobs ?? []).map((job) => [job.job_id, job]))
          const updated = activeBatch.map((item) => {
            const job = jobs.get(item.promptId)
            if (!job) return item
            const status: BatchJob['status'] = job.status === 'running' ? 'generating' :
              job.status === 'succeeded' ? 'completed' : job.status === 'failed' || job.status === 'cancelled' ? 'failed' : 'pending'
            return { ...item, status }
          })
          const unfinished = updated.some((item) => item.status === 'pending' || item.status === 'generating')
          set({ activeBatch: unfinished ? updated : null, isGenerating: unfinished })
        }
      } catch (error) {
        console.error('Failed to fetch generation queue:', error)
        set({ generationSyncing: false })
      }
    },

    cancelJob: async (id: string) => {
      get().abortSubmission()
      const active = comfyWsService.getActiveSubmissionPromise()
      if (active) { try { await active } catch {} }
      const job = get().generationSnapshot?.jobs.find((item) => item.job_id === id || item.prompt_id === id)
      let result: CancelResult
      if (job) result = await generationApi.cancelJob(job.job_id)
      else {
        const operation = await generationApi.cancel({ mode: 'single', scope: 'all', target: { prompt_id: id } })
        result = operation.items[0] ?? { job_id: null, prompt_id: id, status: null, outcome: 'rejected', message: operation.message }
      }
      await get().fetchQueue()
      return result
    },

    clearPendingQueue: async (scope: CancelScope = 'all') => {
      get().abortSubmission()
      const active = comfyWsService.getActiveSubmissionPromise()
      if (active) { try { await active } catch {} }
      const operation = await generationApi.cancel({ mode: 'queued', scope })
      await get().fetchQueue()
      return operation
    },

    cancelAllJobs: async (scope: CancelScope = 'all') => {
      get().cancelVramWait()
      get().abortSubmission()
      const active = comfyWsService.getActiveSubmissionPromise()
      if (active) { try { await active } catch {} }
      const operation = await generationApi.cancel({ mode: 'all', scope })
      await get().fetchQueue()
      return operation
    },

  }
}
