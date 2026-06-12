import { create } from 'zustand'
import { configApi } from '../api/client'
import { resolveComfyUrl } from '../hooks/useComfyWebSocket'

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
  id: string; // unique key (e.g. `lora-1-12345`)
  type: 'lora' | 'tagset';
  assetId: number; // DB ID
  name: string; // display name
  enabled: boolean; // toggle state
  tags: string[]; // tagset tags or LoRA trigger words
  loraPromptString?: string; // LoRA prompt embedded string `<lora:filename:strength>`
}

export interface GenerationState {
  clientId: string
  isConnected: boolean
  isGenerating: boolean
  progress: ComfyProgress | null
  previewImage: string | null
  currentPromptId: string | null
  activeClientId: string | null
  comfyUrl: string | null // 追加
  
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
  queuePrompt: (workflow: Record<string, unknown>) => Promise<string | null>
  cancelGeneration: () => void
  clearPreview: () => void
  fetchHistory: () => Promise<void>
  fetchQueue: () => Promise<void>
  setComfyUrl: (url: string) => void // 追加
}

let ws: WebSocket | null = null
let comfyUrl: string | null = null
let isInitializing = false

export function removeAssetFromPrompt(prompt: string, tags: string[], loraPromptString?: string): string {
  let chips = prompt.split(',').map(c => c.trim()).filter(Boolean);
  const tagsToRemove = new Set(tags.map(t => t.toLowerCase()));
  if (loraPromptString) {
    tagsToRemove.add(loraPromptString.toLowerCase());
    const match = loraPromptString.match(/<lora:([^:]+):/i);
    if (match) {
      const baseLoraPrefix = `<lora:${match[1]}:`.toLowerCase();
      chips = chips.filter(chip => {
        const lowerChip = chip.toLowerCase();
        return !(lowerChip.startsWith(baseLoraPrefix) && lowerChip.endsWith('>'));
      });
    }
  }
  chips = chips.filter(chip => !tagsToRemove.has(chip.toLowerCase()));
  return chips.join(', ');
}

export function addAssetToPrompt(prompt: string, tags: string[], loraPromptString?: string): string {
  const currentVal = prompt || '';
  const tagsToAdd = [...tags];
  if (loraPromptString) {
    tagsToAdd.push(loraPromptString);
  }
  const toAddStr = tagsToAdd.join(', ');
  if (!currentVal) return toAddStr;
  return `${currentVal}, ${toAddStr}`;
}

export const useGenerationStore = create<GenerationState>((set, get) => {
  // Load initial values from localStorage
  const storedClientId = localStorage.getItem('prompt-surgeon-client-id') || 
    'prompt-surgeon-' + Math.random().toString(36).slice(2, 9)
  localStorage.setItem('prompt-surgeon-client-id', storedClientId)

  const storedFilterOwn = localStorage.getItem('prompt-surgeon-filter-own') === 'true'
  const storedWorkflowId = localStorage.getItem('prompt-surgeon-workflow-id')
    ? Number(localStorage.getItem('prompt-surgeon-workflow-id'))
    : null
  
  let storedParams: Record<string, string> = {}
  if (storedWorkflowId !== null) {
    try {
      storedParams = JSON.parse(localStorage.getItem('prompt-surgeon-params-wf-' + storedWorkflowId) || '{}')
    } catch {}
  }

  let storedAppliedAssets: Record<string, AppliedAsset[]> = {}
  try {
    storedAppliedAssets = JSON.parse(localStorage.getItem('prompt-surgeon-applied-assets') || '{}')
  } catch {}

  const storedBatchSize = localStorage.getItem('prompt-surgeon-batch-size')
    ? Number(localStorage.getItem('prompt-surgeon-batch-size'))
    : 1

  const storedSeedMode = (localStorage.getItem('prompt-surgeon-seed-mode') as 'random' | 'fixed') || 'random'
  const storedSeed = localStorage.getItem('prompt-surgeon-seed')
    ? Number(localStorage.getItem('prompt-surgeon-seed'))
    : 42

  let storedBatchImages: string[] = []
  try {
    storedBatchImages = JSON.parse(localStorage.getItem('prompt-surgeon-batch-images') || '[]')
    // Filter out blob URLs on startup as they are invalid
    storedBatchImages = storedBatchImages.filter((img) => !img.startsWith('blob:'))
  } catch {}

  const storedSelectedImg = localStorage.getItem('prompt-surgeon-selected-img')
  const verifiedSelectedImg = storedSelectedImg && !storedSelectedImg.startsWith('blob:') ? storedSelectedImg : null

  const storedCurrentPromptId = localStorage.getItem('prompt-surgeon-current-prompt-id')

  // Check queue & history to reconcile state
  const reconcileState = async (url: string) => {
    try {
      // 1. Check history for currentPromptId
      const promptId = get().currentPromptId
      if (promptId) {
        const historyRes = await fetch(`${url}/history/${promptId}`)
        if (historyRes.ok) {
          const historyData = await historyRes.json()
          if (historyData[promptId]) {
            const item = historyData[promptId] as ComfyHistoryItem
            const outputs = item.outputs
            const imagesList: string[] = []
            Object.values(outputs).forEach((out) => {
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
                localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(nextImages))
                localStorage.setItem('prompt-surgeon-selected-img', finalImg)
                return {
                  previewImage: finalImg,
                  batchImages: nextImages,
                  selectedImg: finalImg,
                  isGenerating: false,
                  currentPromptId: null,
                }
              })
              localStorage.removeItem('prompt-surgeon-current-prompt-id')
              return
            }
          }
        }
      }

      // 2. Check general queue
      const queueRes = await fetch(`${url}/queue`)
      if (queueRes.ok) {
        const queueData = (await queueRes.json()) as ComfyQueueResponse
        const running = queueData.queue_running || []
        const pending = queueData.queue_pending || []
        
        set({
          queueRunning: running,
          queuePending: pending,
        })
        
        const activeJob = running.length > 0 ? running[0] : null
        if (activeJob) {
          const activePromptId = activeJob[1]
          const activeExtra = activeJob[3]
          const jobClientId = activeExtra?.client_id || null
          
          set({
            isGenerating: true,
            currentPromptId: activePromptId,
            activeClientId: jobClientId,
          })
          localStorage.setItem('prompt-surgeon-current-prompt-id', activePromptId)
        } else {
          // If we had a running job stored but it is not in queue and was not found in history, clear it
          if (promptId) {
            set({
              isGenerating: false,
              currentPromptId: null,
              activeClientId: null,
            })
            localStorage.removeItem('prompt-surgeon-current-prompt-id')
          }
        }
      }
    } catch (e) {
      console.error('Failed to reconcile generation state:', e)
    }
  }

  return {
    clientId: storedClientId,
    isConnected: false,
    isGenerating: false,
    progress: null,
    previewImage: null,
    currentPromptId: storedCurrentPromptId,
    activeClientId: null,
    comfyUrl: localStorage.getItem('prompt-surgeon-comfy-url'),
    
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

    initialize: () => {
      if (isInitializing || ws) return
      isInitializing = true

      const initConnection = (url: string) => {
        comfyUrl = url
        set({ comfyUrl: url })
        const resolvedUrl = resolveComfyUrl(url)
        
        // Reconcile queue/history state
        reconcileState(resolvedUrl)
        get().fetchHistory()

        const wsUrl = resolvedUrl.replace(/^http/, 'ws')
        ws = new WebSocket(`${wsUrl}/ws?clientId=${get().clientId}`)
        ws.binaryType = 'blob'

        ws.onopen = () => {
          set({ isConnected: true })
          get().fetchQueue()
        }
        ws.onclose = () => set({ isConnected: false })
        ws.onerror = () => set({ isConnected: false })

        ws.onmessage = (event) => {
          if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
            const blob = event.data instanceof Blob ? event.data : new Blob([event.data])
            const url = URL.createObjectURL(blob)
            set({ previewImage: url })
            return
          }

          try {
            const msg = JSON.parse(event.data)
            const type = msg.type as string
            const data = msg.data as Record<string, unknown>

            switch (type) {
              case 'status': {
                get().fetchQueue()
                break
              }

              case 'progress': {
                const value = data.value as number
                const max = data.max as number
                set({
                  isGenerating: true,
                  progress: {
                    value,
                    max,
                    percentage: max > 0 ? Math.round((value / max) * 100) : 0,
                  },
                })
                break
              }

              case 'execution_start': {
                set({
                  isGenerating: true,
                  progress: null,
                  currentPromptId: data.prompt_id as string,
                  activeClientId: null, // will be reconciled on queue/status if needed
                })
                get().fetchQueue()
                break
              }

              case 'executed': {
                const output = data.output as Record<string, unknown> | undefined
                const images = output?.images as Array<{ filename: string; subfolder: string; type: string }> | undefined
                if (images && images.length > 0) {
                  const img = images[0]
                  const baseUrl = resolveComfyUrl(comfyUrl)
                  const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${Date.now()}`
                  
                  set((state) => {
                    const nextImages = [viewUrl, ...state.batchImages.filter((x) => x !== viewUrl)].slice(0, 8)
                    localStorage.setItem('prompt-surgeon-batch-images', JSON.stringify(nextImages))
                    localStorage.setItem('prompt-surgeon-selected-img', viewUrl)
                    return {
                      previewImage: viewUrl,
                      batchImages: nextImages,
                      selectedImg: viewUrl,
                      isGenerating: false,
                      currentPromptId: null,
                      activeClientId: null,
                    }
                  })
                  localStorage.removeItem('prompt-surgeon-current-prompt-id')
                  get().fetchHistory()
                }
                get().fetchQueue()
                break
              }

              case 'execution_complete':
                set({
                  isGenerating: false,
                  progress: { value: 1, max: 1, percentage: 100 },
                  currentPromptId: null,
                  activeClientId: null,
                })
                localStorage.removeItem('prompt-surgeon-current-prompt-id')
                get().fetchHistory()
                get().fetchQueue()
                break

              case 'execution_error':
                set({
                  isGenerating: false,
                  progress: null,
                  currentPromptId: null,
                  activeClientId: null,
                })
                localStorage.removeItem('prompt-surgeon-current-prompt-id')
                get().fetchQueue()
                break
            }
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
          }
        }
      }

      const storedUrl = localStorage.getItem('prompt-surgeon-comfy-url')
      if (storedUrl) {
        initConnection(storedUrl)
        isInitializing = false
      } else {
        configApi.get()
          .then((config) => {
            const url = (config && config.comfy_url) ? config.comfy_url : 'http://localhost:8188'
            initConnection(url)
          })
          .catch((e) => {
            console.error('Failed to initialize ComfyUI WebSocket store:', e)
          })
          .finally(() => {
            isInitializing = false
          })
      }
    },

    setFilterOwnSession: (filter: boolean) => {
      set({ filterOwnSession: filter })
      localStorage.setItem('prompt-surgeon-filter-own', String(filter))
    },

    setSelectedWorkflowId: (id: number | null) => {
      set({ selectedWorkflowId: id })
      if (id !== null) {
        localStorage.setItem('prompt-surgeon-workflow-id', String(id))
        let params: Record<string, string> = {}
        try {
          params = JSON.parse(localStorage.getItem('prompt-surgeon-params-wf-' + id) || '{}')
        } catch {}
        set({ paramValues: params })
      } else {
        localStorage.removeItem('prompt-surgeon-workflow-id')
        set({ paramValues: {} })
      }
    },

    setParamValues: (values: Record<string, string>) => {
      set({ paramValues: values })
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem('prompt-surgeon-params-wf-' + activeWfId, JSON.stringify(values))
      }
    },

    addAppliedAsset: (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const newAsset: AppliedAsset = {
        ...asset,
        id: `${asset.type}-${asset.assetId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        enabled: true,
      }
      const updated = {
        ...current,
        [role]: [...roleAssets, newAsset],
      }
      
      const currentParams = get().paramValues
      const currentPrompt = currentParams[role] || ''
      const updatedPrompt = addAssetToPrompt(currentPrompt, newAsset.tags, newAsset.loraPromptString)
      const updatedParams = {
        ...currentParams,
        [role]: updatedPrompt,
      }
      
      set({
        appliedAssets: updated,
        paramValues: updatedParams,
      })
      localStorage.setItem('prompt-surgeon-applied-assets', JSON.stringify(updated))
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem('prompt-surgeon-params-wf-' + activeWfId, JSON.stringify(updatedParams))
      }
    },

    removeAppliedAsset: (role: string, id: string) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const assetToRemove = roleAssets.find((a) => a.id === id)
      
      const updated = {
        ...current,
        [role]: roleAssets.filter((a) => a.id !== id),
      }
      
      let updatedParams = get().paramValues
      if (assetToRemove && assetToRemove.enabled) {
        const currentParams = get().paramValues
        const currentPrompt = currentParams[role] || ''
        const updatedPrompt = removeAssetFromPrompt(currentPrompt, assetToRemove.tags, assetToRemove.loraPromptString)
        updatedParams = {
          ...currentParams,
          [role]: updatedPrompt,
        }
      }
      
      set({
        appliedAssets: updated,
        paramValues: updatedParams,
      })
      localStorage.setItem('prompt-surgeon-applied-assets', JSON.stringify(updated))
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem('prompt-surgeon-params-wf-' + activeWfId, JSON.stringify(updatedParams))
      }
    },

    toggleAppliedAsset: (role: string, id: string) => {
      const current = get().appliedAssets
      const roleAssets = current[role] || []
      const assetToToggle = roleAssets.find((a) => a.id === id)
      if (!assetToToggle) return

      const nextEnabled = !assetToToggle.enabled
      const updated = {
        ...current,
        [role]: roleAssets.map((a) => (a.id === id ? { ...a, enabled: nextEnabled } : a)),
      }

      const currentParams = get().paramValues
      const currentPrompt = currentParams[role] || ''
      let updatedPrompt = currentPrompt

      if (nextEnabled) {
        updatedPrompt = addAssetToPrompt(currentPrompt, assetToToggle.tags, assetToToggle.loraPromptString)
      } else {
        updatedPrompt = removeAssetFromPrompt(currentPrompt, assetToToggle.tags, assetToToggle.loraPromptString)
      }

      const updatedParams = {
        ...currentParams,
        [role]: updatedPrompt,
      }

      set({
        appliedAssets: updated,
        paramValues: updatedParams,
      })
      localStorage.setItem('prompt-surgeon-applied-assets', JSON.stringify(updated))
      const activeWfId = get().selectedWorkflowId
      if (activeWfId !== null) {
        localStorage.setItem('prompt-surgeon-params-wf-' + activeWfId, JSON.stringify(updatedParams))
      }
    },

    setBatchSize: (size: number) => {
      set({ batchSize: size })
      localStorage.setItem('prompt-surgeon-batch-size', String(size))
    },

    setSeedMode: (mode: 'random' | 'fixed') => {
      set({ seedMode: mode })
      localStorage.setItem('prompt-surgeon-seed-mode', mode)
    },

    setSeed: (seed: number) => {
      set({ seed })
      localStorage.setItem('prompt-surgeon-seed', String(seed))
    },

    setSelectedImg: (img: string | null) => {
      set({ selectedImg: img })
      if (img && !img.startsWith('blob:')) {
        localStorage.setItem('prompt-surgeon-selected-img', img)
      } else {
        localStorage.removeItem('prompt-surgeon-selected-img')
      }
    },

    queuePrompt: async (workflow: Record<string, unknown>): Promise<string | null> => {
      if (!comfyUrl) return null
      const activeUrl = resolveComfyUrl(comfyUrl)
      try {
        const res = await fetch(`${activeUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: workflow,
            client_id: get().clientId,
          }),
        })
        if (!res.ok) throw new Error(`ComfyUI returned ${res.status}`)
        const data = await res.json()
        const promptId = data.prompt_id ?? null
        
        set({
          isGenerating: true,
          previewImage: null,
          progress: null,
          currentPromptId: promptId,
          activeClientId: get().clientId,
        })
        
        if (promptId) {
          localStorage.setItem('prompt-surgeon-current-prompt-id', promptId)
        }
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
        set({
          isGenerating: false,
          currentPromptId: null,
          activeClientId: null,
        })
        localStorage.removeItem('prompt-surgeon-current-prompt-id')
        await get().fetchQueue()
      } catch (e) {
        console.error('Failed to cancel:', e)
      }
    },

    clearPreview: () => {
      set({
        previewImage: null,
        progress: null,
      })
    },

    fetchHistory: async () => {
      if (!comfyUrl) return
      const resolvedUrl = resolveComfyUrl(comfyUrl)
      try {
        const res = await fetch(`${resolvedUrl}/history`)
        if (res.ok) {
          const data = await res.json()
          const allImages: string[] = []
          const keys = Object.keys(data).sort((a, b) => Number(b) - Number(a))
          keys.forEach((key) => {
            const item = data[key] as ComfyHistoryItem
            const outputs = item.outputs
            Object.values(outputs).forEach((out) => {
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
        }
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
          set({
            queueRunning: data.queue_running || [],
            queuePending: data.queue_pending || [],
          })
        }
      } catch (e) {
        console.error('Failed to fetch comfy queue:', e)
      }
    },

    setComfyUrl: (url: string) => {
      localStorage.setItem('prompt-surgeon-comfy-url', url)
      set({ comfyUrl: url })
      if (ws) {
        ws.close()
        ws = null
      }
      get().initialize()
    },
  }
})
