import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { systemManagerApi } from '../../api/domains/systemManager'
import { useManagerStatus } from '../useManagerStatus'

const status = {
  fe: { running: false, status: 'stopped' },
  be: { running: false, status: 'stopped' },
  comfy: { running: true, status: 'running' },
  action_in_progress: null,
}

function response(body: unknown, statusCode = 200): Response {
  return { ok: statusCode >= 200 && statusCode < 300, status: statusCode, json: async () => body } as Response
}

describe('systemManagerApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the current page host on port 8899 and returns status independently of backend readiness', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(status))
    vi.stubGlobal('fetch', fetchMock)

    await expect(systemManagerApi.status()).resolves.toEqual(status)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8899/api/status', expect.objectContaining({ signal: expect.anything() }))
  })

  it('posts manager actions and rejects HTTP or manager-level failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ status: 'ok', action: 'restart backend' }))
      .mockResolvedValueOnce(response({ status: 'timeout', action: 'start comfy', error: 'timed out' }))
      .mockResolvedValueOnce(response({ detail: 'unavailable' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(systemManagerApi.action('restart', 'backend')).resolves.toMatchObject({ status: 'ok' })
    await expect(systemManagerApi.action('start', 'comfy')).rejects.toThrow(/timeout/i)
    await expect(systemManagerApi.action('stop', 'backend')).rejects.toThrow(/503/)
    expect(fetchMock.mock.calls[0]).toMatchObject([
      'http://localhost:8899/api/action',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'restart', service: 'backend' }) }),
    ])
  })

  it('reads a selected manager log with the existing default tail', async () => {
    const logs = { service: 'backend', filename: 'backend.log', exists: true, lines: ['ready'], content: 'ready\n' }
    const fetchMock = vi.fn().mockResolvedValue(response(logs))
    vi.stubGlobal('fetch', fetchMock)

    await expect(systemManagerApi.logs('backend')).resolves.toEqual(logs)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8899/api/logs?service=backend&tail=200', expect.any(Object))
  })
})

describe('useManagerStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status)))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shares one polling timer and deduplicates requests across subscribers', async () => {
    const { result: first, unmount: unmountFirst } = renderHook(() => useManagerStatus())
    const { result: second, unmount: unmountSecond } = renderHook(() => useManagerStatus())
    const fetchMock = vi.mocked(fetch)

    await act(async () => { await first.current.refetch() })
    expect(first.current.available).toBe(true)
    expect(second.current.status?.be.running).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    unmountFirst()
    expect(vi.getTimerCount()).toBe(1)
    unmountSecond()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('marks manager unavailable on request failure without changing generation state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useManagerStatus())
    const lastValidStatus = result.current.status
    await act(async () => { await result.current.refetch() })
    expect(result.current.available).toBe(false)
    expect(result.current.status).toBe(lastValidStatus)
  })
})
