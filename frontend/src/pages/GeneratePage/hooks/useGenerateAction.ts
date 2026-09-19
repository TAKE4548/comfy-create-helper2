/**
 * useGenerateAction — handles batch generation logic:
 * injects params into workflow JSON and calls queuePrompt.
 */

import { useGenerationStore } from '../../../store/useGenerationStore'
import type { BatchJob } from '../../../store/useGenerationStore'
import type { Workflow, ParamSyncGroup } from '../../../api/types'
import { getEffectiveParamValues } from '../../../store/slices/multiSetSlice'
import { applyBypass } from '../../../utils/bypassUtils'
import { injectWorkflowParams } from '../../../utils/workflowParamInjector'
import { promptToSetMapCache } from '../../../utils/promptToSetMapCache'

export interface UseGenerateActionOptions {
  onBeforeGenerate?: () => void
}

export function useGenerateAction(
  workflow: Workflow | undefined,
  comfyObjectInfo: any = {},
  options?: UseGenerateActionOptions
) {
  const hookStore = useGenerationStore()
  const {
    queuePrompt,
    setActiveBatch,
    setSubmissionAbortController,
    setIsBatchSubmitting,
    fetchQueue,
    setErrorToast,
  } = hookStore

  const getLatestState = () =>
    typeof useGenerationStore.getState === 'function'
      ? useGenerationStore.getState()
      : hookStore

  const applyParamSync = (
    paramValues: Record<string, string>,
    groups: ParamSyncGroup[] = []
  ): Record<string, string> => {
    const activeGroups = (groups || []).filter((g) => g.is_enabled)
    if (activeGroups.length === 0) return paramValues

    const merged = { ...paramValues }
    activeGroups.forEach((g) => {
      const masterVal = merged[g.master_role]
      if (masterVal !== undefined) {
        g.slave_roles.forEach((slaveRole: string) => {
          merged[slaveRole] = masterVal
        })
      }
    })
    return merged
  }

  const handleGenerate = async () => {
    if (!workflow) return
    options?.onBeforeGenerate?.()

    const state = getLatestState()
    const currentParamValues = state.paramValues
    const currentPromptChips = state.promptChips
    const currentBatchSize = state.batchSize
    const currentSeedMode = state.seedMode
    const currentSeed = state.seed
    const currentAppliedAssets = state.appliedAssets
    const currentBypassProfiles = state.bypassProfiles || []
    const currentParamSyncGroups = state.paramSyncGroups || []

    const activeBypassNodeIds = Array.from(
      new Set(
        currentBypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    const hasComfySchema = comfyObjectInfo && Object.keys(comfyObjectInfo).length > 0
    if (activeBypassNodeIds.length > 0 && !hasComfySchema) {
      setErrorToast?.({
        message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。',
        type: 'error',
      })
      return
    }

    const effectiveParamValues = getEffectiveParamValues(currentParamValues, currentPromptChips || {})
    const syncedParamValues = applyParamSync(effectiveParamValues, currentParamSyncGroups)

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
          { paramValues: syncedParamValues, appliedAssets: currentAppliedAssets },
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
    options?.onBeforeGenerate?.()

    const state = getLatestState()
    const currentParamValues = state.paramValues
    const currentPromptChips = state.promptChips
    const currentSets = state.sets
    const currentActiveSetId = state.activeSetId
    const currentParamSyncGroups = state.paramSyncGroups || []
    const currentBypassProfiles = state.bypassProfiles || []

    const checkedSets = currentSets.filter((s) => s.checked)
    if (checkedSets.length === 0) {
      setErrorToast?.({ message: '生成対象のセットが選択されていません', type: 'error' })
      return
    }

    const activeBypassNodeIds = Array.from(
      new Set(
        currentBypassProfiles
          .filter((p) => p.is_enabled)
          .flatMap((p) => p.bypassed_node_ids)
      )
    )

    const hasComfySchema = comfyObjectInfo && Object.keys(comfyObjectInfo).length > 0
    if (activeBypassNodeIds.length > 0 && !hasComfySchema) {
      setErrorToast?.({
        message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。',
        type: 'error',
      })
      return
    }

    // 中断用 AbortController の作成とストア登録
    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)
    setIsBatchSubmitting?.(true)

    // 新規投入分のジョブ枠を構築（画面最新のバッチサイズと整合させる）
    const newBatchJobs: BatchJob[] = []
    checkedSets.forEach((setItem) => {
      const isTargetActive =
        currentActiveSetId !== null &&
        currentActiveSetId !== undefined &&
        String(setItem.id) === String(currentActiveSetId)
      const batchCount = isTargetActive ? (state.batchSize ?? setItem.batchSize) : setItem.batchSize
      for (let i = 0; i < batchCount; i++) {
        newBatchJobs.push({
          promptId: `pending-${setItem.name}-${i}-${Date.now()}`,
          setName: setItem.name,
          status: 'pending'
        })
      }
    })

    // 既存の activeBatch があればマージして母数を合算
    const existingActiveBatch = state.activeBatch ? [...state.activeBatch] : []
    const currentBatch: BatchJob[] = [...existingActiveBatch, ...newBatchJobs]
    setActiveBatch([...currentBatch])

    let currentIdx = existingActiveBatch.length
    try {
      for (const setItem of checkedSets) {
        const isActive =
          currentActiveSetId !== null &&
          currentActiveSetId !== undefined &&
          String(setItem.id) === String(currentActiveSetId)

        const itemParams = isActive
          ? { ...setItem.paramValues, ...currentParamValues }
          : setItem.paramValues
        const itemChips = isActive
          ? ((currentPromptChips && Object.keys(currentPromptChips).length > 0)
              ? currentPromptChips
              : (setItem.promptChips || {}))
          : (setItem.promptChips || {})

        const effectiveParamValues = getEffectiveParamValues(itemParams, itemChips)
        const syncedParamValues = applyParamSync(effectiveParamValues, currentParamSyncGroups)

        const effectiveBatchSize = isActive ? (state.batchSize ?? setItem.batchSize) : setItem.batchSize
        const effectiveSeedMode = isActive ? (state.seedMode ?? setItem.seedMode) : setItem.seedMode
        const effectiveSeed = isActive ? (state.seed ?? setItem.seed) : setItem.seed

        for (let i = 0; i < effectiveBatchSize; i++) {
          // キャンセル中断チェック
          if (abortController.signal.aborted) {
            console.log('Batch queueing aborted by user.')
            return
          }

          let wfJson = injectWorkflowParams({
            workflow,
            paramValues: syncedParamValues,
            seedOptions: {
              seedMode: effectiveSeedMode,
              seed: effectiveSeed,
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
            const errorMsg = `[${setItem.name}] (${i + 1}/${effectiveBatchSize}) のキュー投入に失敗しました`
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
