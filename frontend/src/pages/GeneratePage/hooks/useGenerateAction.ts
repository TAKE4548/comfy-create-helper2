/**
 * useGenerateAction — handles batch generation logic:
 * injects params into workflow JSON and calls queuePrompt.
 */

import { useGenerationStore } from '../../../store/useGenerationStore'
import type { BatchJob } from '../../../store/useGenerationStore'
import type { Workflow } from '../../../api/types'
import { applyBypass } from '../../../utils/bypassUtils'
import { injectWorkflowParams } from '../../../utils/workflowParamInjector'
import { promptToSetMapCache } from '../../../utils/promptToSetMapCache'

export function useGenerateAction(workflow: Workflow | undefined, comfyObjectInfo: any = {}) {
  const {
    paramValues: currentParamValues,
    batchSize: currentBatchSize,
    seedMode: currentSeedMode,
    seed: currentSeed,
    sets,
    queuePrompt,
    activeBatch,
    setActiveBatch,
    appliedAssets,
    bypassProfiles = [],
    paramSyncGroups = [],
    setSubmissionAbortController,
    setIsBatchSubmitting,
    fetchQueue,
    setErrorToast,
  } = useGenerationStore()

  const applyParamSync = (paramValues: Record<string, string>): Record<string, string> => {
    const activeGroups = (paramSyncGroups || []).filter((g) => g.is_enabled)
    if (activeGroups.length === 0) return paramValues

    const merged = { ...paramValues }
    activeGroups.forEach((g) => {
      const masterVal = merged[g.master_role]
      if (masterVal !== undefined) {
        g.slave_roles.forEach((slaveRole) => {
          merged[slaveRole] = masterVal
        })
      }
    })
    return merged
  }

  const handleGenerate = async () => {
    if (!workflow) return
    const activeBypassNodeIds = Array.from(
      new Set(
        bypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    const syncedParamValues = applyParamSync(currentParamValues)

    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)
    setIsBatchSubmitting?.(true)

    try {
      for (let i = 0; i < currentBatchSize; i++) {
        if (abortController.signal.aborted) {
          return
        }
        let wfJson = injectWorkflowParams({
          workflow,
          paramValues: syncedParamValues,
          seedOptions: {
            seedMode: currentSeedMode,
            seed: currentSeed,
            index: i,
          },
          cloneJson: true,
        })
        if (activeBypassNodeIds.length > 0) {
          wfJson = applyBypass(wfJson, activeBypassNodeIds, comfyObjectInfo)
        }
        await queuePrompt(
          wfJson,
          { paramValues: syncedParamValues, appliedAssets },
          { signal: abortController.signal, skipQueueFetch: true }
        )
        if (abortController.signal.aborted) {
          return
        }
      }
    } finally {
      setIsBatchSubmitting?.(false)
      if (!abortController.signal.aborted) {
        await fetchQueue?.()
      }
    }
  }

  const handleGenerateSets = async () => {
    if (!workflow) return
    const checkedSets = sets.filter((s) => s.checked)
    if (checkedSets.length === 0) {
      setErrorToast?.({ message: '生成対象のセットが選択されていません', type: 'error' })
      return
    }

    // 中断用 AbortController の作成とストア登録
    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)
    setIsBatchSubmitting?.(true)

    // 新規投入分のジョブ枠を構築
    const newBatchJobs: BatchJob[] = []
    checkedSets.forEach((setItem) => {
      for (let i = 0; i < setItem.batchSize; i++) {
        newBatchJobs.push({
          promptId: `pending-${setItem.name}-${i}-${Date.now()}`,
          setName: setItem.name,
          status: 'pending'
        })
      }
    })

    // 既存の activeBatch があればマージして母数を合算
    const existingActiveBatch = activeBatch ? [...activeBatch] : []
    const currentBatch: BatchJob[] = [...existingActiveBatch, ...newBatchJobs]
    setActiveBatch([...currentBatch])

    const activeBypassNodeIds = Array.from(
      new Set(
        bypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    let currentIdx = existingActiveBatch.length
    try {
      for (const setItem of checkedSets) {
        const syncedParamValues = applyParamSync(setItem.paramValues)
        for (let i = 0; i < setItem.batchSize; i++) {
          // キャンセル中断チェック
          if (abortController.signal.aborted) {
            console.log('Batch queueing aborted by user.')
            return
          }

          let wfJson = injectWorkflowParams({
            workflow,
            paramValues: syncedParamValues,
            seedOptions: {
              seedMode: setItem.seedMode,
              seed: setItem.seed,
              index: i,
            },
            cloneJson: true,
          })
          if (activeBypassNodeIds.length > 0) {
            wfJson = applyBypass(wfJson, activeBypassNodeIds, comfyObjectInfo)
          }
          
          let promptId: string | null = null
          try {
            promptId = await queuePrompt(
              wfJson,
              { paramValues: syncedParamValues, appliedAssets: setItem.appliedAssets },
              {
                skipQueueFetch: true,
                signal: abortController.signal,
                isBatchIntermediate: true,
              }
            )
          } catch (err) {
            console.error(`Failed to generate set ${setItem.name} (batch index ${i}):`, err)
          }

          // queuePrompt 完了後のキャンセルチェック
          if (abortController.signal.aborted) {
            return
          }

          if (promptId) {
            promptToSetMapCache.setMapping(promptId, setItem.name)
            currentBatch[currentIdx] = {
              ...currentBatch[currentIdx],
              promptId,
              status: 'pending',
            }
            setActiveBatch([...currentBatch])
          } else {
            const errorMsg = `[${setItem.name}] (${i + 1}/${setItem.batchSize}) のキュー投入に失敗しました`
            setErrorToast?.({ message: errorMsg, type: 'error' })
            currentBatch[currentIdx] = {
              ...currentBatch[currentIdx],
              status: 'failed',
            }
            setActiveBatch([...currentBatch])
          }
          currentIdx++
        }
      }
    } finally {
      setIsBatchSubmitting?.(false)
      promptToSetMapCache.saveToStorage()

      // キャンセル中断時は setActiveBatch 上書きと fetchQueue を抑止
      if (!abortController.signal.aborted) {
        setActiveBatch([...currentBatch])
        await fetchQueue?.()
      }
    }
  }

  return { handleGenerate, handleGenerateSets }
}
