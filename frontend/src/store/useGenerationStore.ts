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

export interface GenerationState {
  clientId: string
  isConnected: boolean
  isGenerating: boolean
  progress: ComfyProgress | null
  previewImage: string | null
  currentPromptId: string | null
  activeClientId: string | null
  
  filterOwnSession: boolean
  selectedWorkflowId: number | null
  paramValues: Record<string, string>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
  batchImages: string[]
  selectedImg: string | null
  comfyHistoryImages: string[]
  
  initialize: () => void
  setFilterOwnSession: (filter: boolean) => void
  setSelectedWorkflowId: (id: number | null) => void
  setParamValues: (values: Record<string, string>) => void
  setBatchSize: (size: number) => void
  setSeedMode: (mode: 'random' | 'fixed') => void
  setSeed: (seed: number) => void
  setSelectedImg: (img: string | null) => void
  queuePrompt: (workflow: Record<string, unknown>) => Promise<string | null>
  cancelGeneration: () => void
  clearPreview: () => void
  fetchHistory: () => Promise<void>
}

let ws: WebSocket | null = null
let comfyUrl: string | null = null
let isInitializing = false

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
  try {
    storedParams = JSON.parse(localStorage.getItem('prompt-surgeon-params') || '{}')
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
        const running = queueData.queue_running
        
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
    
    filterOwnSession: storedFilterOwn,
    selectedWorkflowId: storedWorkflowId,
    paramValues: storedParams,
    batchSize: storedBatchSize,
    seedMode: storedSeedMode,
    seed: storedSeed,
    batchImages: storedBatchImages,
    selectedImg: verifiedSelectedImg,
    comfyHistoryImages: [],

    initialize: () => {
      if (isInitializing || ws) return
      isInitializing = true

      configApi.get()
        .then((config) => {
          const url = (config && config.comfy_url) ? config.comfy_url : 'http://localhost:8188'
          comfyUrl = url
          const resolvedUrl = resolveComfyUrl(url)
          
          // Reconcile queue/history state
          reconcileState(resolvedUrl)
          get().fetchHistory()

          const wsUrl = resolvedUrl.replace(/^http/, 'ws')
          ws = new WebSocket(`${wsUrl}/ws?clientId=${get().clientId}`)
          ws.binaryType = 'blob'

          ws.onopen = () => set({ isConnected: true })
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
                  break

                case 'execution_error':
                  set({
                    isGenerating: false,
                    progress: null,
                    currentPromptId: null,
                    activeClientId: null,
                  })
                  localStorage.removeItem('prompt-surgeon-current-prompt-id')
                  break
              }
            } catch (e) {
              console.error('Failed to parse WebSocket message:', e)
            }
          }
        })
        .catch((e) => {
          console.error('Failed to initialize ComfyUI WebSocket store:', e)
        })
        .finally(() => {
          isInitializing = false
        })
    },

    setFilterOwnSession: (filter: boolean) => {
      set({ filterOwnSession: filter })
      localStorage.setItem('prompt-surgeon-filter-own', String(filter))
    },

    setSelectedWorkflowId: (id: number | null) => {
      set({ selectedWorkflowId: id })
      if (id !== null) {
        localStorage.setItem('prompt-surgeon-workflow-id', String(id))
      } else {
        localStorage.removeItem('prompt-surgeon-workflow-id')
      }
    },

    setParamValues: (values: Record<string, string>) => {
      set({ paramValues: values })
      localStorage.setItem('prompt-surgeon-params', JSON.stringify(values))
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
  }
})
