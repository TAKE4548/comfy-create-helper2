import type { StateCreator } from 'zustand'
import { decodeGenerationEnvelope, decodeGenerationSnapshot, generationApi } from '../../api/domains/generation'
import type { GenerationSnapshot, UpstreamQueueView } from '../../api/domains/generation'
import { systemWsService } from '../services/systemWsService'
import { projectQueue } from './jobQueueSlice'
import { LS_KEYS } from '../../utils/localStorageKeys'
import type { GenerationState, ConnectionState, ConnectionActions } from '../types'

export type ConnectionSlice = ConnectionState & ConnectionActions

export function resolveNodeTitle(
  workflow: Record<string, any> | null | undefined,
  nodeId: string | null | undefined,
): string | null {
  if (!workflow || !nodeId) return null
  const nodeInfo = workflow[nodeId]
  if (!nodeInfo) return null
  return nodeInfo._meta?.title || nodeInfo.class_type || null
}

function makeSessionId(): string {
  return `prompt-surgeon-${Math.random().toString(36).slice(2, 9)}`
}

function readSessionId(): string {
  let stored: string | null = null
  try { stored = localStorage.getItem(LS_KEYS.CLIENT_ID) } catch { /* storage can be blocked */ }
  if (stored) return stored
  const fallback = makeSessionId()
  try { localStorage.setItem(LS_KEYS.CLIENT_ID, fallback) } catch { /* retain this tab's fallback */ }
  return fallback
}

const emptyUpstreamQueue: UpstreamQueueView = { running: [], pending: [] }

function imageIdentity(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin)
    const filename = parsed.searchParams.get('filename')
    if (!filename) return null
    return JSON.stringify([
      filename,
      parsed.searchParams.get('subfolder') ?? '',
      parsed.searchParams.get('type') ?? 'output',
    ])
  } catch {
    return null
  }
}

function mergeImagesByIdentity(additions: string[], existing: string[]): string[] {
  const result: string[] = []
  const identities = new Set<string>()
  const exactUrls = new Set<string>()
  for (const url of [...additions, ...existing]) {
    const identity = imageIdentity(url)
    if (exactUrls.has(url) || (identity !== null && identities.has(identity))) continue
    exactUrls.add(url)
    if (identity !== null) identities.add(identity)
    result.push(url)
    if (result.length >= 200) break
  }
  return result
}

export const createConnectionSlice: StateCreator<GenerationState, [], [], ConnectionSlice> = (set, get) => {
  const clientId = readSessionId()
  let unsubscribe: (() => void) | null = null
  let lastUpstreamQueue = emptyUpstreamQueue
  let snapshotApplySequence = 0
  let httpRequestSequence = 0
  let queueRequestSequence = 0
  let lastManagedHistorySignature: string | null = null
  let lastObservedPreview: { epoch: string; jobId: string; url: string } | null = null
  const automaticResyncEpochs = new Set<string>()
  const retiredEpochs = new Set<string>()

  const refreshUpstreamQueue = (snapshot: GenerationSnapshot) => {
    const requestSequence = ++queueRequestSequence
    void generationApi.getUpstreamQueue().then((upstream) => {
      const current = get().generationSnapshot
      if (requestSequence !== queueRequestSequence || !current ||
          current.epoch !== snapshot.epoch || current.revision !== snapshot.revision) return
      lastUpstreamQueue = upstream
      const projected = projectQueue(current, upstream)
      set({ queueRunning: projected.running, queuePending: projected.pending })
    }).catch(() => {
      // Keep the last valid generation snapshot and last observed upstream queue.
    })
  }

  const notifyTransitions = (previous: GenerationSnapshot | null, next: GenerationSnapshot): { image: string; jobId: string } | null => {
    if (!previous || previous.epoch !== next.epoch) return null
    const previousJobs = new Map(previous.jobs.map((item) => [item.job_id, item]))
    let autoFollowImage: { image: string; jobId: string } | null = null
    for (const item of next.jobs) {
      const old = previousJobs.get(item.job_id)
      if (old?.status === item.status) continue
      if (item.status === 'failed' && (!old || old.status !== 'failed') && item.failure?.outcome === 'failed') {
        get().setErrorToast({ message: item.failure.reason, type: 'error' })
      }
      if (item.status === 'succeeded' && item.outputs.length > 0) {
        const originalImages = item.outputs
          .filter((output) => output.availability !== 'missing')
          .map((output) => output.view_url)
          .filter(Boolean)
        if (originalImages.length === 0) continue
        const isOwn = item.session_id === clientId
        window.dispatchEvent(new CustomEvent('comfy-job-event', {
          detail: {
            type: 'executed',
            promptId: item.prompt_id ?? item.job_id,
            images: originalImages,
            isOwn,
          },
        }))
        if (isOwn && get().previewAutoFollow) autoFollowImage = { image: originalImages[0], jobId: item.job_id }
      }
    }
    return autoFollowImage
  }

  const mergeManagedHistory = (snapshot: GenerationSnapshot, force = false) => {
    const succeeded = snapshot.jobs
      .filter((job) => job.status === 'succeeded')
      .slice()
      .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))
      .flatMap((job) => job.outputs
        .filter((output) => output.availability !== 'missing' && Boolean(output.view_url))
        .map((output) => ({ sessionId: job.session_id, url: output.view_url })))
    const signature = JSON.stringify(succeeded)
    if (!force && signature === lastManagedHistorySignature) return
    lastManagedHistorySignature = signature

    set((state) => {
      const managedAll = succeeded.map((item) => item.url)
      const managedOwn = succeeded.filter((item) => item.sessionId === clientId).map((item) => item.url)
      const foreignManagedIdentities = new Set(succeeded
        .filter((item) => item.sessionId !== clientId)
        .map((item) => imageIdentity(item.url))
        .filter((identity): identity is string => identity !== null))
      const comfyHistoryImages = mergeImagesByIdentity(managedAll, state.comfyHistoryImages)
      const ownCache = state.batchImages.filter((url) => {
        const identity = imageIdentity(url)
        return identity === null || !foreignManagedIdentities.has(identity)
      })
      const batchImages = mergeImagesByIdentity(managedOwn, ownCache)
      const same = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index])
      if (same(comfyHistoryImages, state.comfyHistoryImages) && same(batchImages, state.batchImages)) return state
      try { localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(batchImages)) } catch { /* cache persistence is optional */ }
      return { comfyHistoryImages, batchImages }
    })
  }

  const applyGenerationSnapshot = (candidate: GenerationSnapshot, upstream?: UpstreamQueueView): boolean => {
    let snapshot: GenerationSnapshot
    try { snapshot = decodeGenerationSnapshot(candidate) } catch { return false }
    const previous = get().generationSnapshot
    if (retiredEpochs.has(snapshot.epoch) && previous?.epoch !== snapshot.epoch) return false
    if (previous?.epoch === snapshot.epoch && snapshot.revision < previous.revision) return false
    if (upstream) lastUpstreamQueue = upstream
    if (previous?.epoch === snapshot.epoch && snapshot.revision === previous.revision) {
      const projected = projectQueue(snapshot, upstream ?? lastUpstreamQueue)
      set({
        queueRunning: projected.running,
        queuePending: projected.pending,
        generationSyncing: false,
        generationSyncIssue: null,
      })
      return true
    }
    if (previous && previous.epoch !== snapshot.epoch) retiredEpochs.add(previous.epoch)
    if (previous && previous.epoch !== snapshot.epoch) lastObservedPreview = null
    snapshotApplySequence++
    const autoFollowImage = notifyTransitions(previous, snapshot)
    const succeededJobs = snapshot.jobs.filter(
      (job) => job.status === 'succeeded' && job.outputs && job.outputs.length > 0
    )

    const ownActive = snapshot.jobs.filter((job) => job.session_id === clientId &&
      ['queued', 'submitting', 'running'].includes(job.status))
    const activeJob = ownActive.find((job) => job.status === 'running') ?? ownActive[0] ?? null
    const runningJob = activeJob?.status === 'running' ? activeJob : null
    const node = runningJob?.node ?? null
    const progress = node ? {
      value: node.value,
      max: node.max,
      percentage: node.max > 0 ? Math.round((node.value / node.max) * 100) : 0,
    } : null
    const previousPreview = get().previewImage
    let previewImage: string | null
    if (runningJob?.preview_url !== undefined && runningJob.preview_url !== null) {
      const isNewFrame = lastObservedPreview?.epoch !== snapshot.epoch ||
        lastObservedPreview.jobId !== runningJob.job_id || lastObservedPreview.url !== runningJob.preview_url
      if (isNewFrame) {
        lastObservedPreview = { epoch: snapshot.epoch, jobId: runningJob.job_id, url: runningJob.preview_url }
        previewImage = runningJob.preview_url
      } else {
        previewImage = previousPreview
      }
    } else {
      if (autoFollowImage !== null) lastObservedPreview = null
      previewImage = autoFollowImage !== null
        ? null
        : ownActive.length > 0 && previous?.epoch === snapshot.epoch ? previousPreview : null
    }
    if (ownActive.length === 0) lastObservedPreview = null
    const projected = projectQueue(snapshot, lastUpstreamQueue)
    const currentPromptId = activeJob ? (activeJob.prompt_id ?? activeJob.job_id) : null
    const startTime = runningJob?.started_at ? Date.parse(runningJob.started_at) : null
    const validStartTime = startTime !== null && Number.isFinite(startTime) ? startTime : null
    let batchState: Pick<GenerationState, 'activeBatch' | 'isBatchSubmitting'> | null = null
    const currentBatch = get().activeBatch
    if (currentBatch?.length) {
      const jobsById = new Map(snapshot.jobs.flatMap((item) => [[item.job_id, item], ...(item.prompt_id ? [[item.prompt_id, item] as const] : [])]))
      const batchJobs = currentBatch.map((item) => jobsById.get(item.promptId))
      if (batchJobs.some((item) => item?.scope === 'studio' && item.status === 'cancelled')) {
        batchState = { activeBatch: null, isBatchSubmitting: false }
      } else {
        const updatedBatch = currentBatch.map((item, index) => {
          const job = batchJobs[index]
          if (!job) return item
          const status = job.status === 'running' ? 'generating' as const :
            job.status === 'succeeded' ? 'completed' as const :
              job.status === 'failed' || job.status === 'cancelled' || job.status === 'released' ? 'failed' as const : 'pending' as const
          return { ...item, status }
        })
        const unfinished = updatedBatch.some((item, index) => {
          if (batchJobs[index]?.status === 'unconfirmed') return false
          return item.status === 'pending' || item.status === 'generating'
        })
        batchState = { activeBatch: unfinished ? updatedBatch : null, isBatchSubmitting: unfinished ? get().isBatchSubmitting : false }
      }
    }

    set({
      generationSnapshot: snapshot,
      generationSyncing: false,
      generationSyncIssue: null,
      queueRunning: projected.running,
      queuePending: projected.pending,
      isGenerating: activeJob !== null,
      progress,
      currentNode: node ? { id: node.id, name: node.name } : null,
      nodeProgress: node ? { ...progress!, nodeId: node.id, nodeName: node.name } : null,
      previewImage,
      ...(autoFollowImage ? { selectedImg: autoFollowImage.image } : {}),
      currentPromptId,
      activeClientId: activeJob?.session_id ?? null,
      generationStartTime: validStartTime,
      ...(batchState ?? {}),
    })
    if (autoFollowImage) {
      try { localStorage.setItem(LS_KEYS.SELECTED_IMG, autoFollowImage.image) } catch { /* selection persistence is optional */ }
    }
    if (succeededJobs.length > 0) {
      mergeManagedHistory({ ...snapshot, jobs: succeededJobs })
    }
    try {
      if (currentPromptId) localStorage.setItem(LS_KEYS.CURRENT_PROMPT_ID, currentPromptId)
      else localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
    } catch { /* session persistence is optional */ }
    if (!upstream) refreshUpstreamQueue(snapshot)
    return true
  }

  const setSyncFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Generation state synchronization failed'
    const unsupported = /unsupported generation state version/i.test(message)
    set({
      generationSyncing: false,
      generationSyncIssue: {
        kind: unsupported ? 'unsupported' : 'error',
        message: unsupported ? 'この生成状態のバージョンには対応していません。ページを再読込してください。' : message,
      },
    })
  }

  const loadSnapshot = async (automaticEpoch?: string) => {
    if (automaticEpoch !== undefined) {
      if (automaticResyncEpochs.has(automaticEpoch)) return
      automaticResyncEpochs.add(automaticEpoch)
    }
    const requestSequence = ++httpRequestSequence
    const snapshotSequenceAtStart = snapshotApplySequence
    set({ generationSyncing: true })
    try {
      const snapshot = await generationApi.getState()
      if (requestSequence !== httpRequestSequence || snapshotSequenceAtStart !== snapshotApplySequence) return
      if (!get().applyGenerationSnapshot(snapshot)) {
        set({ generationSyncing: false })
      }
    } catch (error) {
      if (requestSequence !== httpRequestSequence || snapshotSequenceAtStart !== snapshotApplySequence) return
      setSyncFailure(error)
    }
  }

  const getResyncEpoch = (value: unknown): string => {
    if (typeof value === 'object' && value !== null && 'epoch' in value && typeof value.epoch === 'string') {
      return value.epoch
    }
    return get().generationSnapshot?.epoch ?? 'unknown'
  }

  const handleMessage = (value: Record<string, unknown>) => {
    let envelope
    try {
      envelope = decodeGenerationEnvelope(value)
    } catch {
      const epoch = getResyncEpoch(value)
      void loadSnapshot(epoch)
      return
    }
    const previous = get().generationSnapshot
    if (previous?.epoch === envelope.epoch && envelope.revision <= previous.revision) return
    const hasGap = previous?.epoch === envelope.epoch && envelope.revision > previous.revision + 1
    const applied = get().applyGenerationSnapshot(envelope.data)
    if (applied && hasGap) {
      void loadSnapshot(envelope.epoch)
    }
  }

  return {
    clientId,
    isConnected: false,
    isGenerating: false,
    progress: null,
    currentWorkflow: null,
    currentNode: null,
    nodeProgress: null,
    generationStartTime: null,
    previewImage: null,
    currentPromptId: null,
    activeClientId: null,
    comfyUrl: (() => { try { return localStorage.getItem(LS_KEYS.COMFY_URL) } catch { return null } })(),
    submissionAbortController: null,
    generationSyncing: false,
    generationSyncIssue: null,

    setSubmissionAbortController: (controller) => set({ submissionAbortController: controller }),
    abortSubmission: () => {
      const controller = get().submissionAbortController
      if (controller) {
        controller.abort()
        set({ submissionAbortController: null })
      }
    },
    clearPreview: () => {
      const previous = get().previewImage
      if (previous?.startsWith('blob:')) {
        try { URL.revokeObjectURL(previous) } catch { /* already released */ }
      }
      set({ previewImage: null, progress: null })
    },
    setComfyUrl: (url) => {
      try { localStorage.setItem(LS_KEYS.COMFY_URL, url) } catch { /* setting is optional */ }
      set({ comfyUrl: url })
      get().initialize({ force: true })
    },
    initialize: (options) => {
      try { localStorage.setItem(LS_KEYS.CLIENT_ID, clientId) } catch { /* session id remains available in this tab */ }
      if (options?.force) {
        unsubscribe?.()
        unsubscribe = null
        httpRequestSequence++
        automaticResyncEpochs.clear()
        set({ generationSyncIssue: null })
      } else if (unsubscribe) {
        return
      }
      unsubscribe = systemWsService.subscribe(
        handleMessage,
        () => {
          set({ isConnected: true })
          void loadSnapshot()
        },
        () => set({ isConnected: false }),
      )
    },
    applyGenerationSnapshot,
    loadSnapshot,
  }
}
