import { afterEach, describe, expect, it, vi } from 'vitest'
import { sceneSpeechApi } from '../client'
import type { SceneDraftRequest, SceneDraftResponse } from '../types'

const payload: SceneDraftRequest = { snapshot_id: 12 }
const result: SceneDraftResponse = {
  scene_interpretation: '静かな部屋',
  bubbles: [],
  vram_unloaded: true,
  tone_samples: [],
  candidate_similar_scenes: [],
}

function streamResponse(chunks: Array<string | Uint8Array>, status = 200): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
  return new Response(body, { status })
}

afterEach(() => vi.unstubAllGlobals())

describe('sceneSpeechApi.generateStream', () => {
  it('parses split UTF-8 NDJSON chunks, multiple lines, and a final line without newline', async () => {
    const progress = vi.fn()
    const text = [
      JSON.stringify({ type: 'progress', step: 'reference', status: 'active' }),
      JSON.stringify({ type: 'result', data: result }),
    ].join('\n')
    const bytes = new TextEncoder().encode(text)
    const splitAt = bytes.findIndex(byte => byte >= 0xe0) + 1
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      bytes.slice(0, splitAt),
      bytes.slice(splitAt),
    ])))

    await expect(sceneSpeechApi.generateStream(payload, { onProgress: progress })).resolves.toEqual(result)
    expect(progress).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenCalledWith({ type: 'progress', step: 'reference', status: 'active' })
    expect(fetch).toHaveBeenCalledWith('/api/speech/scene-draft/stream', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }))
  })

  it('rejects HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 422 })))
    await expect(sceneSpeechApi.generateStream(payload)).rejects.toThrow(/422/)
  })

  it('rejects stream error events including error kinds emitted by T13', async () => {
    for (const error_kind of ['invalid_request', 'vram_unload_failed']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
        `${JSON.stringify({ type: 'error', error_kind, message: 'failed' })}\n`,
      ])))
      await expect(sceneSpeechApi.generateStream(payload)).rejects.toMatchObject({
        name: 'SceneSpeechStreamError',
        kind: error_kind,
        message: 'failed',
      })
    }
  })

  it('rejects malformed, unknown, duplicate-result, and result-less streams', async () => {
    const invalidStreams = [
      ['{bad json}\n'],
      ['{"type":"unexpected"}\n'],
      [`${JSON.stringify({ type: 'result', data: result })}\n${JSON.stringify({ type: 'result', data: result })}\n`],
      [`${JSON.stringify({ type: 'progress', step: 'reference', status: 'active' })}\n`],
    ]
    for (const chunks of invalidStreams) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))
      await expect(sceneSpeechApi.generateStream(payload)).rejects.toThrow()
    }
  })

  it('passes the AbortSignal to fetch and cancels the reader on abort', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      cancel,
      pull() {},
    })
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      return Promise.resolve(new Response(body))
    })
    vi.stubGlobal('fetch', fetchMock)
    const pending = sceneSpeechApi.generateStream(payload, { signal: controller.signal })
    await Promise.resolve()
    controller.abort()

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
