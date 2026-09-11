import { StateCreator } from 'zustand'
import { comfyApi, promptMetadataApi } from '../../api/client'
import { resolveComfyUrl } from '../../hooks/useComfyWebSocket'
import { LS_KEYS } from '../../utils/localStorageKeys'
import type { GenerationState, JobQueueState, JobQueueActions, ComfyHistoryItem, QueuePromptOptions } from '../types'
import { comfyWsService } from '../services/comfyWebSocketService'
import { resolveNodeTitle } from './connectionSlice'

export type JobQueueSlice = JobQueueState & JobQueueActions

export const createJobQueueSlice: StateCreator<GenerationState, [], [], JobQueueSlice> = (set, get) => {
  const storedFilterOwn = localStorage.getItem(LS_KEYS.FILTER_OWN) === 'true'

  let storedBatchImages: string[] = []
  try {
    storedBatchImages = JSON.parse(localStorage.getItem(LS_KEYS.BATCH_IMAGES) || '[]')
    storedBatchImages = storedBatchImages.filter((img) => !img.startsWith('blob:'))
  } catch {}

  const storedSelectedImg = localStorage.getItem(LS_KEYS.SELECTED_IMG)
  const verifiedSelectedImg =
    storedSelectedImg && !storedSelectedImg.startsWith('blob:') ? storedSelectedImg : null

  return {
    filterOwnSession: storedFilterOwn,
    batchImages: storedBatchImages,
    selectedImg: verifiedSelectedImg,
    comfyHistoryImages: [],
    queueRunning: [],
    queuePending: [],
    isBatchSubmitting: false,
    activeBatch: null,

    setFilterOwnSession: (filter) => {
      set({ filterOwnSession: filter })
      localStorage.setItem(LS_KEYS.FILTER_OWN, String(filter))
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

    queuePrompt: async (workflow, metadata, options?: QueuePromptOptions) => {
      if (options?.signal?.aborted) {
        return null
      }

      const execute = async (): Promise<string | null> => {
        try {
          const data = await comfyApi.queuePrompt({
            prompt: workflow,
            client_id: get().clientId,
          })

          if (options?.signal?.aborted) {
            return null
          }

          if (data.error) {
            const errorMsg =
              typeof data.error === 'object'
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
            const metaKey = `prompt-surgeon-meta-${promptId}`
            const promptMetadata = {
              paramValues: metadata?.paramValues ?? get().paramValues,
              appliedAssets: metadata?.appliedAssets ?? get().appliedAssets,
              timestamp: Date.now(),
            }
            localStorage.setItem(metaKey, JSON.stringify(promptMetadata))

            // サーバー側DBへ非同期保存 (端末間同期対応)
            promptMetadataApi?.create?.({
              prompt_id: promptId,
              workflow_id: get().selectedWorkflowId ?? undefined,
              param_values: promptMetadata.paramValues,
              applied_assets: promptMetadata.appliedAssets,
            })?.catch?.((err: any) => {
              console.warn('[PromptMetadata] Failed to persist metadata to server:', err)
            })


            // 200件上限のLRUクリーンアップ (ローカルストレージ側)
            setTimeout(() => {
              try {
                const keys = Object.keys(localStorage).filter((k) => k.startsWith('prompt-surgeon-meta-'))
                if (keys.length > 200) {
                  const items = keys.map((k) => {
                    try {
                      const val = JSON.parse(localStorage.getItem(k) || '{}')
                      return { key: k, timestamp: val.timestamp || 0 }
                    } catch {
                      return { key: k, timestamp: 0 }
                    }
                  })
                  items.sort((a, b) => a.timestamp - b.timestamp)
                  const toDelete = items.slice(0, items.length - 200)
                  toDelete.forEach((item) => localStorage.removeItem(item.key))
                }
              } catch (e) {
                console.error('Failed to prune prompt metadata:', e)
              }
            }, 0)
          }
          if (options?.isBatchIntermediate) {
            set({
              isGenerating: true,
              currentPromptId: promptId,
              activeClientId: get().clientId,
              currentWorkflow: workflow as Record<string, any>,
            })
          } else {
            set({
              isGenerating: true,
              previewImage: null,
              progress: null,
              currentPromptId: promptId,
              activeClientId: get().clientId,
              currentWorkflow: workflow as Record<string, any>,
            })
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
          get().setErrorToast({ message: e.message || 'Failed to queue prompt', type: 'error' })
          return null
        }
      }

      const submissionPromise = execute()
      comfyWsService.setActiveSubmissionPromise(submissionPromise)
      try {
        return await submissionPromise
      } finally {
        if (comfyWsService.getActiveSubmissionPromise() === submissionPromise) {
          comfyWsService.setActiveSubmissionPromise(null)
        }
      }
    },

    cancelGeneration: async () => {
      await get().cancelAllJobs()
    },

    fetchHistory: async () => {
      const activeFetchPromise = comfyWsService.getActiveFetchHistoryPromise()
      if (activeFetchPromise) {
        return activeFetchPromise
      }
      const execute = async () => {
        const currentUrl = comfyWsService.getComfyUrl() || get().comfyUrl || ''
        const resolvedUrl = resolveComfyUrl(currentUrl)
        try {
          const data = await comfyApi.getHistory(200)
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
            const nextBatch = Array.from(new Set([...state.batchImages, ...ownImages])).slice(0, 8)
            localStorage.setItem(LS_KEYS.BATCH_IMAGES, JSON.stringify(nextBatch))

            const nextSelected =
              state.selectedImg || (state.filterOwnSession ? nextBatch[0] : allImages[0]) || null
            if (nextSelected && !state.selectedImg) {
              localStorage.setItem(LS_KEYS.SELECTED_IMG, nextSelected)
            }

            return {
              comfyHistoryImages: allImages.slice(0, 200),
              batchImages: nextBatch,
              selectedImg: nextSelected,
            }
          })
          window.dispatchEvent(new CustomEvent('comfy-job-event', { detail: { type: 'history-fetched' } }))
        } catch (e) {
          console.error('Failed to fetch comfy history:', e)
        }
      }
      const fetchPromise = execute()
      comfyWsService.setActiveFetchHistoryPromise(fetchPromise)
      try {
        await fetchPromise
      } finally {
        comfyWsService.setActiveFetchHistoryPromise(null)
      }
    },

    fetchQueue: async () => {
      try {
        const data = await comfyApi.getQueue()
        if (!data) return

        set({ queueRunning: data.queue_running || [], queuePending: data.queue_pending || [] })

        const running = data.queue_running || []
        if (running.length > 0) {
          const activeJob = running[0]
          const activeJobClientId = activeJob[3]?.client_id || null
          if (activeJobClientId) {
            set({ activeClientId: activeJobClientId })
          }
          if (!get().currentWorkflow && activeJob[2]) {
            set({ currentWorkflow: activeJob[2] })
          }
          const currNode = get().currentNode
          if (currNode && (currNode.name === 'Unknown' || !currNode.name) && activeJob[2]) {
            const resolvedName = resolveNodeTitle(activeJob[2], currNode.id)
            if (resolvedName) {
              set({
                currentNode: { id: currNode.id, name: resolvedName },
                nodeProgress: get().nodeProgress ? { ...get().nodeProgress!, nodeName: resolvedName } : null,
              })
            }
          }
        }

        const activeBatch = get().activeBatch
        if (activeBatch) {
          const activeQueueIds = new Set([
            ...(data.queue_running || []).map((j: any) => j[1]),
            ...(data.queue_pending || []).map((j: any) => j[1]),
          ])
          const activeUnfinishedJobs = activeBatch.filter(
            (job) => job.status === 'pending' || job.status === 'generating'
          )
          if (activeUnfinishedJobs.length > 0) {
            if (get().isBatchSubmitting) return

            const anyUnfinishedInQueue = activeUnfinishedJobs.some((job) => activeQueueIds.has(job.promptId))
            if (!anyUnfinishedInQueue) {
              set({ activeBatch: null, isGenerating: false })
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch comfy queue:', e)
      }
    },

    cancelJob: async (promptId: string): Promise<void> => {
      get().abortSubmission()
      const activeSubmission = comfyWsService.getActiveSubmissionPromise()
      if (activeSubmission) {
        try {
          await activeSubmission
        } catch {}
      }
      try {
        const isCurrentRunning = get().currentPromptId === promptId
        const isInQueueRunning = get().queueRunning.some((job) => job[1] === promptId)
        const isRunning = isCurrentRunning || isInQueueRunning

        set((state) => ({
          queuePending: state.queuePending.filter((job) => job[1] !== promptId),
        }))

        if (isRunning) {
          await comfyApi.interrupt()
          Promise.resolve(comfyApi.deleteHistory({ delete: [promptId] })).catch((e) => {
            console.error('Failed to delete history in cancelJob:', e)
          })
        } else {
          await comfyApi.deleteQueue({ delete: [promptId] })
        }

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
      } catch (e) {
        console.error('Failed to cancel job:', e)
      }
    },

    clearPendingQueue: async (): Promise<void> => {
      get().abortSubmission()
      const activeSubmission = comfyWsService.getActiveSubmissionPromise()
      if (activeSubmission) {
        try {
          await activeSubmission
        } catch {}
      }
      try {
        set({ queuePending: [] })
        await comfyApi.deleteQueue({ clear: true })

        const activeBatch = get().activeBatch
        if (activeBatch) {
          const updatedBatch = activeBatch.filter(
            (job) => job.status === 'generating' || job.status === 'completed'
          )
          set({ activeBatch: updatedBatch.length > 0 ? updatedBatch : null })
        }
      } catch (e) {
        console.error('Failed to clear pending queue:', e)
      }
    },

    cancelAllJobs: async (): Promise<void> => {
      get().abortSubmission()
      const activeSubmission = comfyWsService.getActiveSubmissionPromise()
      if (activeSubmission) {
        try {
          await activeSubmission
        } catch {}
      }
      try {
        const runningIds = get().queueRunning.map((j) => j[1])

        set({
          queuePending: [],
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

        try {
          await comfyApi.deleteQueue({ clear: true })
        } catch (e) {
          console.error('Failed to clear queue in cancelAllJobs:', e)
        }

        try {
          await comfyApi.interrupt()
        } catch (e) {
          console.error('Failed to interrupt in cancelAllJobs:', e)
        }

        if (runningIds.length > 0) {
          Promise.resolve(comfyApi.deleteHistory({ delete: runningIds })).catch((e) => {
            console.error('Failed to delete history in cancelAllJobs:', e)
          })
        }
      } catch (e) {
        console.error('Failed to cancel all jobs:', e)
      }
    },
  }
}
