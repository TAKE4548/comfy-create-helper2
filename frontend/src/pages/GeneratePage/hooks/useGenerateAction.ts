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
import { buildGenerationRecord, PROMPT_RECORD_KEY, ASSOCIATIONS_KEY } from '../../../utils/generationRecord'
import type { CaptureAssetInput } from '../../../utils/generationRecord'
import type { PrepareSeedBatchOptions, ResolvedSeedItem } from '../../../utils/seedBatch'
import { generationApi } from '../../../api/domains/generation'
import type { BatchRequest, GenerationItem } from '../../../api/domains/generation'
import { prepareSeedBatch, validateSeedBatch } from '../../../utils/seedBatch'

const freeze = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const cleanParams = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([key]) => key !== PROMPT_RECORD_KEY && key !== ASSOCIATIONS_KEY))

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

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
    submitGenerationBatch,
    setActiveBatch,
    setSubmissionAbortController,
    setIsBatchSubmitting,
    setErrorToast,
    setVramWaitStatus,
  } = hookStore

  const getLatestState = () =>
    typeof useGenerationStore.getState === 'function'
      ? useGenerationStore.getState()
      : hookStore

  const monitorServerVramWait = (jobIds: string[], signal: AbortSignal): void => {
    let timer: ReturnType<typeof setInterval> | null = null
    let unsubscribe: (() => void) | null = null
    let waitDurationSec = 0
    let lastFreeGb: number | null = null
    let lastRequiredGb = 6
    let settled = false
    let warningShown = false

    const clear = () => {
      if (timer) clearInterval(timer)
      timer = null
      unsubscribe?.()
      unsubscribe = null
      signal.removeEventListener('abort', onAbort)
      setVramWaitStatus?.(null)
    }
    const finish = () => {
      if (settled) return
      settled = true
      clear()
    }
    const onAbort = () => {
      for (const jobId of jobIds) void generationApi.cancelJob(jobId, true).catch((error: unknown) => {
        console.warn('Failed to cancel an unsubmitted generation job:', error)
      })
      finish()
    }
    const update = () => {
      if (settled) return
      const current = getLatestState()
      const stats = current.systemStats
      const matchingJobs = current.generationSnapshot?.jobs.filter((job) => jobIds.includes(job.job_id)) ?? []
      // Acceptance may finish before its snapshot is delivered. Keep the
      // subscription until these accepted IDs appear in a complete snapshot.
      if (matchingJobs.length === 0) return
      const waitingJobs = matchingJobs.filter((job) => job.status === 'queued' && job.prompt_id === null)
      if (waitingJobs.length === 0 || stats?.vram_safe === true) {
        finish()
        return
      }
      if (stats?.vram_safe !== false) return
      lastFreeGb = stats.vram_free_gb ?? lastFreeGb
      lastRequiredGb = stats.vram_min_free_gb ?? lastRequiredGb
      const nextWaitStatus = { isWaiting: true, freeGb: lastFreeGb, requiredGb: lastRequiredGb, waitDurationSec }
      const currentWaitStatus = getLatestState().vramWaitStatus
      if (currentWaitStatus?.isWaiting !== nextWaitStatus.isWaiting ||
          currentWaitStatus.freeGb !== nextWaitStatus.freeGb ||
          currentWaitStatus.requiredGb !== nextWaitStatus.requiredGb ||
          currentWaitStatus.waitDurationSec !== nextWaitStatus.waitDurationSec) {
        setVramWaitStatus?.(nextWaitStatus)
      }
      if (!timer) {
        timer = setInterval(() => {
          waitDurationSec += 1
          update()
          if (!settled && !warningShown && waitDurationSec >= 10) {
            warningShown = true
            setErrorToast?.({ message: 'VRAM解放待ちが継続しています。他プロセスの終了待機中（キャンセル可能）', type: 'warning' as any })
          }
        }, 1000)
      }
    }

    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    unsubscribe = useGenerationStore.subscribe(update)
    update()
  }

  const applyParamSync = (
    paramValues: Record<string, string>,
    groups: ParamSyncGroup[] = [],
    workflowMappings: Workflow['mappings'] = []
  ): Record<string, string> => {
    const activeGroups = (groups || []).filter((g) => g.is_enabled)
    if (activeGroups.length === 0) return paramValues

    const merged = { ...paramValues }
    const seedRoles = new Set(workflowMappings.filter((mapping) => mapping.input_type === 'seed' && mapping.role).map((mapping) => mapping.role as string))
    activeGroups.forEach((g) => {
      if (seedRoles.has(g.master_role) || g.slave_roles.some((role) => seedRoles.has(role))) return
      const masterVal = merged[g.master_role]
      if (masterVal !== undefined) {
        g.slave_roles.forEach((slaveRole: string) => {
          merged[slaveRole] = masterVal
        })
      }
    })
    return merged
  }

  const captureWorkflow = (): Workflow | null => {
    if (!workflow) return null
    const captured = freeze(workflow)
    try { buildGenerationRecord(captured, {}, {}, {}) }
    catch (error) { setErrorToast?.({ message: error instanceof Error ? error.message : '生成時記録を作成できません', type: 'error' }); return null }
    return captured
  }

  const handleGenerate = async () => {
    if (!workflow) return
    options?.onBeforeGenerate?.()

    const state = getLatestState()
    const currentParamValues = cleanParams(freeze(state.paramValues))
    const currentSets = freeze(state.sets || [])
    const currentWorkflow = freeze(workflow)
    const capturedWorkflow = captureWorkflow()
    if (!capturedWorkflow) return

    const activeSet = state.activeSetId == null
      ? undefined
      : currentSets.find((set) => String(set.id) === String(state.activeSetId))
    const activeSetName = activeSet?.name
    const currentPromptChips = freeze(state.promptChips || {})
    const isAnimaMode = state.isAnimaMode
    const promptRoleAllowlist = (capturedWorkflow.mappings || [])
      .filter((mapping) => mapping.role != null && mapping.input_type === 'textarea')
      .map((mapping) => mapping.role as string)
    const currentBatchSize = state.batchSize
    const currentSeedMode = state.seedMode
    const currentSeed = state.seed
    const currentAppliedAssets = freeze(state.appliedAssets || {})
    const currentBypassProfiles = freeze(state.bypassProfiles || [])
    const currentParamSyncGroups = freeze(state.paramSyncGroups || [])
    const activeBypassNodeIds = Array.from(new Set(currentBypassProfiles
      .filter((profile) => profile.is_enabled)
      .flatMap((profile) => profile.bypassed_node_ids)))

    const hasComfySchema = comfyObjectInfo && Object.keys(comfyObjectInfo).length > 0
    if (activeBypassNodeIds.length > 0 && !hasComfySchema) {
      setErrorToast?.({ message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。', type: 'error' })
      return
    }

    const effectiveParamValues = applyParamSync(
      getEffectiveParamValues(currentParamValues, currentPromptChips, isAnimaMode, promptRoleAllowlist),
      currentParamSyncGroups,
      capturedWorkflow.mappings
    )
    const seedOptions = freeze({ workflow: currentWorkflow, paramValues: effectiveParamValues, batchSize: currentBatchSize, paramSyncGroups: currentParamSyncGroups })
    let resolvedSeeds
    try {
      validateSeedBatch(seedOptions)
      resolvedSeeds = prepareSeedBatch(seedOptions)
    } catch (error) {
      setErrorToast?.({ message: `生成: ${error instanceof Error ? error.message : String(error)}`, type: 'error' })
      return
    }
    const items: GenerationItem[] = []
    for (let index = 0; index < currentBatchSize; index++) {
      const resolved = resolvedSeeds[index]
      const injectedGraph = injectWorkflowParams({
        workflow: capturedWorkflow,
        paramValues: resolved.actualParamValues,
        seedOptions: { seedMode: currentSeedMode, seed: currentSeed, index },
        resolvedSeeds: resolved.seedsBySlot,
        cloneJson: true,
      })
      let finalGraph = injectedGraph
      if (activeBypassNodeIds.length > 0) finalGraph = applyBypass(finalGraph, activeBypassNodeIds, comfyObjectInfo)
      items.push({
        graph: finalGraph,
        workflow_id: capturedWorkflow.id,
        param_values: {
          ...resolved.actualParamValues,
          [PROMPT_RECORD_KEY]: JSON.stringify(buildGenerationRecord(capturedWorkflow, injectedGraph, finalGraph, currentAppliedAssets)),
        },
        applied_assets: currentAppliedAssets,
        ...(activeSet ? { set_name: activeSetName } : {}),
      })
    }

    const request: BatchRequest = freeze({
      request_id: createRequestId(),
      session_id: state.clientId,
      scope: 'normal',
      items,
    })
    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)
    setIsBatchSubmitting?.(true)
    const failures: SubmissionFailureRecord[] = []
    try {
      if (abortController.signal.aborted) return
      const accepted = await submitGenerationBatch(request)
      if (abortController.signal.aborted) {
        monitorServerVramWait(accepted.job_ids, abortController.signal)
        return
      }
      monitorServerVramWait(accepted.job_ids, abortController.signal)
    } catch (error) {
      if (!abortController.signal.aborted) {
        const failure = parseQueueSubmissionFailure(error)
        items.forEach((_, index) => failures.push({
          target: '生成', isSet: false,
          batchIndex: currentBatchSize === 1 ? null : index,
          batchSize: currentBatchSize,
          ...failure,
        }))
      }
    } finally {
      setIsBatchSubmitting?.(false)
    }
    if (!abortController.signal.aborted && failures.length > 0) {
      setErrorToast?.({ message: formatSubmissionFailures(failures), type: 'error', persistent: true })
    }
  }

  const handleGenerateSets = async () => {
    if (!workflow) return
    options?.onBeforeGenerate?.()
    const state = getLatestState()
    const currentParamValues = cleanParams(freeze(state.paramValues))
    const currentSets = freeze(state.sets || [])
    const currentWorkflow = freeze(workflow)
    const capturedWorkflow = captureWorkflow()
    if (!capturedWorkflow) return

    const currentPromptChips = freeze(state.promptChips || {})
    const currentAppliedAssets = freeze(state.appliedAssets || {})
    const currentActiveSetId = state.activeSetId
    const currentParamSyncGroups = freeze(state.paramSyncGroups || [])
    const currentBypassProfiles = freeze(state.bypassProfiles || [])
    const checkedSets = currentSets.filter((setItem) => setItem.checked)
    if (checkedSets.length === 0) {
      setErrorToast?.({ message: '生成対象のセットが選択されていません', type: 'error' })
      return
    }

    const activeBypassNodeIds = Array.from(new Set(currentBypassProfiles
      .filter((profile) => profile.is_enabled)
      .flatMap((profile) => profile.bypassed_node_ids)))
    const hasComfySchema = comfyObjectInfo && Object.keys(comfyObjectInfo).length > 0
    if (activeBypassNodeIds.length > 0 && !hasComfySchema) {
      setErrorToast?.({ message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。', type: 'error' })
      return
    }

    const plans: Array<{ setItem: (typeof checkedSets)[number]; itemAssets: Record<string, CaptureAssetInput[]>; effectiveBatchSize: number; effectiveSeedMode: 'fixed' | 'random'; effectiveSeed: number; seedOptions: PrepareSeedBatchOptions; resolvedSeeds?: ResolvedSeedItem[] }> = []
    let validatingSetName = checkedSets[0]?.name ?? 'セット'
    try {
      for (const setItem of checkedSets) {
        validatingSetName = setItem.name
        const isActive = currentActiveSetId != null && String(setItem.id) === String(currentActiveSetId)
        const itemParams = isActive
          ? { ...cleanParams(setItem.paramValues || {}), ...currentParamValues }
          : cleanParams(setItem.paramValues || {})
        const itemAssets = freeze((isActive ? currentAppliedAssets : setItem.appliedAssets) || {})
        const itemChips = isActive
          ? (Object.keys(currentPromptChips).length > 0 ? currentPromptChips : (setItem.promptChips || {}))
          : (setItem.promptChips || {})
        const textareaRoles = (capturedWorkflow.mappings || [])
          .filter((mapping) => mapping.role != null && mapping.input_type === 'textarea')
          .map((mapping) => mapping.role as string)
        const syncedParamValues = applyParamSync(
          getEffectiveParamValues(itemParams, itemChips, state.isAnimaMode, textareaRoles),
          currentParamSyncGroups,
          capturedWorkflow.mappings
        )
        const effectiveBatchSize = isActive ? (state.batchSize ?? setItem.batchSize) : setItem.batchSize
        const effectiveSeedMode = isActive ? (state.seedMode ?? setItem.seedMode) : setItem.seedMode
        const effectiveSeed = isActive ? (state.seed ?? setItem.seed) : setItem.seed
        const seedOptions: PrepareSeedBatchOptions = freeze({ workflow: currentWorkflow, paramValues: syncedParamValues, batchSize: effectiveBatchSize, paramSyncGroups: currentParamSyncGroups })
        validateSeedBatch(seedOptions)
        plans.push({ setItem, itemAssets, effectiveBatchSize, effectiveSeedMode, effectiveSeed, seedOptions })
      }
      for (const plan of plans) {
        validatingSetName = plan.setItem.name
        plan.resolvedSeeds = prepareSeedBatch(plan.seedOptions)
      }
    } catch (error) {
      setErrorToast?.({ message: `${validatingSetName}: ${error instanceof Error ? error.message : String(error)}`, type: 'error' })
      return
    }

    const abortController = new AbortController()
    setSubmissionAbortController?.(abortController)
    setIsBatchSubmitting?.(true)
    const newBatchJobs: BatchJob[] = []
    const items: GenerationItem[] = []
    const itemTargets: Array<{ setName: string; batchIndex: number; batchSize: number }> = []

    for (const plan of plans) {
      const { setItem, itemAssets, effectiveBatchSize, effectiveSeedMode, effectiveSeed, resolvedSeeds } = plan
      for (let index = 0; index < effectiveBatchSize; index++) {
        const resolved = resolvedSeeds![index]
        const injectedGraph = injectWorkflowParams({
          workflow: capturedWorkflow,
          paramValues: resolved.actualParamValues,
          seedOptions: { seedMode: effectiveSeedMode, seed: effectiveSeed, index },
          resolvedSeeds: resolved.seedsBySlot,
          cloneJson: true,
        })
        let finalGraph = injectedGraph
        if (activeBypassNodeIds.length > 0) finalGraph = applyBypass(finalGraph, activeBypassNodeIds, comfyObjectInfo)
        const paramValues = {
          ...resolved.actualParamValues,
          [PROMPT_RECORD_KEY]: JSON.stringify(buildGenerationRecord(capturedWorkflow, injectedGraph, finalGraph, itemAssets)),
        }
        items.push({
          graph: finalGraph,
          workflow_id: capturedWorkflow.id,
          param_values: paramValues,
          applied_assets: itemAssets,
          set_name: setItem.name,
        })
        itemTargets.push({ setName: setItem.name, batchIndex: index, batchSize: effectiveBatchSize })
        newBatchJobs.push({ promptId: `pending-${setItem.name}-${index}-${Date.now()}`, setName: setItem.name, status: 'pending' })
      }
    }

    const existingActiveBatch = freeze(state.activeBatch || [])
    const currentBatch: BatchJob[] = [...existingActiveBatch, ...newBatchJobs]
    setActiveBatch([...currentBatch])
    const request: BatchRequest = freeze({
      request_id: createRequestId(),
      session_id: state.clientId,
      scope: 'normal',
      items,
    })
    const failures: SubmissionFailureRecord[] = []
    try {
      if (abortController.signal.aborted) return
      const accepted = await submitGenerationBatch(request)
      accepted.job_ids.forEach((jobId, index) => {
        const target = itemTargets[index]
        if (!target) return
        const batchIndex = existingActiveBatch.length + index
        currentBatch[batchIndex] = { ...currentBatch[batchIndex], promptId: jobId, status: 'pending' }
        promptToSetMapCache.setMapping(jobId, target.setName)
      })
      for (let index = accepted.job_ids.length; index < items.length; index++) {
        const target = itemTargets[index]
        failures.push({ target: target.setName, isSet: true, batchIndex: target.batchIndex, batchSize: target.batchSize, reason: '受付応答にjob_idがありません', outcome: 'unconfirmed' })
        const batchIndex = existingActiveBatch.length + index
        if (currentBatch[batchIndex]) currentBatch[batchIndex] = { ...currentBatch[batchIndex], status: 'failed' }
      }
      setActiveBatch([...currentBatch])
      promptToSetMapCache.saveToStorage()
      monitorServerVramWait(accepted.job_ids, abortController.signal)
    } catch (error) {
      if (!abortController.signal.aborted) {
        const failure = parseQueueSubmissionFailure(error)
        itemTargets.forEach((target) => failures.push({ target: target.setName, isSet: true, batchIndex: target.batchIndex, batchSize: target.batchSize, ...failure }))
        for (let index = existingActiveBatch.length; index < currentBatch.length; index++) currentBatch[index] = { ...currentBatch[index], status: 'failed' }
        setActiveBatch([...currentBatch])
      }
    } finally {
      setIsBatchSubmitting?.(false)
      if (!abortController.signal.aborted) {
        setActiveBatch([...currentBatch])
        promptToSetMapCache.saveToStorage()
      }
    }
    if (!abortController.signal.aborted && failures.length > 0) {
      setErrorToast?.({ message: formatSubmissionFailures(failures), type: 'error', persistent: true })
    }
  }

  return { handleGenerate, handleGenerateSets }
}
