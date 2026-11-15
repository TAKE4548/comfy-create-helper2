import { act, renderHook, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerStatus } from '../../api/domains/systemManager'
import {
  FREE_MEMORY_MESSAGES,
  FREE_MEMORY_OPERATION_KEY,
  deriveFreeMemoryGuard,
  endManagerOperation,
  resetManagerOperationStoreForTests,
  tryBeginManagerOperation,
  useComfyFreeMemory,
} from '../useComfyFreeMemory'

const idlePayload = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: 0, queue_pending: 0 },
  action_in_progress: null,
}
const idleStatus = idlePayload as unknown as ManagerStatus
const acceptedBody = { status: 'ok', action: 'free-memory', outcome: 'accepted' }

function response(body: unknown, statusCode = 200): Response {
  return { ok: statusCode >= 200 && statusCode < 300, status: statusCode, json: async () => body } as Response
}

function stubFetch(onPost: () => Promise<Response>, onGet?: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'POST' ? onPost() : (onGet ? onGet() : Promise.resolve(response(idlePayload))))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const postCount = (fetchMock: ReturnType<typeof vi.fn>): number =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').length

beforeEach(() => {
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
})

afterEach(() => {
  resetManagerOperationStoreForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderEnabled() {
  const rendered = renderHook(() => useComfyFreeMemory())
  await waitFor(() => expect(rendered.result.current.enabled).toBe(true))
  return rendered
}

describe('deriveFreeMemoryGuard', () => {
  const comfyArb = fc.record({
    running: fc.boolean(),
    status: fc.constantFrom('LISTEN', 'stopped', 'running', 'unknown'),
    execution_state: fc.constantFrom('idle', 'executing', 'queued', 'unknown', undefined),
    queue_running: fc.constantFrom(0, 1, 2, null, undefined),
    queue_pending: fc.constantFrom(0, 1, 2, null, undefined),
  })
  const statusArb = fc.record({
    comfy: comfyArb,
    action_in_progress: fc.constantFrom(null, undefined, { service: 'backend', action: 'restart' }),
  })

  it('[REQ-412/AC-5] guard property: enabled only for a known idle LISTEN Comfy with no queue and no other operation', () => {
    fc.assert(fc.property(
      fc.option(statusArb, { nil: null }), fc.boolean(), fc.constantFrom(null, 'backend:restart', FREE_MEMORY_OPERATION_KEY),
      (status, available, localOperation) => {
        const guard = deriveFreeMemoryGuard({ status: status as unknown as ManagerStatus | null, available, localOperation })
        const expected = status !== null && available && localOperation === null &&
          (status.action_in_progress === null || status.action_in_progress === undefined) &&
          status.comfy.status === 'LISTEN' && status.comfy.execution_state === 'idle' &&
          status.comfy.queue_running === 0 && status.comfy.queue_pending === 0
        expect(guard.enabled).toBe(expected)
        expect(guard.reason === '').toBe(expected)
      },
    ), { numRuns: 300 })
  })

  it('[REQ-412/AC-5] guard reasons follow the existing priority order', () => {
    const comfy = (extra: Record<string, unknown>) => ({ ...idlePayload, comfy: { ...idlePayload.comfy, ...extra } }) as unknown as ManagerStatus
    const reason = (status: ManagerStatus | null, available = true, localOperation: string | null = null) =>
      deriveFreeMemoryGuard({ status, available, localOperation }).reason
    expect(reason(null)).toBe('Manager状態を確認できません。')
    expect(reason(idleStatus, false)).toBe('Manager状態を確認できません。')
    expect(reason(comfy({ status: 'stopped' }), true, 'x')).toBe('別のサービス操作中です。')
    expect(reason({ ...idleStatus, action_in_progress: { service: 'backend', action: 'restart' } })).toBe('別のサービス操作中です。')
    expect(reason(comfy({ status: 'stopped', execution_state: 'executing' }))).toBe('ComfyUIが停止中または状態不明です。')
    expect(reason(comfy({ execution_state: 'executing' }))).toBe('ComfyUIで生成中です。')
    expect(reason(comfy({ execution_state: 'queued' }))).toBe('ComfyUIのキューが空ではありません。')
    expect(reason(comfy({ queue_pending: 2 }))).toBe('ComfyUIのキューが空ではありません。')
    expect(reason(comfy({ execution_state: 'unknown' }))).toBe('ComfyUIの実行状態が不明です。')
    expect(reason(idleStatus)).toBe('')
  })
})

describe('useComfyFreeMemory', () => {
  it('[REQ-412/AC-3] run sends one request while the shared lock is held and ignores re-entry', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(response(acceptedBody)))
    const { result } = await renderEnabled()

    let first!: Promise<unknown>
    let second!: Promise<unknown>
    await act(async () => { first = result.current.run(); second = result.current.run(); await Promise.all([first, second]) })
    expect(await second).toBeNull()
    expect(await first).toEqual({ kind: 'accepted', message: FREE_MEMORY_MESSAGES.accepted })
    expect(postCount(fetchMock)).toBe(1)

    act(() => { expect(tryBeginManagerOperation('backend:restart')).toBe(true) })
    expect(tryBeginManagerOperation(FREE_MEMORY_OPERATION_KEY)).toBe(false)
    await act(async () => { expect(await result.current.run()).toBeNull() })
    expect(postCount(fetchMock)).toBe(1)
    act(() => { endManagerOperation(FREE_MEMORY_OPERATION_KEY) })
    expect(tryBeginManagerOperation(FREE_MEMORY_OPERATION_KEY)).toBe(false)
    act(() => { endManagerOperation('backend:restart') })
    act(() => { expect(tryBeginManagerOperation(FREE_MEMORY_OPERATION_KEY)).toBe(true) })
  })

  it('[REQ-412/AC-4] accepted response sets the acceptance message without completion wording', async () => {
    stubFetch(() => Promise.resolve(response(acceptedBody)))
    const onAccepted = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useComfyFreeMemory({ onAccepted }))
    await waitFor(() => expect(result.current.enabled).toBe(true))
    await act(async () => { await result.current.run() })
    expect(result.current.feedback.kind).toBe('accepted')
    expect(result.current.feedback.message).toBe('解放要求を受け付けました。空き容量は監視値で確認してください')
    expect(result.current.feedback.message).not.toMatch(/完了|解放しました|解放済み/)
    expect(onAccepted).toHaveBeenCalledTimes(1)
  })

  const unknownBody = {}
  const rejected = { status: 'error', action: 'free-memory', request_sent: false, code: 'busy', error: 'ComfyUI busy' }
  it.each([
    ['HTTP 504', () => Promise.resolve(response(unknownBody, 504)), 'unconfirmed', undefined],
    ['TimeoutError', () => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })), 'unconfirmed', undefined],
    ['TypeError', () => Promise.reject(new TypeError('Failed to fetch')), 'unconfirmed', undefined],
    ['invalid JSON', () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } } as Response), 'unconfirmed', undefined],
    ['HTTP 409 request_sent false', () => Promise.resolve(response(rejected, 409)), 'failed', 'ComfyUI busy'],
    ['HTTP 503 request_sent false', () => Promise.resolve(response(rejected, 503)), 'failed', 'ComfyUI busy'],
    ['200 without outcome', () => Promise.resolve(response({ status: 'ok', action: 'free-memory' })), 'failed', 'Invalid free-memory acceptance response'],
  ] as const)('[REQ-412/AC-6] fault injection maps transport failures to unconfirmed or failed: %s', async (_label, onPost, kind, detail) => {
    const fetchMock = stubFetch(onPost)
    const { result } = await renderEnabled()
    let outcome: Awaited<ReturnType<typeof result.current.run>> = null
    await act(async () => { outcome = await result.current.run() })
    expect(outcome).not.toBeNull()
    expect(outcome!.kind).toBe(kind)
    if (kind === 'unconfirmed') expect(outcome!.message).toBe(FREE_MEMORY_MESSAGES.unconfirmed)
    else expect(outcome!.message).toBe(`${FREE_MEMORY_MESSAGES.failedPrefix}${detail}`)
    expect(postCount(fetchMock)).toBe(1)
  })

  it('[REQ-412/AC-3] keeps the lock until two fresh status GETs complete (real useManagerStatus)', async () => {
    const gets: Array<(r: Response) => void> = []
    let gated = false
    const fetchMock = stubFetch(
      () => Promise.resolve(response(acceptedBody)),
      () => (gated ? new Promise<Response>((resolve) => { gets.push(resolve) }) : Promise.resolve(response(idlePayload))),
    )
    const { result } = await renderEnabled()
    gated = true
    let done!: Promise<unknown>
    act(() => { done = result.current.run() })
    await waitFor(() => expect(gets).toHaveLength(1))
    expect(result.current.pending).toBe(true)
    expect(result.current.enabled).toBe(false)

    await act(async () => { gets[0](response(idlePayload)) })
    await waitFor(() => expect(gets).toHaveLength(2))
    expect(result.current.pending).toBe(true)

    await act(async () => { gets[1](response(idlePayload)); await done })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(postCount(fetchMock)).toBe(1)
    gated = false
    await waitFor(() => expect(result.current.enabled).toBe(true))
  })
})
