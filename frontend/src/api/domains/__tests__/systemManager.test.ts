import { afterEach, describe, expect, it, vi } from 'vitest'
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
