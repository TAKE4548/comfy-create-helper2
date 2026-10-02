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
import type { QueueSubmissionFailure } from '../../../store/types'
import { parseQueueSubmissionFailure } from '../../../utils/queueSubmissionFailure'

type SubmissionFailureRecord = QueueSubmissionFailure & {
  target: string
  isSet: boolean
  batchIndex: number | null
  batchSize: number
}

function formatSubmissionFailures(failures: SubmissionFailureRecord[]): string {
  return failures.map(({ target, isSet, batchIndex, batchSize, reason, outcome }) => {
    const batchLabel = batchIndex === null
      ? ''
      : isSet || batchSize > 1
        ? ` (${batchIndex + 1}/${batchSize})`
        : ''
    const targetLabel = isSet ? `[${target}]${batchLabel}` : `生成${batchLabel}`
    const action = outcome === 'unconfirmed'
      ? 'キュー投入を確認できませんでした'
      : 'キュー投入に失敗しました'
    return isSet
      ? `${targetLabel} の${action}: ${reason}`
      : `${targetLabel}の${action}: ${reason}`
  }).join('\n')
}

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
    setVramWaitStatus,
  } = hookStore

  const getLatestState = () =>
    typeof useGenerationStore.getState === 'function'
      ? useGenerationStore.getState()
      : hookStore

  const waitForVramRecovery = (signal: AbortSignal): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      if (signal.aborted) {
        resolve(false)
        return
      }

      const currentState = getLatestState()
      const stats = currentState.systemStats

      // systemStats が存在し、明示的に vram_safe === false の場合のみ待機
      if (!stats || stats.vram_safe !== false) {
        resolve(true)
        return
      }

      let timer: any = null
      let unsubscribe: (() => void) | null = null
      let isSettled = false

      let waitDurationSec = 0
      let lastFreeGb = stats.vram_free_gb ?? null
      let lastRequiredGb = stats.vram_min_free_gb ?? 6.0
      let lastWaitSec = -1

      const updateWaitStatus = (nextStats = getLatestState().systemStats) => {
        const nextFree = nextStats?.vram_free_gb ?? lastFreeGb
        const nextRequired = nextStats?.vram_min_free_gb ?? lastRequiredGb
        if (
          nextFree === lastFreeGb &&
          nextRequired === lastRequiredGb &&
          waitDurationSec === lastWaitSec
        ) {
          return
        }
        lastFreeGb = nextFree
        lastRequiredGb = nextRequired
        lastWaitSec = waitDurationSec

        setVramWaitStatus?.({
          isWaiting: true,
          freeGb: nextFree,
          requiredGb: nextRequired,
          waitDurationSec,
        })
      }

      updateWaitStatus(stats)

      const cleanup = () => {
        if (timer) {
          clearInterval(timer)
          timer = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        setVramWaitStatus?.(null)
      }

      const finish = (result: boolean) => {
        if (isSettled) return
        isSettled = true
        cleanup()
        resolve(result)
      }

      const onAbort = () => {
        finish(false)
      }

      signal.addEventListener('abort', onAbort, { once: true })

      timer = setInterval(() => {
        if (isSettled) return
        waitDurationSec += 1
        updateWaitStatus()

        if (waitDurationSec === 10) {
          setErrorToast?.({
            message: 'VRAM解放待ちが継続しています。他プロセスの終了待機中（キャンセル可能）',
            type: 'warning' as any,
          })
        }
      }, 1000)

      let lastSeenStats = stats
      // Guard against re-entrant execution: setVramWaitStatus triggers a store
      // update which synchronously re-fires this subscriber. Without the flag,
      // updateWaitStatus → setVramWaitStatus → subscriber → updateWaitStatus → …
      // causes "Maximum call stack size exceeded".
      let isUpdatingWaitStatus = false
      unsubscribe = useGenerationStore.subscribe((state) => {
        if (isSettled) return
        // Only react when systemStats itself changes (not vramWaitStatus or other fields).
        if (state.systemStats && state.systemStats !== lastSeenStats) {
          if (isUpdatingWaitStatus) return
          lastSeenStats = state.systemStats
          const capturedStats = state.systemStats
          isUpdatingWaitStatus = true
          try {
            updateWaitStatus(capturedStats)
          } finally {
            isUpdatingWaitStatus = false
          }
          if (capturedStats.vram_safe === true) {
            finish(true)
          }
        }
      })
    })
  }

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
    const submissionFailures: SubmissionFailureRecord[] = []

    try {
      for (let i = 0; i < currentBatchSize; i++) {
        if (abortController.signal.aborted) {
          return
        }

        const isVramOk = await waitForVramRecovery(abortController.signal)
        if (!isVramOk || abortController.signal.aborted) {
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
        let promptId: string | null = null
        let submissionFailure: QueueSubmissionFailure | undefined
        try {
          promptId = await queuePrompt(
            wfJson,
            { paramValues: syncedParamValues, appliedAssets: currentAppliedAssets },
            {
              signal: abortController.signal,
              skipQueueFetch: true,
              onSubmissionFailure: (failure) => { submissionFailure = failure },
            }
          )
        } catch (error) {
          submissionFailure ??= parseQueueSubmissionFailure(error)
        }
        if (abortController.signal.aborted) {
          return
        }
        if (!promptId) {
          submissionFailures.push({
            target: '生成',
            isSet: false,
            batchIndex: currentBatchSize === 1 ? null : i,
            batchSize: currentBatchSize,
            ...(submissionFailure ?? parseQueueSubmissionFailure(null)),
          })
        }
      }
    } finally {
      setIsBatchSubmitting?.(false)
      if (!abortController.signal.aborted) {
        try {
          await fetchQueue?.()
        } catch (error) {
          console.error('Failed to refresh queue after submission:', error)
        }
      }
    }
    if (!abortController.signal.aborted && submissionFailures.length > 0) {
      setErrorToast?.({ message: formatSubmissionFailures(submissionFailures), type: 'error', persistent: true })
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
    const submissionFailures: SubmissionFailureRecord[] = []

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

          const isVramOk = await waitForVramRecovery(abortController.signal)
          if (!isVramOk || abortController.signal.aborted) {
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
          let submissionFailure: QueueSubmissionFailure | undefined
          try {
            promptId = await queuePrompt(
              wfJson,
              { paramValues: syncedParamValues, appliedAssets: setItem.appliedAssets },
              {
                skipQueueFetch: true,
                signal: abortController.signal,
                isBatchIntermediate: true,
                onSubmissionFailure: (failure) => { submissionFailure = failure },
              }
            )
          } catch (err) {
            console.error(`Failed to generate set ${setItem.name} (batch index ${i}):`, err)
            submissionFailure ??= parseQueueSubmissionFailure(err)
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
            submissionFailures.push({
              target: setItem.name,
              isSet: true,
              batchIndex: i,
              batchSize: effectiveBatchSize,
              ...(submissionFailure ?? parseQueueSubmissionFailure(null)),
            })
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
        try {
          await fetchQueue?.()
        } catch (error) {
          console.error('Failed to refresh queue after set submission:', error)
        }
      }
    }
    if (!abortController.signal.aborted && submissionFailures.length > 0) {
      setErrorToast?.({ message: formatSubmissionFailures(submissionFailures), type: 'error', persistent: true })
    }
  }

  return { handleGenerate, handleGenerateSets }
}
