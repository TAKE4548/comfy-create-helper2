import { useCallback, useRef, useSyncExternalStore } from 'react'
import { ManagerActionOutcomeUnknownError, systemManagerApi } from '../api/domains/systemManager'
import type { ManagerStatus } from '../api/domains/systemManager'
import { useManagerStatus } from './useManagerStatus'

export const FREE_MEMORY_OPERATION_KEY = 'comfy:free-memory'
export const FREE_MEMORY_MESSAGES = {
  pending: '解放要求を送信中',
  accepted: '解放要求を受け付けました。空き容量は監視値で確認してください',
  unconfirmed: '要求結果未確認: 解放要求の結果を確認できません。状態を再取得します。操作は再送しません。',
  failedPrefix: '解放要求に失敗しました: ',
} as const

export type FreeMemoryFeedbackKind = 'none' | 'pending' | 'accepted' | 'unconfirmed' | 'failed'
export interface FreeMemoryFeedback { kind: FreeMemoryFeedbackKind; message: string }
export interface FreeMemoryGuardInput { status: ManagerStatus | null; available: boolean; localOperation: string | null }
export interface FreeMemoryGuard { enabled: boolean; reason: string }

export function deriveFreeMemoryGuard(input: FreeMemoryGuardInput): FreeMemoryGuard {
  const { status, available, localOperation } = input
  const managerAvailable = available && status !== null
  const busy = status?.action_in_progress != null || localOperation !== null
  const comfy = managerAvailable ? status.comfy : undefined
  const enabled = Boolean(managerAvailable && !busy && comfy?.status === 'LISTEN' &&
    comfy.execution_state === 'idle' && comfy.queue_running === 0 && comfy.queue_pending === 0)
  if (enabled) return { enabled: true, reason: '' }
  const reason = !managerAvailable ? 'Manager状態を確認できません。' : busy ? '別のサービス操作中です。' :
    comfy?.status !== 'LISTEN' ? 'ComfyUIが停止中または状態不明です。' :
    comfy.execution_state === 'executing' ? 'ComfyUIで生成中です。' :
    comfy.execution_state === 'queued' || comfy.queue_running !== 0 || comfy.queue_pending !== 0 ? 'ComfyUIのキューが空ではありません。' :
    'ComfyUIの実行状態が不明です。'
  return { enabled: false, reason }
}

interface OperationStoreState { operation: string | null; feedback: FreeMemoryFeedback }
const NO_FEEDBACK: FreeMemoryFeedback = { kind: 'none', message: '' }
let storeState: OperationStoreState = { operation: null, feedback: NO_FEEDBACK }
const listeners = new Set<() => void>()

function setStoreState(next: OperationStoreState): void {
  storeState = next
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const getOperation = (): string | null => storeState.operation
const getFeedback = (): FreeMemoryFeedback => storeState.feedback

export function tryBeginManagerOperation(key: string): boolean {
  if (storeState.operation !== null) return false
  setStoreState({ ...storeState, operation: key })
  return true
}

export function endManagerOperation(key: string): void {
  if (storeState.operation !== key) return
  setStoreState({ ...storeState, operation: null })
}

export function useManagerOperation(): string | null {
  return useSyncExternalStore(subscribe, getOperation, getOperation)
}

export function resetManagerOperationStoreForTests(): void {
  setStoreState({ operation: null, feedback: NO_FEEDBACK })
}

function setFeedback(feedback: FreeMemoryFeedback): void {
  setStoreState({ ...storeState, feedback })
}

export interface UseComfyFreeMemoryOptions { onAccepted?: () => Promise<unknown> | void }
export interface UseComfyFreeMemoryResult extends FreeMemoryGuard {
  pending: boolean
  feedback: FreeMemoryFeedback
  run: () => Promise<FreeMemoryFeedback | null>
}

export function useComfyFreeMemory(options?: UseComfyFreeMemoryOptions): UseComfyFreeMemoryResult {
  const { status, available, refetch } = useManagerStatus()
  const operation = useManagerOperation()
  const feedback = useSyncExternalStore(subscribe, getFeedback, getFeedback)
  const guard = deriveFreeMemoryGuard({ status, available, localOperation: operation })
  const guardRef = useRef(guard)
  guardRef.current = guard
  const optionsRef = useRef(options)
  optionsRef.current = options
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const run = useCallback(async (): Promise<FreeMemoryFeedback | null> => {
    if (!guardRef.current.enabled || !tryBeginManagerOperation(FREE_MEMORY_OPERATION_KEY)) return null
    let final: FreeMemoryFeedback = { kind: 'pending', message: FREE_MEMORY_MESSAGES.pending }
    setFeedback(final)
    try {
      await systemManagerApi.freeMemory()
      final = { kind: 'accepted', message: FREE_MEMORY_MESSAGES.accepted }
      setFeedback(final)
      await optionsRef.current?.onAccepted?.()
    } catch (error) {
      final = error instanceof ManagerActionOutcomeUnknownError
        ? { kind: 'unconfirmed', message: FREE_MEMORY_MESSAGES.unconfirmed }
        : { kind: 'failed', message: `${FREE_MEMORY_MESSAGES.failedPrefix}${error instanceof Error ? error.message : String(error)}` }
      setFeedback(final)
    } finally {
      try {
        await refetchRef.current()
        await refetchRef.current()
      } finally {
        endManagerOperation(FREE_MEMORY_OPERATION_KEY)
      }
    }
    return final
  }, [])

  return { ...guard, pending: operation === FREE_MEMORY_OPERATION_KEY, feedback, run }
}
