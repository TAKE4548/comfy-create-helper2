import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { systemManagerApi, ManagerActionOutcomeUnknownError } from '../systemManager'

const jsonResponse = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
} as Response)

const logsPayload = (service: string, lines: number | string[], content: string) => ({
  service, filename: `${service}.log`, exists: true, lines, content,
})

afterEach(() => vi.unstubAllGlobals())

describe('systemManagerApi', () => {
  it('[REQ-380/AC-1] posts the fixed free-memory Manager request and accepts only explicit acknowledgement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', action: 'free-memory', outcome: 'accepted' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(systemManagerApi.freeMemory()).resolves.toMatchObject({ outcome: 'accepted' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain(':8899/api/action')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'free-memory', service: 'comfy' })
  })

  it('[REQ-380/AC-1] classifies a validated unsent denial and an unconfirmed gateway response separately', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'error', action: 'free-memory', request_sent: false, code: 'ACTION_BUSY', error: 'busy' }, 409))
      .mockResolvedValueOnce(jsonResponse({ status: 'error', action: 'free-memory', request_sent: 'false', code: 'ACTION_BUSY', error: 'busy' }, 503)))
    await expect(systemManagerApi.freeMemory()).rejects.toThrow('busy')
    await expect(systemManagerApi.freeMemory()).rejects.toBeInstanceOf(ManagerActionOutcomeUnknownError)
  })

  it('[REQ-380/AC-1] keeps invalid Comfy execution metadata fail-closed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      fe: { running: true, status: 'running' }, be: { running: true, status: 'running' },
      comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: -1, queue_pending: 0 },
    })))
    const status = await systemManagerApi.status()
    expect(status.comfy.execution_state).toBe('unknown')
  })

  it('[REQ-380/AC-1] PBT: invalid queue counts never preserve an idle execution state', async () => {
    await fc.assert(fc.asyncProperty(fc.integer({ max: -1 }), async (invalidCount) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
        fe: { running: true, status: 'running' }, be: { running: true, status: 'running' },
        comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: invalidCount, queue_pending: 0 },
      })))
      const status = await systemManagerApi.status()
      expect(status.comfy.execution_state).toBe('unknown')
    }), { numRuns: 40 })
  })
  it.each(['backend', 'frontend', 'comfy', 'manager'] as const)('decodes numeric log line count for %s', async (service) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(logsPayload(service, 12, 'line one\nline two'))))
    await expect(systemManagerApi.logs(service)).resolves.toEqual({
      service, filename: `${service}.log`, exists: true, lines: ['line one', 'line two'], content: 'line one\nline two',
    })
  })

  it('keeps legacy array log payloads compatible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(logsPayload('backend', ['legacy'], 'first\nsecond\n'))))
    await expect(systemManagerApi.logs('backend')).resolves.toEqual({
      service: 'backend', filename: 'backend.log', exists: true, lines: ['legacy'], content: 'first\nsecond\n',
    })
  })

  it('accepts an empty numeric log and rejects malformed log fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(logsPayload('manager', 0, '')))
      .mockResolvedValueOnce(jsonResponse(logsPayload('manager', '0', ''))))
    await expect(systemManagerApi.logs('manager')).resolves.toMatchObject({ lines: [], content: '' })
    await expect(systemManagerApi.logs('manager')).rejects.toThrow('Invalid manager logs response')
  })

  it('uses a 7 second timeout for status/logs and 120 seconds for actions', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      return Object.assign(new AbortController().signal, { timeoutMs: ms }) as AbortSignal
    })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ fe: { running: true, status: 'running' }, be: { running: true, status: 'running' }, comfy: { running: true, status: 'running' } }))
      .mockResolvedValueOnce(jsonResponse(logsPayload('backend', 0, '')))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', action: 'restart' })))
    await systemManagerApi.status()
    await systemManagerApi.logs('backend')
    await systemManagerApi.action('restart', 'backend')
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([7000, 7000, 120000])
  })

  it.each([
    ['504', () => jsonResponse({ error: 'gateway timeout' }, 504)],
    ['503', () => jsonResponse({ error: 'unavailable' }, 503)],
    ['network failure', () => Promise.reject(new TypeError('fetch failed'))],
    ['timeout', () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))],
  ])('marks action %s as unconfirmed without retrying', async (_case, response) => {
    const fetchMock = vi.fn().mockImplementation(response)
    vi.stubGlobal('fetch', fetchMock)
    await expect(systemManagerApi.action('restart', 'backend')).rejects.toBeInstanceOf(ManagerActionOutcomeUnknownError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('preserves confirmed action failures and successful results', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'manager failed' }, 502))
      .mockResolvedValueOnce(jsonResponse({ status: 'error', action: 'restart', error: 'exit code 1' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', action: 'restart', output: 'done' })))
    await expect(systemManagerApi.action('restart', 'backend')).rejects.toThrow('HTTP 502')
    await expect(systemManagerApi.action('restart', 'backend')).rejects.toThrow('Manager action error: exit code 1')
    await expect(systemManagerApi.action('restart', 'backend')).resolves.toMatchObject({ status: 'ok', output: 'done' })
  })

  it('treats an explicit manager timeout result as unconfirmed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'timeout', action: 'restart' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(systemManagerApi.action('restart', 'backend')).rejects.toBeInstanceOf(ManagerActionOutcomeUnknownError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
