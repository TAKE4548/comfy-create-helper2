import { act, renderHook, waitFor } from '@testing-library/react'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettingsCommit } from '../useSettingsCommit'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useSettingsCommit resource sequencing', () => {
  afterEach(() => vi.useRealTimers())

  it('[REQ-381/AC-7] stages raw snapshots without saving until explicit commit', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => result.current.stage('llm_params_audit', 'raw:0.8'))
    expect(save).not.toHaveBeenCalled()
    expect(result.current.getState('llm_params_audit').phase).toBe('dirty')

    act(() => result.current.commit('llm_params_audit'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('llm_params_audit', 'raw:0.8')
    await waitFor(() => expect(result.current.getState('llm_params_audit').phase).toBe('saved'))
  })

  it('[REQ-381/AC-7] allows only one request per key and coalesces queued snapshots to the latest', async () => {
    const requests: Array<{ snapshot: string; deferred: ReturnType<typeof deferred<void>> }> = []
    const save = vi.fn((_key: string, snapshot: string) => {
      const request = deferred<void>()
      requests.push({ snapshot, deferred: request })
      return request.promise
    })
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('k', 'first')
      result.current.commit('k')
      result.current.stage('k', 'middle')
      result.current.commit('k')
      result.current.stage('k', 'latest')
      result.current.commit('k')
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(requests.map(({ snapshot }) => snapshot)).toEqual(['first'])

    await act(async () => requests[0].deferred.resolve())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(requests.map(({ snapshot }) => snapshot)).toEqual(['first', 'latest'])
    await act(async () => requests[1].deferred.resolve())
    await waitFor(() => expect(result.current.getState('k').phase).toBe('saved'))
  })

  it('[REQ-381/AC-7] suppresses an identical snapshot submitted while that snapshot is in flight', async () => {
    const request = deferred<void>()
    const save = vi.fn().mockReturnValue(request.promise)
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('k', 'same')
      result.current.commit('k')
      result.current.stage('k', 'same')
      result.current.commit('k')
    })
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => request.resolve())
    await waitFor(() => expect(result.current.getState('k').phase).toBe('saved'))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('[REQ-381/AC-7] keeps different resource keys independent', async () => {
    const requests = new Map<string, ReturnType<typeof deferred<void>>>()
    const save = vi.fn((key: string) => {
      const request = deferred<void>()
      requests.set(key, request)
      return request.promise
    })
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('a', 'A')
      result.current.stage('b', 'B')
      result.current.commit('a')
      result.current.commit('b')
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.getState('a').phase).toBe('saving')
    expect(result.current.getState('b').phase).toBe('saving')

    await act(async () => {
      requests.get('a')?.resolve()
      requests.get('b')?.resolve()
    })
    await waitFor(() => {
      expect(result.current.getState('a').phase).toBe('saved')
      expect(result.current.getState('b').phase).toBe('saved')
    })
  })

  it('[REQ-381/AC-7] rejects invalid null snapshots without sending', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('k', null)
      result.current.commit('k')
    })
    expect(result.current.getState('k').phase).toBe('invalid')
    expect(save).not.toHaveBeenCalled()
  })

  it('[REQ-381/AC-7] keeps a newer revision after the older in-flight request resolves', async () => {
    const requests: Array<{ snapshot: string; deferred: ReturnType<typeof deferred<void>> }> = []
    const save = vi.fn((_key: string, snapshot: string) => {
      const request = deferred<void>()
      requests.push({ snapshot, deferred: request })
      return request.promise
    })
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('k', 'old')
      result.current.commit('k')
      result.current.stage('k', 'new')
      result.current.commit('k')
    })
    await act(async () => requests[0].deferred.resolve())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(requests.map(({ snapshot }) => snapshot)).toEqual(['old', 'new'])
    expect(result.current.getState('k').revision).toBeGreaterThan(0)
    await act(async () => requests[1].deferred.resolve())
    await waitFor(() => expect(result.current.getState('k').phase).toBe('saved'))
  })

  it('[REQ-381/AC-7] stops after failure until explicit retry', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useSettingsCommit({ save }))

    act(() => {
      result.current.stage('k', 'snapshot')
      result.current.commit('k')
    })
    await waitFor(() => expect(result.current.getState('k')).toMatchObject({ phase: 'error', error: 'offline' }))
    expect(save).toHaveBeenCalledTimes(1)
    act(() => result.current.retry('k'))
    await waitFor(() => expect(result.current.getState('k').phase).toBe('saved'))
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('[REQ-381/AC-7] property: arbitrary committed snapshots never overlap per key and finish at the latest', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.string(), { minLength: 1, maxLength: 12 }),
      async (snapshots) => {
        const requests: Array<{ snapshot: string; deferred: ReturnType<typeof deferred<void>> }> = []
        let active = 0
        let maxActive = 0
        const save = vi.fn((_key: string, snapshot: string) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          const request = deferred<void>()
          requests.push({ snapshot, deferred: request })
          return request.promise.finally(() => { active -= 1 })
        })
        const { result, unmount } = renderHook(() => useSettingsCommit({ save }))

        act(() => {
          for (const snapshot of snapshots) {
            result.current.stage('k', snapshot)
            result.current.commit('k')
          }
        })
        expect(maxActive).toBe(1)
        expect(requests).toHaveLength(1)

        const expectedRequests = snapshots.length === 1 || snapshots.at(-1) === snapshots[0] ? 1 : 2
        for (let requestIndex = 0; requestIndex < expectedRequests; requestIndex += 1) {
          if (requestIndex > 0) await waitFor(() => expect(requests.length).toBeGreaterThan(requestIndex))
          await act(async () => requests[requestIndex].deferred.resolve())
        }

        await waitFor(() => expect(result.current.getState('k').phase).toBe('saved'))
        expect(maxActive).toBe(1)
        expect(requests.at(-1)?.snapshot).toBe(snapshots.at(-1))
        unmount()
      },
    ), { numRuns: 8 })
  })

  it('[REQ-381/AC-7] ignores queued completions after unmount without starting another save or timer', async () => {
    const requests: Array<ReturnType<typeof deferred<void>>> = []
    const save = vi.fn(() => {
      const request = deferred<void>()
      requests.push(request)
      return request.promise
    })
    const { result, unmount } = renderHook(() => useSettingsCommit({ save }))
    act(() => {
      result.current.stage('k', 'first')
      result.current.commit('k')
      result.current.stage('k', 'queued')
      result.current.commit('k')
    })
    expect(save).toHaveBeenCalledTimes(1)

    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const callsBeforeResolve = timeout.mock.calls.length
    unmount()
    await act(async () => requests[0].resolve())
    await Promise.resolve()

    expect(save).toHaveBeenCalledTimes(1)
    expect(timeout.mock.calls.length).toBe(callsBeforeResolve)
    timeout.mockRestore()
  })
})
