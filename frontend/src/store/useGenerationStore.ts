/**
 * Generation store — global state for ComfyUI connection, generation progress,
 * workflow selection, parameters, assets, and session persistence.
 *
 * Heavy utilities (prompt manipulation, localStorage keys) are delegated to:
 *   - src/utils/promptUtils.ts
 *   - src/utils/localStorageKeys.ts
 *
 * ComfyUI HTTP helpers (fetchHistory, fetchQueue, queuePrompt, cancelGeneration)
 * live here as they are tightly coupled to the WebSocket state machine.
 */

import { create } from 'zustand'
import { configApi, bypassProfilesApi, paramSyncGroupsApi, comfyApi } from '../api/client'
import type { BypassProfile, ParamSyncGroup, ParamSyncGroupCreate, ParamSyncGroupUpdate, WorkflowPreset } from '../api/types'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'
import { LS_KEYS } from '../utils/localStorageKeys'
import { addAssetToPrompt, removeAssetFromPrompt } from '../utils/promptUtils'

// ─── Re-export helpers for backward compatibility ─────────────────
export { addAssetToPrompt, removeAssetFromPrompt } from '../utils/promptUtils'

// ─── Type definitions ─────────────────────────────────────────────

export interface BatchJob {
  promptId: string;
  setName: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface ComfyProgress {
  value: number
  max: number
  percentage: number
}

export interface NodeProgress {
  value: number
  max: number
  percentage: number
  nodeId?: string
  nodeName?: string
}

export interface ComfyHistoryOutput {
  images?: Array<{
    filename: string
    subfolder: string
    type: string
  }>
}

export interface ComfyHistoryItem {
  outputs: Record<string, ComfyHistoryOutput>
  prompt: [
    number,              // prompt index
    string,              // prompt_id
    Record<string, any>, // workflow JSON
    {
      client_id?: string
      [key: string]: any
    },                   // extra_data
    any[]                // outputs info
  ]
  status: {
    completed: boolean
    [key: string]: any
  }
}

export interface ComfyQueueResponse {
  queue_running: Array<[number, string, any, { client_id?: string }, any]>
  queue_pending: Array<[number, string, any, { client_id?: string }, any]>
}

export interface AppliedAsset {
  id: string;              // unique key (e.g. `lora-1-12345`)
  type: 'lora' | 'tagset';
  assetId: number;         // DB ID
  name: string;            // display name
  enabled: boolean;        // toggle state
  tags: string[];          // tagset tags or LoRA trigger words
  loraPromptString?: string; // LoRA prompt string `<lora:filename:strength>`
}

export interface GenerationSet {
  id: string | number
  name: string
  paramValues: Record<string, string>
  appliedAssets: Record<string, AppliedAsset[]>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
  checked: boolean
}

export interface ComfyQueueDeletePayload {
  delete: string[]
}

export interface ComfyQueueClearPayload {
  clear: true
}

export interface ComfyHistoryDeletePayload {
  delete: string[]
}

export interface QueuePromptOptions {
  skipQueueFetch?: boolean;
  signal?: AbortSignal;
  isBatchIntermediate?: boolean;
}

export interface GenerationState {
  // ─── Connection ────────────────────────────────────────────────
  clientId: string
  isConnected: boolean
  isGenerating: boolean
  progress: ComfyProgress | null
  currentWorkflow: Record<string, any> | null
  currentNode: { id: string; name: string } | null
  nodeProgress: NodeProgress | null
  generationStartTime: number | null
  previewImage: string | null
  currentPromptId: string | null
  activeClientId: string | null
  comfyUrl: string | null

  // ─── Submission Abort Controller ──────────────────────────────
  submissionAbortController: AbortController | null
  setSubmissionAbortController: (controller: AbortController | null) => void
  abortSubmission: () => void

  // ─── UI / Workflow ─────────────────────────────────────────────
  filterOwnSession: boolean
  selectedWorkflowId: number | null
  paramValues: Record<string, string>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
  batchImages: string[]
  selectedImg: string | null
  comfyHistoryImages: string[]
  appliedAssets: Record<string, AppliedAsset[]>
  queueRunning: Array<[number, string, any, { client_id?: string }, any]>
  queuePending: Array<[number, string, any, { client_id?: string }, any]>

  // ─── Bypass Profiles State ─────────────────────────────────────
  bypassProfiles: BypassProfile[]
  bypassProfilesCache: Record<number, BypassProfile[]>
  paramSyncGroups: ParamSyncGroup[]
  paramSyncGroupsCache: Record<number, ParamSyncGroup[]>
  errorToast: { message: string; type: 'error' | 'success' } | null

  // ─── Multi-Set State (New) ─────────────────────────────────────
  sets: GenerationSet[]
  activeSetId: string | number | null
  openPresetIds: (string | number)[]
  
  // ─── Batch Job State ───────────────────────────────────────────
  isBatchSubmitting: boolean
  setIsBatchSubmitting: (value: boolean) => void
  activeBatch: BatchJob[] | null
  setActiveBatch: (batch: BatchJob[] | null) => void
  updateBatchJobStatus: (promptId: string, status: BatchJob['status']) => void

  // ─── Actions ───────────────────────────────────────────────────
  initialize: () => void
  setFilterOwnSession: (filter: boolean) => void
  setSelectedWorkflowId: (id: number | null) => void
  setParamValues: (values: Record<string, string>) => void
  setBatchSize: (size: number) => void
  setSeedMode: (mode: 'random' | 'fixed') => void
  setSeed: (seed: number) => void
  setSelectedImg: (img: string | null) => void
  addAppliedAsset: (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => void
  removeAppliedAsset: (role: string, id: string) => void
  toggleAppliedAsset: (role: string, id: string) => void
  setAppliedAssets: (assets: Record<string, AppliedAsset[]>) => void
  queuePrompt: (
    workflow: Record<string, unknown>,
    metadata?: {
      paramValues?: Record<string, string>;
      appliedAssets?: Record<string, AppliedAsset[]>;
    },
    options?: QueuePromptOptions
  ) => Promise<string | null>
  cancelGeneration: () => void
  clearPreview: () => void
  fetchHistory: () => Promise<void>
  fetchQueue: () => Promise<void>
  setComfyUrl: (url: string) => void
  clearPendingQueue: () => Promise<void>
  cancelJob: (promptId: string) => Promise<void>
  cancelAllJobs: () => Promise<void>

  setErrorToast: (toast: { message: string; type: 'error' | 'success' } | null) => void
  fetchBypassProfiles: (workflowId: number) => Promise<void>
  createBypassProfile: (workflowId: number, name: string, nodeIds: string[]) => Promise<void>
  updateBypassProfile: (profileId: number, data: { name?: string; bypassed_node_ids?: string[]; is_enabled?: boolean }) => Promise<void>
  deleteBypassProfile: (profileId: number) => Promise<void>

  fetchParamSyncGroups: (workflowId: number) => Promise<void>
  createParamSyncGroup: (workflowId: number, data: ParamSyncGroupCreate) => Promise<ParamSyncGroup>
  updateParamSyncGroup: (id: number, data: ParamSyncGroupUpdate) => Promise<ParamSyncGroup>
  deleteParamSyncGroup: (id: number) => Promise<void>
  toggleParamSyncGroup: (id: number, isEnabled: boolean) => Promise<void>

  // ─── Multi-Set Actions (New) ───────────────────────────────────
  initSets: (workflowId: number) => void
  setActiveSetId: (id: string | number) => void
  loadPresetData: (preset: WorkflowPreset, defaultParams: Record<string, string>) => void
  addSet: () => void
  removeSet: (id: string | number) => void
  renameSet: (id: string | number, name: string) => void
  toggleSetChecked: (id: string | number) => void
  setAllSetsChecked: (checked: boolean) => void
  updateActiveSet: (updates: Partial<Omit<GenerationSet, 'id' | 'name'>>) => void
  setSets: (sets: GenerationSet[]) => void
  openPreset: (id: string | number) => void
  closePreset: (id: string | number) => void
}

// ─── Module-level WebSocket singleton ─────────────────────────────
let ws: WebSocket | null = null
let comfyUrl: string | null = null
let isInitializing = false
let reconnectTimer: any = null
let activeSubmissionPromise: Promise<string | null> | null = null

export const _resetWebSocketForTesting = () => {
  if (ws) {
    try {
      ws.close()
    } catch {}
    ws = null
  }
  isInitializing = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  activeSubmissionPromise = null
}

// ─── Store ────────────────────────────────────────────────────────
export const useGenerationStore = create<GenerationState>((set, get) => {
  // ── Restore persisted state ──────────────────────────────────
  const storedClientId =
    localStorage.getItem(LS_KEYS.CLIENT_ID) ||
    'prompt-surgeon-' + Math.random().toString(36).slice(2, 9)
  localStorage.setItem(LS_KEYS.CLIENT_ID, storedClientId)

  const storedFilterOwn = localStorage.getItem(LS_KEYS.FILTER_OWN) === 'true'
  const storedWorkflowId = localStorage.getItem(LS_KEYS.WORKFLOW_ID)
    ? Number(localStorage.getItem(LS_KEYS.WORKFLOW_ID))
    : null

  let initialSets: GenerationSet[] = []
  let initialActiveSetId: string | number | null = null
  let initialOpenPresetIds: (string | number)[] = []
  let storedParams: Record<string, string> = {}
  let storedAppliedAssets: Record<string, AppliedAsset[]> = {}
  let storedBatchSize = 1
  let storedSeedMode: 'random' | 'fixed' = 'random'
  let storedSeed = 42

  if (storedWorkflowId !== null) {
    try {
      initialActiveSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + storedWorkflowId)
    } catch {}

    storedBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
    storedSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
    storedSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

    try {
      const stored = localStorage.getItem(`prompt-surgeon-open-presets-${storedWorkflowId}`)
      if (stored) {
        initialOpenPresetIds = JSON.parse(stored)
      }
    } catch {}
  }

  let storedBatchImages: string[] = []
  try {
    storedBatchImages = JSON.parse(localStorage.getItem(LS_KEYS.BATCH_IMAGES) || '[]')
    storedBatchImages = storedBatchImages.filter((img) => !img.startsWith('blob:'))
  } catch {}

  const storedSelectedImg = localStorage.getItem(LS_KEYS.SELECTED_IMG)
  const verifiedSelectedImg =
    storedSelectedImg && !storedSelectedImg.startsWith('blob:') ? storedSelectedImg : null

  const storedCurrentPromptId = localStorage.getItem(LS_KEYS.CURRENT_PROMPT_ID)

  // ── Reconcile generation state on startup ────────────────────
  const reconcileState = async (url: string) => {
    try {
      const promptId = get().currentPromptId
      if (promptId) {
        const historyRes = await fetch(`${url}/history/${promptId}`)
        if (historyRes.ok) {
          const historyData = await historyRes.json()
          if (historyData[promptId]) {
            const item = historyData[promptId] as ComfyHistoryItem
            const imagesList: string[] = []
            Object.values(item.outputs).forEach((out) => {
              if (out.images) {
                out.images.forEach((img) => {
                  imagesList.push(
                    `${url}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${promptId}`
                  )
                })
              }
            })
            if (imagesList.length > 0) {
              const finalImg = imagesList[0]
              set((state) => {
                const nextImages = [finalImg, ...state.batchImages.filter((x) => x !== finalImg)].slice(0, 8)
                localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(nextImages))
                localStorage.setItem(LS_KEYS.SELECTED_IMG, finalImg)
                return {
                  previewImage: null,
                  batchImages: nextImages,
                  selectedImg: finalImg,
                  isGenerating: false,
                  currentPromptId: null,
                }
              })
              localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
            }
          }
        }
      }

      const queueRes = await fetch(`${url}/queue`)
      if (queueRes.ok) {
        const queueData = (await queueRes.json()) as ComfyQueueResponse
        const running = queueData.queue_running || []
        const pending = queueData.queue_pending || []
        set({ queueRunning: running, queuePending: pending })

        const activeJob = running.length > 0 ? running[0] : null
        if (activeJob) {
          const activePromptId = activeJob[1]
          const jobClientId = activeJob[3]?.client_id || null
          set({ isGenerating: true, currentPromptId: activePromptId, activeClientId: jobClientId })
          localStorage.setItem(LS_KEYS.CURRENT_PROMPT_ID, activePromptId)
        } else if (promptId) {
          set({ isGenerating: false, currentPromptId: null, activeClientId: null })
          localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        }
      }

      get().fetchHistory()
      get().fetchQueue()
    } catch (e) {
      console.error('Failed to reconcile generation state:', e)
    }
  }

  return {
    // ── Initial state ────────────────────────────────────────
    clientId: storedClientId,
    isConnected: false,
    isGenerating: false,
    progress: null,
    currentWorkflow: null,
    currentNode: null,
    nodeProgress: null,
    generationStartTime: null,
    previewImage: null,
    currentPromptId: storedCurrentPromptId,
    activeClientId: null,
    comfyUrl: localStorage.getItem(LS_KEYS.COMFY_URL),
    filterOwnSession: storedFilterOwn,
    selectedWorkflowId: storedWorkflowId,
    paramValues: storedParams,
    batchSize: storedBatchSize,
    seedMode: storedSeedMode,
    seed: storedSeed,
    batchImages: storedBatchImages,
    selectedImg: verifiedSelectedImg,
    comfyHistoryImages: [],
    appliedAssets: storedAppliedAssets,
    queueRunning: [],
    queuePending: [],
    bypassProfiles: [],
    bypassProfilesCache: {},
    paramSyncGroups: [],
    paramSyncGroupsCache: {},
    errorToast: null,
    sets: initialSets,
    activeSetId: initialActiveSetId,
    openPresetIds: initialOpenPresetIds,
    isBatchSubmitting: false,
    setIsBatchSubmitting: (value) => set({ isBatchSubmitting: value }),
    activeBatch: null,

    // ─── Submission Abort Controller ──────────────────────────────
    submissionAbortController: null,
    setSubmissionAbortController: (controller) => set({ submissionAbortController: controller }),
    abortSubmission: () => {
      const controller = get().submissionAbortController
      if (controller) {
        controller.abort()
        set({ submissionAbortController: null })
      }
    },

    // ── Actions ──────────────────────────────────────────────
    setErrorToast: (toast) => set({ errorToast: toast }),

    fetchBypassProfiles: async (workflowId) => {
      const cached = get().bypassProfilesCache[workflowId]
      if (cached) {
        set({ bypassProfiles: cached })
      }
      try {
        const profiles = await bypassProfilesApi.list(workflowId)
        set((state) => ({
          bypassProfiles: profiles,
          bypassProfilesCache: { ...state.bypassProfilesCache, [workflowId]: profiles },
        }))
      } catch (e) {
        console.error('Failed to fetch bypass profiles:', e)
      }
    },

    createBypassProfile: async (workflowId, name, nodeIds) => {
      try {
        const newProfile = await bypassProfilesApi.create(workflowId, { name, bypassed_node_ids: nodeIds })
        set((state) => {
          const updated = [...state.bypassProfiles, newProfile]
          return {
            bypassProfiles: updated,
            bypassProfilesCache: { ...state.bypassProfilesCache, [workflowId]: updated },
          }
        })
      } catch (e) {
        console.error('Failed to create bypass profile:', e)
      }
    },

    updateBypassProfile: async (profileId, data) => {
      try {
        const updated = await bypassProfilesApi.update(profileId, data)
        set((state) => {
          const nextProfiles = state.bypassProfiles.map((p) => (p.id === profileId ? updated : p))
          const nextCache: Record<number, BypassProfile[]> = {}
          for (const [wid, list] of Object.entries(state.bypassProfilesCache)) {
            nextCache[Number(wid)] = list.map((p) => (p.id === profileId ? updated : p))
          }
          return {
            bypassProfiles: nextProfiles,
            bypassProfilesCache: nextCache,
          }
        })
      } catch (e) {
        console.error('Failed to update bypass profile:', e)
      }
    },

    deleteBypassProfile: async (profileId) => {
      try {
        await bypassProfilesApi.delete(profileId)
        set((state) => {
          const nextProfiles = state.bypassProfiles.filter((p) => p.id !== profileId)
          const nextCache: Record<number, BypassProfile[]> = {}
          for (const [wid, list] of Object.entries(state.bypassProfilesCache)) {
            nextCache[Number(wid)] = list.filter((p) => p.id !== profileId)
          }
          return {
            bypassProfiles: nextProfiles,
            bypassProfilesCache: nextCache,
          }
        })
      } catch (e) {
        console.error('Failed to delete bypass profile:', e)
      }
    },

    fetchParamSyncGroups: async (workflowId) => {
      const cached = get().paramSyncGroupsCache[workflowId]
      if (cached) {
        set({ paramSyncGroups: cached })
      }
      try {
        const groups = await paramSyncGroupsApi.list(workflowId)
        set((state) => ({
          paramSyncGroups: groups,
          paramSyncGroupsCache: { ...state.paramSyncGroupsCache, [workflowId]: groups },
        }))
      } catch (e) {
        console.error('Failed to fetch param sync groups:', e)
      }
    },

    createParamSyncGroup: async (workflowId, data) => {
      const newGroup = await paramSyncGroupsApi.create(workflowId, data)
      set((state) => {
        const updated = [...state.paramSyncGroups, newGroup]
        return {
          paramSyncGroups: updated,
          paramSyncGroupsCache: { ...state.paramSyncGroupsCache, [workflowId]: updated },
        }
      })
      return newGroup
    },

    updateParamSyncGroup: async (id, data) => {
      const updated = await paramSyncGroupsApi.update(id, data)
      set((state) => {
        const nextGroups = state.paramSyncGroups.map((g) => (g.id === id ? updated : g))
        const nextCache: Record<number, ParamSyncGroup[]> = {}
        for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
          nextCache[Number(wid)] = list.map((g) => (g.id === id ? updated : g))
        }
        return {
          paramSyncGroups: nextGroups,
          paramSyncGroupsCache: nextCache,
        }
      })
      return updated
    },

    deleteParamSyncGroup: async (id) => {
      await paramSyncGroupsApi.delete(id)
      set((state) => {
        const nextGroups = state.paramSyncGroups.filter((g) => g.id !== id)
        const nextCache: Record<number, ParamSyncGroup[]> = {}
        for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
          nextCache[Number(wid)] = list.filter((g) => g.id !== id)
        }
        return {
          paramSyncGroups: nextGroups,
          paramSyncGroupsCache: nextCache,
        }
      })
    },

    toggleParamSyncGroup: async (id, isEnabled) => {
      const updated = await paramSyncGroupsApi.update(id, { is_enabled: isEnabled })
      set((state) => {
        const nextGroups = state.paramSyncGroups.map((g) => (g.id === id ? updated : g))
        const nextCache: Record<number, ParamSyncGroup[]> = {}
        for (const [wid, list] of Object.entries(state.paramSyncGroupsCache)) {
          nextCache[Number(wid)] = list.map((g) => (g.id === id ? updated : g))
        }
        return {
          paramSyncGroups: nextGroups,
          paramSyncGroupsCache: nextCache,
        }
      })
    },

    initialize: () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (isInitializing || ws) return
      isInitializing = true

      const initConnection = (url: string) => {
        comfyUrl = url
        set({ comfyUrl: url })
        const resolvedUrl = resolveComfyUrl(url)
        reconcileState(resolvedUrl)
        get().fetchHistory()

        const wsUrl = resolvedUrl.replace(/^http/, 'ws')
        try {
          ws = new WebSocket(`${wsUrl}/ws?clientId=${get().clientId}`)
          ws.binaryType = 'blob'
        } catch (e) {
          console.error('Failed to establish WebSocket connection:', e)
          set({ isConnected: false })
          return
        }

        ws.onopen = () => { set({ isConnected: true }); get().fetchQueue() }
        ws.onclose = () => {
          set({ isConnected: false })
          ws = null
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              get().initialize()
            }, 3000)
          }
        }
        ws.onerror = () => {
          set({ isConnected: false })
          if (ws) {
            try {
              ws.close()
            } catch {}
            ws = null
          }
        }

        ws.onmessage = (event) => {
          if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
            const blob = event.data instanceof Blob ? event.data : new Blob([event.data])
            set({ previewImage: URL.createObjectURL(blob) })
            return
          }
          try {
            const msg = JSON.parse(event.data)
            const type = msg.type as string
            const data = msg.data as Record<string, unknown>

            switch (type) {
              case 'status':
                get().fetchQueue()
                break

              case 'progress': {
                const value = data.value as number
                const max = data.max as number
                const nodeId = data.node as string | undefined
                
                let nodeName = get().currentNode?.name || ''
                if (nodeId) {
                  const nodeInfo = get().currentWorkflow?.[nodeId]
                  if (nodeInfo) {
                    nodeName = nodeInfo._meta?.title || nodeInfo.class_type || 'Unknown'
                  }
                }

                set({
                  isGenerating: true,
                  progress: { value, max, percentage: max > 0 ? Math.round((value / max) * 100) : 0 },
                  nodeProgress: {
                    value,
                    max,
                    percentage: max > 0 ? Math.round((value / max) * 100) : 0,
                    nodeId,
                    nodeName,
                  },
                })
                break
              }

              case 'execution_start': {
                const promptId = data.prompt_id as string
                const currentBatch = get().activeBatch
                const isOwnBatchJob = currentBatch ? currentBatch.some((job) => job.promptId === promptId) : false
                const hasUnfinishedBatch = currentBatch ? currentBatch.some((job) => job.status === 'pending' || job.status === 'generating') : false

                if (currentBatch) {
                  get().updateBatchJobStatus(promptId, 'generating')
                }
                set({
                  isGenerating: true,
                  progress: null,
                  currentPromptId: promptId,
                  activeClientId: (isOwnBatchJob || hasUnfinishedBatch) ? get().clientId : (get().activeClientId ?? get().clientId),
                  generationStartTime: Date.now(),
                  currentNode: null,
                  nodeProgress: null,
                })
                get().fetchQueue()
                break
              }

              case 'executing': {
                const nodeId = data.node !== undefined ? (data.node as string | null) : null
                const promptId = data.prompt_id as string | undefined
                if (nodeId) {
                  const nodeInfo = get().currentWorkflow?.[nodeId]
                  const nodeName = nodeInfo
                    ? (nodeInfo._meta?.title || nodeInfo.class_type || 'Unknown')
                    : 'Unknown'
                  
                  const running = get().queueRunning
                  const activeJob = running.length > 0 ? running[0] : null
                  const jobClientId = activeJob?.[3]?.client_id || get().activeClientId

                  set({
                    isGenerating: true,
                    currentPromptId: promptId || get().currentPromptId,
                    activeClientId: jobClientId,
                    currentNode: { id: nodeId, name: nodeName },
                    nodeProgress: {
                      value: 0,
                      max: 100,
                      percentage: 0,
                      nodeId,
                      nodeName,
                    },
                  })
                } else {
                  // nodeId === null は 1 つのジョブの実行完了
                  set({
                    currentNode: null,
                    nodeProgress: null,
                  })
                  get().fetchHistory()
                  get().fetchQueue()
                }
                break
              }

              case 'executed': {
                const output = data.output as Record<string, unknown> | undefined
                const images = output?.images as Array<{ filename: string; subfolder: string; type: string }> | undefined
                const promptId = data.prompt_id as string
                if (get().activeBatch) {
                  get().updateBatchJobStatus(promptId, 'completed')
                }
                if (images && images.length > 0) {
                  const baseUrl = resolveComfyUrl(comfyUrl!)
                  const newUrls = images.map((img) => 
                    `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${promptId}`
                  )
                  const firstUrl = newUrls[0]
                  set((state) => {
                    const nextImages = [...newUrls, ...state.batchImages.filter((x) => !newUrls.includes(x))].slice(0, 8)
                    const nextHistoryImages = [...newUrls, ...state.comfyHistoryImages.filter((x) => !newUrls.includes(x))].slice(0, 50)
                    localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(nextImages))
                    localStorage.setItem(LS_KEYS.SELECTED_IMG, firstUrl)
                    
                    const isStillGenerating = state.activeBatch
                      ? !state.activeBatch.every((job) => (job.promptId === promptId ? 'completed' : job.status) === 'completed' || (job.promptId === promptId ? 'completed' : job.status) === 'failed')
                      : false

                    return {
                      previewImage: null,
                      batchImages: nextImages,
                      comfyHistoryImages: nextHistoryImages,
                      selectedImg: firstUrl,
                      isGenerating: isStillGenerating,
                      currentPromptId: null,
                      activeClientId: null,
                      generationStartTime: isStillGenerating ? state.generationStartTime : null,
                      currentNode: isStillGenerating ? state.currentNode : null,
                      nodeProgress: isStillGenerating ? state.nodeProgress : null,
                      currentWorkflow: isStillGenerating ? state.currentWorkflow : null,
                    }
                  })
                  localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                  setTimeout(() => {
                    get().fetchHistory()
                  }, 500)
                }
                get().fetchQueue()
                window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'executed', promptId } }))
                break
              }

              case 'execution_complete': {
                const promptId = data.prompt_id as string
                const activeBatch = get().activeBatch
                if (activeBatch) {
                  get().updateBatchJobStatus(promptId, 'completed')
                }
                const isStillGenerating = activeBatch
                  ? !activeBatch.every((job) => job.status === 'completed' || job.status === 'failed')
                  : false
                set({
                  isGenerating: isStillGenerating,
                  progress: isStillGenerating ? get().progress : { value: 1, max: 1, percentage: 100 },
                  currentPromptId: null,
                  activeClientId: null,
                  generationStartTime: isStillGenerating ? get().generationStartTime : null,
                  currentNode: isStillGenerating ? get().currentNode : null,
                  nodeProgress: isStillGenerating ? get().nodeProgress : null,
                  currentWorkflow: isStillGenerating ? get().currentWorkflow : null,
                })
                localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                setTimeout(() => {
                  get().fetchHistory()
                }, 500)
                get().fetchQueue()
                window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'execution_complete', promptId } }))
                break
              }

              case 'execution_error': {
                const promptId = data.prompt_id as string
                const activeBatch = get().activeBatch
                if (activeBatch) {
                  get().updateBatchJobStatus(promptId, 'failed')
                }
                const isStillGenerating = activeBatch
                  ? !activeBatch.every((job) => job.status === 'completed' || job.status === 'failed')
                  : false
                set({
                  isGenerating: isStillGenerating,
                  progress: null,
                  currentPromptId: null,
                  activeClientId: null,
                  generationStartTime: isStillGenerating ? get().generationStartTime : null,
                  currentNode: isStillGenerating ? get().currentNode : null,
                  nodeProgress: isStillGenerating ? get().nodeProgress : null,
                  currentWorkflow: isStillGenerating ? get().currentWorkflow : null,
                })
                localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                get().fetchQueue()
                window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'execution_error', promptId } }))
                break
              }

              case 'execution_interrupted': {
                const promptId = data.prompt_id as string
                set({
                  isGenerating: false,
                  progress: null,
                  currentPromptId: null,
                  activeClientId: null,
                  generationStartTime: null,
                  currentNode: null,
                  nodeProgress: null,
                  currentWorkflow: null,
                  activeBatch: null,
                })
                localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                get().fetchQueue()
                window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'execution_interrupted', promptId } }))
                break
              }
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }




        }
      }

      const storedUrl = localStorage.getItem(LS_KEYS.COMFY_URL)
      if (storedUrl) {
        initConnection(storedUrl)
        isInitializing = false
      } else {
        configApi.get()
          .then((config) => {
            const url = config?.comfy_url || 'http://localhost:8188'
            initConnection(url)
          })
          .catch((e) => { console.error('Failed to initialize WebSocket store:', e) })
          .finally(() => { isInitializing = false })
      }
    },

    setFilterOwnSession: (filter) => {
      set({ filterOwnSession: filter })
      localStorage.setItem(LS_KEYS.FILTER_OWN, String(filter))
    },

    setActiveBatch: (batch) => set({ activeBatch: batch }),

    updateBatchJobStatus: (promptId, status) => {
      const batch = get().activeBatch
      if (!batch) return
      const updated = batch.map((job) => job.promptId === promptId ? { ...job, status } : job)
      set({ activeBatch: updated })

      const allFinished = updated.every((job) => job.status === 'completed' || job.status === 'failed')
      if (allFinished) {
        set({ isGenerating: false })
      }
    },

    setSelectedWorkflowId: (id) => {
      set({ selectedWorkflowId: id })
      if (id !== null) {
        localStorage.setItem(LS_KEYS.WORKFLOW_ID, String(id))
        
        let activeSetId: string | number | null = null
        try {
          activeSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + id)
        } catch {}

        const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
        const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
        const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

        let openPresetIds: (string | number)[] = []
        try {
          const stored = localStorage.getItem(`prompt-surgeon-open-presets-${id}`)
          if (stored) {
            openPresetIds = JSON.parse(stored)
          }
        } catch {}

        set({
          sets: [],
          activeSetId,
          openPresetIds,
          paramValues: {},
          appliedAssets: {},
          batchSize: defaultBatchSize,
          seedMode: defaultSeedMode,
          seed: defaultSeed
        })
        get().fetchParamSyncGroups(id)
      } else {
        localStorage.removeItem(LS_KEYS.WORKFLOW_ID)
        set({
          sets: [],
          activeSetId: null,
          openPresetIds: [],
          paramValues: {},
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          paramSyncGroups: [],
        })
      }
    },

    setParamValues: (values) => {
      set({ paramValues: values })
      get().updateActiveSet({ paramValues: values })
    },

    addAppliedAsset: (role, asset) => {
      const current = get().appliedAssets
      const newAsset: AppliedAsset = {
        ...asset,
        id: `${asset.type}-${asset.assetId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        enabled: true,
      }
      const updated = { ...current, [role]: [...(current[role] || []), newAsset] }
      const currentParams = get().paramValues
      const updatedParams = {
        ...currentParams,
        [role]: addAssetToPrompt(currentParams[role] || '', newAsset.tags, newAsset.loraPromptString),
      }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    removeAppliedAsset: (role, id) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const assetToRemove = roleAssets.find((a) => a.id === id)
      const updated = { ...current, [role]: roleAssets.filter((a) => a.id !== id) }
      let updatedParams = get().paramValues
      if (assetToRemove?.enabled) {
        const currentPrompt = updatedParams[role] || ''
        updatedParams = {
          ...updatedParams,
          [role]: removeAssetFromPrompt(currentPrompt, assetToRemove.tags, assetToRemove.loraPromptString),
        }
      }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    toggleAppliedAsset: (role, id) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const asset = roleAssets.find((a) => a.id === id)
      if (!asset) return
      const nextEnabled = !asset.enabled
      const updated = { ...current, [role]: roleAssets.map((a) => (a.id === id ? { ...a, enabled: nextEnabled } : a)) }
      const currentPrompt = get().paramValues[role] || ''
      const updatedPrompt = nextEnabled
        ? addAssetToPrompt(currentPrompt, asset.tags, asset.loraPromptString)
        : removeAssetFromPrompt(currentPrompt, asset.tags, asset.loraPromptString)
      const updatedParams = { ...get().paramValues, [role]: updatedPrompt }
      set({ appliedAssets: updated, paramValues: updatedParams })
      get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
    },

    setAppliedAssets: (assets) => {
      set({ appliedAssets: assets })
      get().updateActiveSet({ appliedAssets: assets })
    },

    setBatchSize: (size) => {
      set({ batchSize: size })
      localStorage.setItem(LS_KEYS.BATCH_SIZE, String(size))
      get().updateActiveSet({ batchSize: size })
    },
    setSeedMode: (mode) => {
      set({ seedMode: mode })
      localStorage.setItem(LS_KEYS.SEED_MODE, mode)
      get().updateActiveSet({ seedMode: mode })
    },
    setSeed: (seed) => {
      set({ seed })
      localStorage.setItem(LS_KEYS.SEED, String(seed))
      get().updateActiveSet({ seed })
    },

    setSelectedImg: (img) => {
      set({ selectedImg: img, previewImage: null })
      if (img && !img.startsWith('blob:')) {
        localStorage.setItem(LS_KEYS.SELECTED_IMG, img)
      } else {
        localStorage.removeItem(LS_KEYS.SELECTED_IMG)
      }
    },

    queuePrompt: async (workflow, metadata, options) => {
      if (options?.signal?.aborted) {
        return null
      }

      const execute = async (): Promise<string | null> => {
        try {
          const data = await comfyApi.queuePrompt({
            prompt: workflow,
            client_id: get().clientId
          })

          if (options?.signal?.aborted) {
            return null
          }

          if (data.error) {
            const errorMsg = typeof data.error === 'object'
              ? (data.error.message || data.error.details || JSON.stringify(data.error))
              : String(data.error)
            get().setErrorToast({ message: errorMsg, type: 'error' })
            throw new Error(errorMsg)
          }
          const promptId = data.prompt_id ?? null

          if (options?.signal?.aborted) {
            return null
          }

          if (promptId) {
            localStorage.setItem(LS_KEYS.CURRENT_PROMPT_ID, promptId)
          }
          if (options?.isBatchIntermediate) {
            set({
              isGenerating: true,
              currentPromptId: promptId,
              activeClientId: get().clientId,
            })
          } else {
            set({
              isGenerating: true,
              previewImage: null,
              progress: null,
              currentPromptId: promptId,
              activeClientId: get().clientId,
              currentWorkflow: workflow,
            })
            if (promptId) {
              // キャッシュ保存
              const metaKey = `prompt-surgeon-meta-${promptId}`
              const promptMetadata = {
                paramValues: metadata?.paramValues ?? get().paramValues,
                appliedAssets: metadata?.appliedAssets ?? get().appliedAssets,
                timestamp: Date.now()
              }
              localStorage.setItem(metaKey, JSON.stringify(promptMetadata))

              // 古いキャッシュの自動削除 (最大200件制限) - メタデータ走査を非同期化してメインスレッドのブロックを防止
              setTimeout(() => {
                try {
                  const keys = Object.keys(localStorage).filter(k => k.startsWith('prompt-surgeon-meta-'))
                  if (keys.length > 200) {
                    const items = keys.map(k => {
                      try {
                        const val = JSON.parse(localStorage.getItem(k) || '{}')
                        return { key: k, timestamp: val.timestamp || 0 }
                      } catch {
                        return { key: k, timestamp: 0 }
                      }
                    })
                    items.sort((a, b) => a.timestamp - b.timestamp)
                    const toDelete = items.slice(0, items.length - 200)
                    toDelete.forEach(item => localStorage.removeItem(item.key))
                  }
                } catch (e) {
                  console.error('Failed to prune prompt metadata:', e)
                }
              }, 0)
            }
          }
          if (!options?.skipQueueFetch && !options?.signal?.aborted) {
            await get().fetchQueue()
          }
          return promptId
        } catch (e: any) {
          if (e?.name === 'AbortError' || options?.signal?.aborted) {
            return null
          }
          console.error('Failed to queue prompt:', e)
          get().setErrorToast({ message: e.message || 'Failed to queue prompt', type: 'error' });
          return null
        }
      }

      const submissionPromise = execute()
      activeSubmissionPromise = submissionPromise
      try {
        return await submissionPromise
      } finally {
        if (activeSubmissionPromise === submissionPromise) {
          activeSubmissionPromise = null
        }
      }
    },

    cancelGeneration: async () => {
      await get().cancelAllJobs()
    },

    clearPreview: () => set({ previewImage: null, progress: null }),

    fetchHistory: async () => {
      const resolvedUrl = resolveComfyUrl(comfyUrl)
      try {
        const data = await comfyApi.getHistory(100)
        const allImages: string[] = []
        const ownImages: string[] = []
        const clientId = get().clientId

        const entries = Object.entries(data || {}) as [string, ComfyHistoryItem][]
        const sortedEntries = entries.sort(([, itemA], [, itemB]) => {
          const indexA = itemA?.prompt ? itemA.prompt[0] : 0
          const indexB = itemB?.prompt ? itemB.prompt[0] : 0
          return indexB - indexA
        })

        sortedEntries.forEach(([key, item]) => {
          if (!item) return
          const isOwnPrompt = item.prompt && item.prompt[3]?.client_id === clientId
          if (item.outputs) {
            Object.values(item.outputs).forEach((out) => {
              if (out?.images) {
                out.images.forEach((img) => {
                  const url = `${resolvedUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${key}`
                  allImages.push(url)
                  if (isOwnPrompt) {
                    ownImages.push(url)
                  }
                })
              }
            })
          }
        })

        set((state) => {
          // filterOwnSession に応じてマージ対象を選択 (OFF時は全セッション、ON時は自セッション)
          const targetImages = state.filterOwnSession ? ownImages : allImages
          const mergedBatchImages = Array.from(new Set([...targetImages, ...state.batchImages])).slice(0, 50)
          localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(mergedBatchImages))

          const hasNewImages = targetImages.some((img) => !state.batchImages.includes(img))
          const nextSelected = (hasNewImages || !state.selectedImg || !mergedBatchImages.includes(state.selectedImg))
            ? (mergedBatchImages.length > 0 ? mergedBatchImages[0] : null)
            : state.selectedImg

          if (nextSelected) {
            localStorage.setItem(LS_KEYS.SELECTED_IMG, nextSelected)
          } else {
            localStorage.removeItem(LS_KEYS.SELECTED_IMG)
          }

          return {
            comfyHistoryImages: allImages.slice(0, 50),
            batchImages: mergedBatchImages,
            selectedImg: nextSelected,
          }
        })
      } catch (e) {
        console.error('Failed to fetch comfy history:', e)
      }
    },

    fetchQueue: async () => {
      try {
        const data = await comfyApi.getQueue()
        if (!data) return

        set({ queueRunning: data.queue_running || [], queuePending: data.queue_pending || [] })

        const running = data.queue_running || []
        if (running.length > 0) {
          const activeJobClientId = running[0][3]?.client_id || null
          if (activeJobClientId) {
            set({ activeClientId: activeJobClientId })
          }
        }

        const activeBatch = get().activeBatch
        if (activeBatch) {
          const activeQueueIds = new Set([
            ...(data.queue_running || []).map((j: any) => j[1]),
            ...(data.queue_pending || []).map((j: any) => j[1])
          ])
          const activeUnfinishedJobs = activeBatch.filter(
            (job) => job.status === 'pending' || job.status === 'generating'
          )
          if (activeUnfinishedJobs.length > 0) {
            if (get().isBatchSubmitting) return

            const anyUnfinishedInQueue = activeUnfinishedJobs.some(
              (job) => activeQueueIds.has(job.promptId)
            )
            if (!anyUnfinishedInQueue) {
              set({ activeBatch: null, isGenerating: false })
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch comfy queue:', e)
      }
    },

    setComfyUrl: (url) => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      localStorage.setItem(LS_KEYS.COMFY_URL, url)
      set({ comfyUrl: url })
      if (ws) { ws.close(); ws = null }
      get().initialize()
    },

    cancelJob: async (promptId: string): Promise<void> => {
      get().abortSubmission();
      if (activeSubmissionPromise) {
        try {
          await activeSubmissionPromise;
        } catch {}
      }
      try {
        const isCurrentRunning = get().currentPromptId === promptId
        const isInQueueRunning = get().queueRunning.some((job) => job[1] === promptId)
        const isRunning = isCurrentRunning || isInQueueRunning
        
        // 1. 実行中の場合は割り込みを投げる
        if (isRunning) {
          await comfyApi.interrupt()
        } else {
          // 2. 待機中の場合はキューから削除する
          await comfyApi.deleteQueue({ delete: [promptId] })
        }

        // 3. 履歴に残らないよう削除を投げる (AC-5)
        await comfyApi.deleteHistory({ delete: [promptId] })

        // 4. 自セッションのバッチジョブ/実行中ジョブのステート更新
        const activeBatch = get().activeBatch
        if (activeBatch && activeBatch.some((job) => job.promptId === promptId)) {
          const updatedBatch = activeBatch.map((job) =>
            job.promptId === promptId ? { ...job, status: 'failed' as const } : job
          )
          const remainingUnfinished = updatedBatch.filter(
            (job) => job.status === 'pending' || job.status === 'generating'
          )
          if (remainingUnfinished.length > 0) {
            set({
              activeBatch: updatedBatch,
              ...(promptId === get().currentPromptId
                ? {
                    currentPromptId: null,
                    currentNode: null,
                    nodeProgress: null,
                  }
                : {}),
            })
            if (promptId === get().currentPromptId) {
              localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
            }
          } else {
            set({
              activeBatch: null,
              isGenerating: false,
              currentPromptId: null,
              activeClientId: null,
              generationStartTime: null,
              currentNode: null,
              nodeProgress: null,
              currentWorkflow: null,
            })
            localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
          }
        } else if (promptId === get().currentPromptId) {
          set({
            activeBatch: null,
            isGenerating: false,
            currentPromptId: null,
            activeClientId: null,
            generationStartTime: null,
            currentNode: null,
            nodeProgress: null,
            currentWorkflow: null,
          })
          localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        }

        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel job:', e)
      }
    },

    clearPendingQueue: async (): Promise<void> => {
      get().abortSubmission()
      if (activeSubmissionPromise) {
        try {
          await activeSubmissionPromise;
        } catch {}
      }
      try {
        const pendingIds = get().queuePending.map((j) => j[1])
        // 待機キューのみ削除（interruptは呼ばない）
        await comfyApi.deleteQueue({ clear: true })
        if (pendingIds.length > 0) {
          await comfyApi.deleteHistory({ delete: pendingIds })
        }

        // activeBatch がある場合、待機中のジョブのみ除外
        const activeBatch = get().activeBatch
        if (activeBatch) {
          const updatedBatch = activeBatch.filter(
            (job) => job.status === 'generating' || job.status === 'completed'
          )
          set({ activeBatch: updatedBatch.length > 0 ? updatedBatch : null })
        }
        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to clear pending queue:', e)
      }
    },

    cancelAllJobs: async (): Promise<void> => {
      get().abortSubmission();
      if (activeSubmissionPromise) {
        try {
          await activeSubmissionPromise;
        } catch {}
      }
      try {
        const runningIds = get().queueRunning.map((j) => j[1])
        const pendingIds = get().queuePending.map((j) => j[1])
        const allIds = [...runningIds, ...pendingIds]

        // 1. 待機キューの全クリア (interruptより先に実行し、後続ジョブの自動起動を即座に防止)
        try {
          await comfyApi.deleteQueue({ clear: true })
        } catch (e) {
          console.error('Failed to clear queue in cancelAllJobs:', e)
        }

        // 2. 中断 (割り込み)
        try {
          await comfyApi.interrupt()
        } catch (e) {
          console.error('Failed to interrupt in cancelAllJobs:', e)
        }

        // 3. 履歴からの削除
        if (allIds.length > 0) {
          try {
            await comfyApi.deleteHistory({ delete: allIds })
          } catch (e) {
            console.error('Failed to delete history in cancelAllJobs:', e)
          }
        }

        // 4. ステートリセット
        set({
          activeBatch: null,
          isGenerating: false,
          currentPromptId: null,
          activeClientId: null,
          generationStartTime: null,
          currentNode: null,
          nodeProgress: null,
          currentWorkflow: null,
        })
        localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        
        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel all jobs:', e)
      }
    },

    initSets: (workflowId) => {
      const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
      const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
      const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

      const initialSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: 'Set 1',
        paramValues: {},
        appliedAssets: {},
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed,
        checked: true
      }
      const sets = [initialSet]
      const activeSetId = initialSet.id
      
      let openPresetIds: (string | number)[] = []
      try {
        const stored = localStorage.getItem(`prompt-surgeon-open-presets-${workflowId}`)
        if (stored) {
          openPresetIds = JSON.parse(stored)
        }
      } catch {}
      if (openPresetIds.length === 0) {
        openPresetIds = [initialSet.id]
      }
      localStorage.setItem(`prompt-surgeon-open-presets-${workflowId}`, JSON.stringify(openPresetIds))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + workflowId, String(activeSetId))

      set({
        sets,
        activeSetId,
        openPresetIds,
        paramValues: {},
        appliedAssets: {},
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed
      })
    },

    setActiveSetId: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      
      const targetSet = get().sets.find(s => String(s.id) === String(id))
      if (!targetSet) return

      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(id))
      set({
        activeSetId: id,
        paramValues: targetSet.paramValues,
        appliedAssets: targetSet.appliedAssets,
        batchSize: targetSet.batchSize,
        seedMode: targetSet.seedMode,
        seed: targetSet.seed
      })
    },

    loadPresetData: (preset, defaultParams) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const mergedParamValues = { ...defaultParams, ...(preset.param_values || {}) }
      const appliedAssets = preset.applied_assets || {}
      const batchSize = preset.batch_size ?? 1
      const seedMode = (preset.seed_mode as 'random' | 'fixed') || 'random'
      const seed = preset.seed !== undefined ? preset.seed : 42

      const openPresetIds = get().openPresetIds
      const nextOpenPresetIds = openPresetIds.includes(preset.id)
        ? openPresetIds
        : [...openPresetIds, preset.id]

      const updatedSets = get().sets.map((s) => {
        if (String(s.id) === String(preset.id)) {
          return {
            ...s,
            name: preset.name || s.name,
            paramValues: mergedParamValues,
            appliedAssets,
            batchSize,
            seedMode,
            seed,
          }
        }
        return s
      })

      const exists = updatedSets.some(s => String(s.id) === String(preset.id))
      const finalSets = exists ? updatedSets : [
        ...updatedSets,
        {
          id: preset.id,
          name: preset.name,
          paramValues: mergedParamValues,
          appliedAssets,
          batchSize,
          seedMode,
          seed,
          checked: true
        }
      ]

      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(preset.id))
      if (!openPresetIds.includes(preset.id)) {
        localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(nextOpenPresetIds))
      }

      set({
        activeSetId: preset.id,
        paramValues: mergedParamValues,
        appliedAssets,
        batchSize,
        seedMode,
        seed,
        sets: finalSets,
        openPresetIds: nextOpenPresetIds,
      })
    },

    addSet: () => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const currentParamValues = { ...get().paramValues }
      const currentAppliedAssets = { ...get().appliedAssets }
      const currentBatchSize = get().batchSize
      const currentSeedMode = get().seedMode
      const currentSeed = get().seed

      const newSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: `Set ${get().sets.length + 1}`,
        paramValues: currentParamValues,
        appliedAssets: currentAppliedAssets,
        batchSize: currentBatchSize,
        seedMode: currentSeedMode,
        seed: currentSeed,
        checked: true
      }

      const updatedSets = [...get().sets, newSet]
      const nextOpenPresetIds = [...get().openPresetIds, newSet.id]
      set({ sets: updatedSets, activeSetId: newSet.id, openPresetIds: nextOpenPresetIds })
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(newSet.id))
      localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(nextOpenPresetIds))
    },

    removeSet: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      // closePreset(id) handles removing from openPresetIds and updating localStorage
      get().closePreset(id)

      const remainingOpenPresetIds = get().openPresetIds.filter(x => String(x) !== String(id))
      let nextActiveId = get().activeSetId

      if (String(nextActiveId) === String(id)) {
        nextActiveId = remainingOpenPresetIds.length > 0 ? remainingOpenPresetIds[0] : null
        
        set({ activeSetId: nextActiveId })
        if (nextActiveId !== null) {
          localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, String(nextActiveId))
          const nextActiveSet = get().sets.find(s => String(s.id) === String(nextActiveId))
          if (nextActiveSet) {
            set({
              paramValues: nextActiveSet.paramValues,
              appliedAssets: nextActiveSet.appliedAssets,
              batchSize: nextActiveSet.batchSize,
              seedMode: nextActiveSet.seedMode,
              seed: nextActiveSet.seed
            })
          }
        } else {
          localStorage.removeItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId)
        }
      }
    },

    renameSet: (id, name) => {
      const updatedSets = get().sets.map(s => String(s.id) === String(id) ? { ...s, name } : s)
      set({ sets: updatedSets })
    },

    toggleSetChecked: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map(s => String(s.id) === String(id) ? { ...s, checked: !s.checked } : s)
      set({ sets: updatedSets })
      
      const checkedIds = updatedSets.filter(s => s.checked).map(s => s.id)
      localStorage.setItem(`prompt-surgeon-checked-presets-${activeWfId}`, JSON.stringify(checkedIds))
    },

    setAllSetsChecked: (checked) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map(s => ({ ...s, checked }))
      set({ sets: updatedSets })
      
      const checkedIds = checked ? updatedSets.map(s => s.id) : []
      localStorage.setItem(`prompt-surgeon-checked-presets-${activeWfId}`, JSON.stringify(checkedIds))
    },

    updateActiveSet: (updates) => {
      const activeSetId = get().activeSetId
      if (activeSetId === null) return

      const updatedSets = get().sets.map((s) => {
        if (String(s.id) === String(activeSetId)) {
          return { ...s, ...updates }
        }
        return s
      })

      set({ sets: updatedSets })
    },

    setSets: (sets) => {
      set({ sets })
    },

    openPreset: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      const openPresetIds = get().openPresetIds
      if (!openPresetIds.includes(id)) {
        const next = [...openPresetIds, id]
        set({ openPresetIds: next })
        localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(next))
      }
    },

    closePreset: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      const next = get().openPresetIds.filter(x => String(x) !== String(id))
      set({ openPresetIds: next })
      localStorage.setItem(`prompt-surgeon-open-presets-${activeWfId}`, JSON.stringify(next))
    },
  }
})
