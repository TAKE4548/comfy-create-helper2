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
import { configApi } from '../api/client'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'
import { LS_KEYS } from '../utils/localStorageKeys'
import { addAssetToPrompt, removeAssetFromPrompt } from '../utils/promptUtils'

// ─── Re-export helpers for backward compatibility ─────────────────
export { addAssetToPrompt, removeAssetFromPrompt } from '../utils/promptUtils'

// ─── Type definitions ─────────────────────────────────────────────

export interface ComfyProgress {
  value: number
  max: number
  percentage: number
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
  id: string
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

export interface GenerationState {
  // ─── Connection ────────────────────────────────────────────────
  clientId: string
  isConnected: boolean
  isGenerating: boolean
  progress: ComfyProgress | null
  previewImage: string | null
  currentPromptId: string | null
  activeClientId: string | null
  comfyUrl: string | null

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

  // ─── Multi-Set State (New) ─────────────────────────────────────
  sets: GenerationSet[]
  activeSetId: string | null

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
  queuePrompt: (workflow: Record<string, unknown>) => Promise<string | null>
  cancelGeneration: () => void
  clearPreview: () => void
  fetchHistory: () => Promise<void>
  fetchQueue: () => Promise<void>
  setComfyUrl: (url: string) => void
  cancelJob: (promptId: string) => Promise<void>
  cancelAllJobs: () => Promise<void>

  // ─── Multi-Set Actions (New) ───────────────────────────────────
  initSets: (workflowId: number) => void
  setActiveSetId: (id: string) => void
  addSet: () => void
  removeSet: (id: string) => void
  renameSet: (id: string, name: string) => void
  toggleSetChecked: (id: string) => void
  setAllSetsChecked: (checked: boolean) => void
  updateActiveSet: (updates: Partial<Omit<GenerationSet, 'id' | 'name'>>) => void
}

// ─── Module-level WebSocket singleton ─────────────────────────────
let ws: WebSocket | null = null
let comfyUrl: string | null = null
let isInitializing = false
let reconnectTimer: any = null

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
  let initialActiveSetId: string | null = null
  let storedParams: Record<string, string> = {}
  let storedAppliedAssets: Record<string, AppliedAsset[]> = {}
  let storedBatchSize = 1
  let storedSeedMode: 'random' | 'fixed' = 'random'
  let storedSeed = 42

  if (storedWorkflowId !== null) {
    try {
      initialSets = JSON.parse(localStorage.getItem(LS_KEYS.SETS_PREFIX + storedWorkflowId) || '[]')
      initialActiveSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + storedWorkflowId)
    } catch {}

    if (initialSets.length === 0) {
      try {
        storedParams = JSON.parse(
          localStorage.getItem(LS_KEYS.PARAMS_PREFIX + storedWorkflowId) || '{}'
        )
      } catch {}
      try {
        storedAppliedAssets = JSON.parse(localStorage.getItem(`${LS_KEYS.APPLIED_ASSETS}_${storedWorkflowId}`) || '{}')
      } catch {}
      storedBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
      storedSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
      storedSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

      const initialSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: 'Set 1',
        paramValues: storedParams,
        appliedAssets: storedAppliedAssets,
        batchSize: storedBatchSize,
        seedMode: storedSeedMode,
        seed: storedSeed,
        checked: true
      }
      initialSets = [initialSet]
      initialActiveSetId = initialSet.id
      localStorage.setItem(LS_KEYS.SETS_PREFIX + storedWorkflowId, JSON.stringify(initialSets))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + storedWorkflowId, initialActiveSetId)
    }

    if (!initialActiveSetId || !initialSets.some(s => s.id === initialActiveSetId)) {
      initialActiveSetId = initialSets[0].id
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + storedWorkflowId, initialActiveSetId)
    }

    const activeSet = initialSets.find(s => s.id === initialActiveSetId)!
    storedParams = activeSet.paramValues
    storedAppliedAssets = activeSet.appliedAssets
    storedBatchSize = activeSet.batchSize
    storedSeedMode = activeSet.seedMode
    storedSeed = activeSet.seed
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
                    `${url}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${Date.now()}`
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
              return
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
    sets: initialSets,
    activeSetId: initialActiveSetId,

    // ── Actions ──────────────────────────────────────────────
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
                set({
                  isGenerating: true,
                  progress: { value, max, percentage: max > 0 ? Math.round((value / max) * 100) : 0 },
                })
                break
              }

              case 'execution_start':
                set({
                  isGenerating: true,
                  progress: null,
                  currentPromptId: data.prompt_id as string,
                  activeClientId: null,
                })
                get().fetchQueue()
                break

              case 'executed': {
                const output = data.output as Record<string, unknown> | undefined
                const images = output?.images as Array<{ filename: string; subfolder: string; type: string }> | undefined
                const promptId = data.prompt_id as string
                if (images && images.length > 0) {
                  const baseUrl = resolveComfyUrl(comfyUrl!)
                  const newUrls = images.map((img) => 
                    `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${Date.now()}`
                  )
                  const firstUrl = newUrls[0]
                  set((state) => {
                    const nextImages = [...newUrls, ...state.batchImages.filter((x) => !newUrls.includes(x))].slice(0, 8)
                    const nextHistoryImages = [...newUrls, ...state.comfyHistoryImages.filter((x) => !newUrls.includes(x))].slice(0, 50)
                    localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(nextImages))
                    localStorage.setItem(LS_KEYS.SELECTED_IMG, firstUrl)
                    return {
                      previewImage: null,
                      batchImages: nextImages,
                      comfyHistoryImages: nextHistoryImages,
                      selectedImg: firstUrl,
                      isGenerating: false,
                      currentPromptId: null,
                      activeClientId: null,
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
                set({ isGenerating: false, progress: { value: 1, max: 1, percentage: 100 }, currentPromptId: null, activeClientId: null })
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
                set({ isGenerating: false, progress: null, currentPromptId: null, activeClientId: null })
                localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                get().fetchQueue()
                window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'execution_error', promptId } }))
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

    setSelectedWorkflowId: (id) => {
      set({ selectedWorkflowId: id })
      if (id !== null) {
        localStorage.setItem(LS_KEYS.WORKFLOW_ID, String(id))
        
        let sets: GenerationSet[] = []
        try {
          sets = JSON.parse(localStorage.getItem(LS_KEYS.SETS_PREFIX + id) || '[]')
        } catch {}
        
        let activeSetId: string | null = null
        try {
          activeSetId = localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + id)
        } catch {}

        if (sets.length === 0) {
          let params: Record<string, string> = {}
          try { params = JSON.parse(localStorage.getItem(LS_KEYS.PARAMS_PREFIX + id) || '{}') } catch {}
          
          let loadedAppliedAssets: Record<string, AppliedAsset[]> = {}
          try { loadedAppliedAssets = JSON.parse(localStorage.getItem(`${LS_KEYS.APPLIED_ASSETS}_${id}`) || '{}') } catch {}
          
          const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
          const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
          const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

          const initialSet: GenerationSet = {
            id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            name: 'Set 1',
            paramValues: params,
            appliedAssets: loadedAppliedAssets,
            batchSize: defaultBatchSize,
            seedMode: defaultSeedMode,
            seed: defaultSeed,
            checked: true
          }
          sets = [initialSet]
          activeSetId = initialSet.id
          
          localStorage.setItem(LS_KEYS.SETS_PREFIX + id, JSON.stringify(sets))
          localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + id, activeSetId)
        }

        if (!activeSetId || !sets.some(s => s.id === activeSetId)) {
          activeSetId = sets[0].id
          localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + id, activeSetId)
        }

        const activeSet = sets.find(s => s.id === activeSetId)!

        set({
          sets,
          activeSetId,
          paramValues: activeSet.paramValues,
          appliedAssets: activeSet.appliedAssets,
          batchSize: activeSet.batchSize,
          seedMode: activeSet.seedMode,
          seed: activeSet.seed
        })
      } else {
        localStorage.removeItem(LS_KEYS.WORKFLOW_ID)
        set({
          sets: [],
          activeSetId: null,
          paramValues: {},
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42
        })
      }
    },

    setParamValues: (values) => {
      set({ paramValues: values })
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem(LS_KEYS.PARAMS_PREFIX + activeWfId, JSON.stringify(values))
        get().updateActiveSet({ paramValues: values })
      }
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
      
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem(`${LS_KEYS.APPLIED_ASSETS}_${activeWfId}`, JSON.stringify(updated))
        localStorage.setItem(LS_KEYS.PARAMS_PREFIX + activeWfId, JSON.stringify(updatedParams))
        get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
      }
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
      
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem(`${LS_KEYS.APPLIED_ASSETS}_${activeWfId}`, JSON.stringify(updated))
        localStorage.setItem(LS_KEYS.PARAMS_PREFIX + activeWfId, JSON.stringify(updatedParams))
        get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
      }
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
      
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem(`${LS_KEYS.APPLIED_ASSETS}_${activeWfId}`, JSON.stringify(updated))
        localStorage.setItem(LS_KEYS.PARAMS_PREFIX + activeWfId, JSON.stringify(updatedParams))
        get().updateActiveSet({ appliedAssets: updated, paramValues: updatedParams })
      }
    },

    setAppliedAssets: (assets) => {
      set({ appliedAssets: assets })
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem(`${LS_KEYS.APPLIED_ASSETS}_${activeWfId}`, JSON.stringify(assets))
        get().updateActiveSet({ appliedAssets: assets })
      }
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

    queuePrompt: async (workflow) => {
      if (!comfyUrl) return null
      const activeUrl = resolveComfyUrl(comfyUrl)
      try {
        const res = await fetch(`${activeUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow, client_id: get().clientId }),
        })
        if (!res.ok) throw new Error(`ComfyUI returned ${res.status}`)
        const data = await res.json()
        const promptId = data.prompt_id ?? null
        set({ isGenerating: true, previewImage: null, progress: null, currentPromptId: promptId, activeClientId: get().clientId })
        if (promptId) localStorage.setItem(LS_KEYS.CURRENT_PROMPT_ID, promptId)
        await get().fetchQueue()
        return promptId
      } catch (e) {
        console.error('Failed to queue prompt:', e)
        return null
      }
    },

    cancelGeneration: async () => {
      if (!comfyUrl) return
      const activeUrl = resolveComfyUrl(comfyUrl)
      try {
        await fetch(`${activeUrl}/interrupt`, { method: 'POST' })
        set({ isGenerating: false, currentPromptId: null, activeClientId: null })
        localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel:', e)
      }
    },

    clearPreview: () => set({ previewImage: null, progress: null }),

    fetchHistory: async () => {
      if (!comfyUrl) return
      const resolvedUrl = resolveComfyUrl(comfyUrl)
      try {
        const res = await fetch(`${resolvedUrl}/history`)
        if (!res.ok) return
        const data = await res.json()
        const allImages: string[] = []
        const entries = Object.entries(data) as [string, ComfyHistoryItem][]
        const sortedEntries = entries.sort(([, itemA], [, itemB]) => {
          const indexA = itemA.prompt ? itemA.prompt[0] : 0
          const indexB = itemB.prompt ? itemB.prompt[0] : 0
          return indexB - indexA
        })
        sortedEntries.forEach(([key, item]) => {
          Object.values(item.outputs).forEach((out) => {
            if (out.images) {
              out.images.forEach((img) => {
                allImages.push(
                  `${resolvedUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${key}`
                )
              })
            }
          })
        })
        set({ comfyHistoryImages: allImages.slice(0, 50) })
      } catch (e) {
        console.error('Failed to fetch comfy history:', e)
      }
    },

    fetchQueue: async () => {
      if (!comfyUrl) return
      const resolvedUrl = resolveComfyUrl(comfyUrl)
      try {
        const res = await fetch(`${resolvedUrl}/queue`)
        if (res.ok) {
          const data = (await res.json()) as ComfyQueueResponse
          set({ queueRunning: data.queue_running || [], queuePending: data.queue_pending || [] })
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
      if (!comfyUrl) return
      const activeUrl = resolveComfyUrl(comfyUrl)
      try {
        const isRunning = get().queueRunning.some((job) => job[1] === promptId)
        
        // 1. 実行中の場合は割り込みを投げる
        if (isRunning) {
          await fetch(`${activeUrl}/interrupt`, { method: 'POST' })
        } else {
          // 2. 待機中の場合はキューから削除する
          await fetch(`${activeUrl}/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete: [promptId] } as ComfyQueueDeletePayload),
          })
        }

        // 3. 履歴に残らないよう削除を投げる (AC-5)
        await fetch(`${activeUrl}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delete: [promptId] } as ComfyHistoryDeletePayload),
        })

        // 4. 自セッションの実行中ジョブであった場合はステートをリセット
        if (promptId === get().currentPromptId) {
          set({ isGenerating: false, currentPromptId: null, activeClientId: null })
          localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        }

        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel job:', e)
      }
    },

    cancelAllJobs: async (): Promise<void> => {
      if (!comfyUrl) return
      const activeUrl = resolveComfyUrl(comfyUrl)
      try {
        // 1. 中断
        await fetch(`${activeUrl}/interrupt`, { method: 'POST' })

        const filterJob = (job: any) => !get().filterOwnSession || job[3]?.client_id === get().clientId
        const runningIds = get().queueRunning.map((j) => j[1])
        const pendingIds = get().queuePending.filter(filterJob).map((j) => j[1])
        const allIds = [...runningIds, ...pendingIds]

        // 2. 待機キューのクリア
        if (get().filterOwnSession) {
          if (pendingIds.length > 0) {
            await fetch(`${activeUrl}/queue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ delete: pendingIds } as ComfyQueueDeletePayload),
            })
          }
        } else {
          await fetch(`${activeUrl}/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clear: true } as ComfyQueueClearPayload),
          })
        }

        // 3. 履歴からの削除
        if (allIds.length > 0) {
          await fetch(`${activeUrl}/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete: allIds } as ComfyHistoryDeletePayload),
          })
        }

        // 4. ステートリセット
        set({ isGenerating: false, currentPromptId: null, activeClientId: null })
        localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
        
        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel all jobs:', e)
      }
    },

    initSets: (workflowId) => {
      let params: Record<string, string> = {}
      try { params = JSON.parse(localStorage.getItem(LS_KEYS.PARAMS_PREFIX + workflowId) || '{}') } catch {}
      
      let loadedAppliedAssets: Record<string, AppliedAsset[]> = {}
      try { loadedAppliedAssets = JSON.parse(localStorage.getItem(`${LS_KEYS.APPLIED_ASSETS}_${workflowId}`) || '{}') } catch {}
      
      const defaultBatchSize = localStorage.getItem(LS_KEYS.BATCH_SIZE) ? Number(localStorage.getItem(LS_KEYS.BATCH_SIZE)) : 1
      const defaultSeedMode = (localStorage.getItem(LS_KEYS.SEED_MODE) as 'random' | 'fixed') || 'random'
      const defaultSeed = localStorage.getItem(LS_KEYS.SEED) ? Number(localStorage.getItem(LS_KEYS.SEED)) : 42

      const initialSet: GenerationSet = {
        id: 'set-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: 'Set 1',
        paramValues: params,
        appliedAssets: loadedAppliedAssets,
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed,
        checked: true
      }
      const sets = [initialSet]
      const activeSetId = initialSet.id
      
      localStorage.setItem(LS_KEYS.SETS_PREFIX + workflowId, JSON.stringify(sets))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + workflowId, activeSetId)

      set({
        sets,
        activeSetId,
        paramValues: params,
        appliedAssets: loadedAppliedAssets,
        batchSize: defaultBatchSize,
        seedMode: defaultSeedMode,
        seed: defaultSeed
      })
    },

    setActiveSetId: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      
      const targetSet = get().sets.find(s => s.id === id)
      if (!targetSet) return

      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, id)
      set({
        activeSetId: id,
        paramValues: targetSet.paramValues,
        appliedAssets: targetSet.appliedAssets,
        batchSize: targetSet.batchSize,
        seedMode: targetSet.seedMode,
        seed: targetSet.seed
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
      set({ sets: updatedSets, activeSetId: newSet.id })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, newSet.id)
    },

    removeSet: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return
      if (get().sets.length <= 1) return

      const updatedSets = get().sets.filter(s => s.id !== id)
      let nextActiveId = get().activeSetId
      if (nextActiveId === id) {
        nextActiveId = updatedSets[0].id
      }

      set({ sets: updatedSets, activeSetId: nextActiveId })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
      localStorage.setItem(LS_KEYS.ACTIVE_SET_PREFIX + activeWfId, nextActiveId!)

      const nextActiveSet = updatedSets.find(s => s.id === nextActiveId)!
      set({
        paramValues: nextActiveSet.paramValues,
        appliedAssets: nextActiveSet.appliedAssets,
        batchSize: nextActiveSet.batchSize,
        seedMode: nextActiveSet.seedMode,
        seed: nextActiveSet.seed
      })
    },

    renameSet: (id, name) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map(s => s.id === id ? { ...s, name } : s)
      set({ sets: updatedSets })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
    },

    toggleSetChecked: (id) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map(s => s.id === id ? { ...s, checked: !s.checked } : s)
      set({ sets: updatedSets })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
    },

    setAllSetsChecked: (checked) => {
      const activeWfId = get().selectedWorkflowId
      if (activeWfId === null) return

      const updatedSets = get().sets.map(s => ({ ...s, checked }))
      set({ sets: updatedSets })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
    },

    updateActiveSet: (updates) => {
      const activeWfId = get().selectedWorkflowId
      const activeSetId = get().activeSetId
      if (activeWfId === null || activeSetId === null) return

      const updatedSets = get().sets.map((s) => {
        if (s.id === activeSetId) {
          return { ...s, ...updates }
        }
        return s
      })

      set({ sets: updatedSets })
      localStorage.setItem(LS_KEYS.SETS_PREFIX + activeWfId, JSON.stringify(updatedSets))
    },
  }
})
