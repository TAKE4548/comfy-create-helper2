import { StateCreator } from 'zustand'
import { configApi } from '../../api/client'
import { resolveComfyUrl } from '../../hooks/useComfyWebSocket'
import { LS_KEYS } from '../../utils/localStorageKeys'
import type { GenerationState, ConnectionState, ConnectionActions, ComfyHistoryItem, ComfyQueueResponse } from '../types'
import { comfyWsService } from '../services/comfyWebSocketService'

export type ConnectionSlice = ConnectionState & ConnectionActions

export function resolveNodeTitle(
  workflow: Record<string, any> | null | undefined,
  nodeId: string | null | undefined
): string | null {
  if (!workflow || !nodeId) return null
  const nodeInfo = workflow[nodeId]
  if (!nodeInfo) return null
  return nodeInfo._meta?.title || nodeInfo.class_type || null
}

export const createConnectionSlice: StateCreator<GenerationState, [], [], ConnectionSlice> = (set, get) => {
  const storedClientId =
    localStorage.getItem(LS_KEYS.CLIENT_ID) ||
    'prompt-surgeon-' + Math.random().toString(36).slice(2, 9)
  localStorage.setItem(LS_KEYS.CLIENT_ID, storedClientId)

  const storedCurrentPromptId = localStorage.getItem(LS_KEYS.CURRENT_PROMPT_ID)

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
    submissionAbortController: null,

    setSubmissionAbortController: (controller) => set({ submissionAbortController: controller }),
    abortSubmission: () => {
      const controller = get().submissionAbortController
      if (controller) {
        controller.abort()
        set({ submissionAbortController: null })
      }
    },

    clearPreview: () => {
      const prevUrl = get().previewImage
      if (prevUrl && prevUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(prevUrl) } catch {}
      }
      set({ previewImage: null, progress: null })
    },

    setComfyUrl: (url) => {
      comfyWsService.clearReconnectTimer()
      localStorage.setItem(LS_KEYS.COMFY_URL, url)
      set({ comfyUrl: url })
      comfyWsService.disconnect()
      get().initialize()
    },

    initialize: () => {
      comfyWsService.clearReconnectTimer()
      if (comfyWsService.getIsInitializing() || comfyWsService.getWebSocket()) return
      comfyWsService.setIsInitializing(true)

      const initConnection = (url: string) => {
        comfyWsService.setComfyUrl(url)
        set({ comfyUrl: url })
        const resolvedUrl = resolveComfyUrl(url)
        reconcileState(resolvedUrl)
        get().fetchHistory()

        comfyWsService.connect(resolvedUrl, get().clientId, {
          onOpen: () => {
            set({ isConnected: true })
            get().fetchQueue()
          },
          onClose: () => {
            set({ isConnected: false })
            if (!comfyWsService.getReconnectTimer()) {
              const timer = setTimeout(() => {
                comfyWsService.setReconnectTimer(null)
                get().initialize()
              }, 3000)
              comfyWsService.setReconnectTimer(timer)
            }
          },
          onError: () => {
            set({ isConnected: false })
          },
          onBlobMessage: (blob) => {
            const prevUrl = get().previewImage
            if (prevUrl && prevUrl.startsWith('blob:')) {
              try { URL.revokeObjectURL(prevUrl) } catch {}
            }
            const nextUrl = URL.createObjectURL(blob)
            set({ previewImage: nextUrl })
          },
          onJsonMessage: (type, data) => {
            switch (type) {
              case 'status':
                get().fetchQueue()
                break

              case 'progress': {
                const value = data.value as number
                const max = data.max as number
                const nodeId = data.node as string | undefined
                const promptId = data.prompt_id as string | undefined

                let nodeName = ''
                if (nodeId) {
                  nodeName = resolveNodeTitle(get().currentWorkflow, nodeId) || ''
                  if (!nodeName) {
                    const running = get().queueRunning
                    const activeJob = (promptId ? running.find((j: any) => j[1] === promptId) : null) || (running.length > 0 ? running[0] : null)
                    const queueWf = activeJob?.[2]
                    if (queueWf) {
                      nodeName = resolveNodeTitle(queueWf, nodeId) || ''
                      if (nodeName && !get().currentWorkflow) {
                        set({ currentWorkflow: queueWf })
                      }
                    }
                  }
                }
                if (!nodeName) {
                  nodeName = get().currentNode?.name || 'Unknown'
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
                break
              }

              case 'executing': {
                const nodeId = data.node !== undefined ? (data.node as string | null) : null
                const promptId = data.prompt_id as string | undefined
                if (nodeId) {
                  const running = get().queueRunning
                  const activeJob = (promptId ? running.find((j: any) => j[1] === promptId) : null) || (running.length > 0 ? running[0] : null)
                  const jobClientId = activeJob?.[3]?.client_id || get().activeClientId

                  let nodeName = activeJob?.[2] ? resolveNodeTitle(activeJob[2], nodeId) : null
                  if (nodeName && activeJob?.[2] && !get().currentWorkflow) {
                    set({ currentWorkflow: activeJob[2] })
                  }

                  if (!nodeName) {
                    nodeName = resolveNodeTitle(get().currentWorkflow, nodeId)
                  }

                  const finalNodeName = nodeName || 'Unknown'

                  set({
                    isGenerating: true,
                    currentPromptId: promptId || get().currentPromptId,
                    activeClientId: jobClientId,
                    currentNode: { id: nodeId, name: finalNodeName },
                    nodeProgress: {
                      value: 0,
                      max: 100,
                      percentage: 0,
                      nodeId,
                      nodeName: finalNodeName,
                    },
                  })
                } else {
                  set({
                    currentNode: null,
                    nodeProgress: null,
                  })
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
                  const currentComfyUrl = comfyWsService.getComfyUrl() || get().comfyUrl || ''
                  const baseUrl = resolveComfyUrl(currentComfyUrl)
                  const newUrls = images.map((img) =>
                    `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&t=${promptId}`
                  )
                  const firstUrl = newUrls[0]

                  const isOwn = (promptId === get().currentPromptId) || (get().activeBatch?.some(j => j.promptId === promptId) ?? false)

                  if (isOwn) {
                    set((state) => {
                      const prevUrl = state.previewImage
                      if (prevUrl && prevUrl.startsWith('blob:')) {
                        try { URL.revokeObjectURL(prevUrl) } catch {}
                      }
                      const nextImages = [...newUrls, ...state.batchImages.filter((x) => !newUrls.includes(x))].slice(0, 8)
                      const nextHistoryImages = [...newUrls, ...state.comfyHistoryImages.filter((x) => !newUrls.includes(x))].slice(0, 200)
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
                        currentWorkflow: state.currentWorkflow,
                      }
                    })
                    localStorage.removeItem(LS_KEYS.CURRENT_PROMPT_ID)
                  } else {
                    // 他端末による生成画像: comfyHistoryImages の先頭に追加し、selectedImg は未選択時のみセット。他ステートは不変
                    set((state) => {
                      const nextHistoryImages = [...newUrls, ...state.comfyHistoryImages.filter((x) => !newUrls.includes(x))].slice(0, 200)
                      const nextSelectedImg = state.selectedImg || firstUrl
                      if (!state.selectedImg) {
                        localStorage.setItem(LS_KEYS.SELECTED_IMG, firstUrl)
                      }
                      return {
                        comfyHistoryImages: nextHistoryImages,
                        selectedImg: nextSelectedImg,
                      }
                    })
                  }
                }
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
                const prevUrl = get().previewImage
                if (prevUrl && prevUrl.startsWith('blob:')) {
                  try { URL.revokeObjectURL(prevUrl) } catch {}
                }
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
          },
        })
      }

      const storedUrl = localStorage.getItem(LS_KEYS.COMFY_URL)
      if (storedUrl) {
        initConnection(storedUrl)
        comfyWsService.setIsInitializing(false)
      } else {
        configApi.get()
          .then((config) => {
            const url = config?.comfy_url || 'http://localhost:8188'
            initConnection(url)
          })
          .catch((e) => { console.error('Failed to initialize WebSocket store:', e) })
          .finally(() => { comfyWsService.setIsInitializing(false) })
      }
    },
  }
}
