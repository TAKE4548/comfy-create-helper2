import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BASE_URL, request } from '../base'
import { SceneSpeechStreamError, abortError, parseSceneSpeechEvent } from '../stream'

describe('core/base.ts', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('has default BASE_URL as /api', () => {
    expect(BASE_URL).toBe('/api')
  })

  it('handles 200 JSON response successfully', async () => {
    const mockData = { id: 1, name: 'test' }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(mockData)),
    } as unknown as Response)

    const res = await request<{ id: number; name: string }>('/items')
    expect(res).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/items', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('handles 204 No Content response returning undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    } as unknown as Response)

    const res = await request<void>('/empty')
    expect(res).toBeUndefined()
  })

  it('handles empty text response returning undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('   '),
    } as unknown as Response)

    const res = await request<unknown>('/empty-body')
    expect(res).toBeUndefined()
  })

  it('does not set Content-Type header when body is FormData', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('{}'),
    } as unknown as Response)

    const formData = new FormData()
    formData.append('key', 'val')
    await request('/upload', { method: 'POST', body: formData })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/upload', expect.objectContaining({
      headers: {},
      body: formData,
    }))
  })

  it('throws on non-ok status response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Server Failure'),
    } as unknown as Response)

    await expect(request('/fail')).rejects.toThrow('API error 500: Server Failure')
  })
})

describe('core/stream.ts', () => {
  it('instantiates SceneSpeechStreamError correctly', () => {
    const err = new SceneSpeechStreamError('timeout', 'Request timed out')
    expect(err.name).toBe('SceneSpeechStreamError')
    expect(err.kind).toBe('timeout')
    expect(err.message).toBe('Request timed out')
    expect(err instanceof Error).toBe(true)
  })

  it('returns reason or DOMException for abortError', () => {
    const controller = new AbortController()
    const customErr = new Error('Custom abort')
    controller.abort(customErr)
    expect(abortError(controller.signal)).toBe(customErr)

    const controller2 = new AbortController()
    controller2.abort()
    const err2 = abortError(controller2.signal)
    expect(err2.name).toBe('AbortError')
    expect(err2.message).toBe('The operation was aborted')
  })

  it('parses valid progress event', () => {
    const payload = JSON.stringify({ type: 'progress', step: 'reference', status: 'active' })
    const event = parseSceneSpeechEvent(payload)
    expect(event).toEqual({ type: 'progress', step: 'reference', status: 'active' })
  })

  it('parses valid result event', () => {
    const payload = JSON.stringify({ type: 'result', data: { key: 'val' } })
    const event = parseSceneSpeechEvent(payload)
    expect(event).toEqual({ type: 'result', data: { key: 'val' } })
  })

  it('parses valid error event', () => {
    const payload = JSON.stringify({ type: 'error', error_kind: 'lm_studio_400', message: 'bad request' })
    const event = parseSceneSpeechEvent(payload)
    expect(event).toEqual({ type: 'error', error_kind: 'lm_studio_400', message: 'bad request' })
  })

  it('throws error for invalid JSON or structure in parseSceneSpeechEvent', () => {
    expect(() => parseSceneSpeechEvent('invalid json')).toThrow('Invalid scene speech stream JSON line')
    expect(() => parseSceneSpeechEvent('null')).toThrow('Invalid scene speech stream event')
    expect(() => parseSceneSpeechEvent('[]')).toThrow('Invalid scene speech stream event')
    expect(() => parseSceneSpeechEvent(JSON.stringify({ type: 'progress', step: 'invalid_step', status: 'active' })))
      .toThrow('Invalid scene speech progress event')
    expect(() => parseSceneSpeechEvent(JSON.stringify({ type: 'result', data: null })))
      .toThrow('Invalid scene speech result event')
    expect(() => parseSceneSpeechEvent(JSON.stringify({ type: 'error', error_kind: 'invalid_kind', message: 'fail' })))
      .toThrow('Invalid scene speech error event')
    expect(() => parseSceneSpeechEvent(JSON.stringify({ type: 'unknown_type' })))
      .toThrow('Unknown scene speech stream event type')
  })
})
