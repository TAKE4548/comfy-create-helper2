import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  state: {
    progress: null as { value: number; max: number; percentage: number } | null,
    previewImage: null as string | null,
    isConnected: false,
    isGenerating: false,
    currentPromptId: null as string | null,
    queuePrompt: vi.fn(),
    cancelGeneration: vi.fn(),
    clearPreview: vi.fn()
  }
}))

vi.mock('../../store/useGenerationStore', () => ({
  useGenerationStore: (selector: (state: typeof store.state) => unknown) => selector(store.state)
}))

import { resolveComfyUrl, useComfyWebSocket } from '../useComfyWebSocket'

describe('useComfyWebSocket store adapter', () => {
  beforeEach(() => {
    store.state.progress = { value: 3, max: 8, percentage: 38 }
    store.state.previewImage = '/api/comfy/preview?t=prompt-current'
    store.state.isConnected = true
    store.state.isGenerating = true
    store.state.currentPromptId = 'prompt-current'
    store.state.queuePrompt = vi.fn().mockResolvedValue('prompt-queued')
    store.state.cancelGeneration = vi.fn().mockResolvedValue(undefined)
    store.state.clearPreview = vi.fn()
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('WebSocket', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('projects the existing generation store state without creating a connection or fetch path', () => {
    const { result } = renderHook(() => useComfyWebSocket('legacy-client-id'))
    expect(result.current).toMatchObject({
      progress: { value: 3, max: 8, percentage: 38 },
      previewImage: '/api/comfy/preview?t=prompt-current',
      isConnected: true,
      isGenerating: true,
      currentPromptId: 'prompt-current'
    })
    expect(WebSocket).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('delegates generation actions and keeps the public cancellation signature void', async () => {
    const queuePromise = Promise.resolve('prompt-queued')
    store.state.queuePrompt = vi.fn().mockReturnValue(queuePromise)
    store.state.cancelGeneration = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useComfyWebSocket())

    let queued: string | null = null
    await act(async () => {
      queued = await result.current.queuePrompt({ nodes: { 1: { class_type: 'KSampler' } } })
    })
    expect(queued).toBe('prompt-queued')
    expect(store.state.queuePrompt).toHaveBeenCalledOnce()
    expect(store.state.queuePrompt).toHaveBeenCalledWith({ nodes: { 1: { class_type: 'KSampler' } } })

    let cancelled: void | Promise<void>
    act(() => {
      cancelled = result.current.cancelGeneration()
    })
    expect(cancelled).toBeUndefined()
    expect(store.state.cancelGeneration).toHaveBeenCalledOnce()

    act(() => result.current.clearPreview())
    expect(store.state.clearPreview).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resolveComfyUrl', () => {
  const originalLocation = window.location

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it.each([
    ['http://localhost:5173', 'http://localhost:5173/api/comfy'],
    ['http://localhost:8000', 'http://localhost:8000/api/comfy'],
    ['http://192.168.1.50:8000', 'http://192.168.1.50:8000/api/comfy']
  ])('uses the same-origin API route at %s regardless of configured Comfy URL', (origin, expected) => {
    Object.defineProperty(window, 'location', {
      value: { origin, hostname: new URL(origin).hostname, port: new URL(origin).port },
      writable: true
    })
    expect(resolveComfyUrl('http://127.0.0.1:8188')).toBe(expected)
    expect(resolveComfyUrl(null)).toBe(expected)
    expect(resolveComfyUrl('http://remote-comfy:8188')).toBe(expected)
    expect(resolveComfyUrl(null)).not.toContain('8188')
  })
})
