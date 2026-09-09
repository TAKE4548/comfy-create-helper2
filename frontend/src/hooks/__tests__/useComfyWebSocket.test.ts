/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias */
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useComfyWebSocket } from '../useComfyWebSocket'
import { configApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  configApi: {
    get: vi.fn(),
  },
}))

describe('useComfyWebSocket', () => {
  let queryClient: QueryClient
  const originalWebSocket = globalThis.WebSocket
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = globalThis.URL.createObjectURL
  let mockWebSocketInstance: any = null

  class MockWebSocket {
    binaryType: string = ''
    url: string
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onmessage: ((event: { data: any }) => void) | null = null
    close = vi.fn()

    constructor(url: string) {
      this.url = url
      mockWebSocketInstance = this
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    mockWebSocketInstance = null
    const mockGet = configApi.get as any
    mockGet.mockResolvedValue({ comfy_url: 'http://localhost:8188' })
    
    // Set up default mocks
    vi.stubGlobal('WebSocket', MockWebSocket)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as any
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:8188/mock-uuid')
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreateObjectURL
  })

  it('should handle WebSocket constructor exception gracefully (Red Teaming Scenario)', async () => {
    const mockGet = configApi.get as any
    mockGet.mockResolvedValue({ comfy_url: 'http://localhost:8188' })

    // WebSocket のコンストラクタが例外をスローするようにグローバル WebSocket をモック
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
      throw new Error('SecurityError: WebSocket connection failed')
    }))

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useComfyWebSocket('test-client-id'), { wrapper })

    // URL取得を待つ
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
    })

    // isConnected が false になり、エラーがログ出力されることを確認
    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to establish WebSocket connection in useComfyWebSocket:',
        expect.any(Error)
      )
    })

    consoleErrorSpy.mockRestore()
  })

  it('should toggle isConnected state on open, close, and error events', async () => {
    const { result } = renderHook(() => useComfyWebSocket('test-client-id'), { wrapper })

    // Wait for websocket instance creation
    await waitFor(() => {
      expect(mockWebSocketInstance).not.toBeNull()
    })

    // Trigger open
    act(() => {
      mockWebSocketInstance.onopen()
    })
    expect(result.current.isConnected).toBe(true)

    // Trigger close
    act(() => {
      mockWebSocketInstance.onclose()
    })
    expect(result.current.isConnected).toBe(false)

    // Trigger open again
    act(() => {
      mockWebSocketInstance.onopen()
    })
    expect(result.current.isConnected).toBe(true)

    // Trigger error
    act(() => {
      mockWebSocketInstance.onerror()
    })
    expect(result.current.isConnected).toBe(false)
  })

  it('should handle progress, execution_start, executed, execution_complete, and execution_error events', async () => {
    const { result } = renderHook(() => useComfyWebSocket('test-client-id'), { wrapper })

    await waitFor(() => {
      expect(mockWebSocketInstance).not.toBeNull()
    })

    // 1. progress event
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: 'progress',
          data: { value: 3, max: 10 },
        }),
      })
    })
    expect(result.current.isGenerating).toBe(true)
    expect(result.current.progress).toEqual({ value: 3, max: 10, percentage: 30 })

    // 2. execution_start event
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: 'execution_start',
          data: { prompt_id: 'test-prompt-123' },
        }),
      })
    })
    expect(result.current.isGenerating).toBe(true)
    expect(result.current.progress).toBeNull()
    expect(result.current.currentPromptId).toBe('test-prompt-123')

    // 3. executed event (with images)
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: 'executed',
          data: {
            output: {
              images: [{ filename: 'out.png', subfolder: 'sub', type: 'output' }],
            },
          },
        }),
      })
    })
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.progress).toEqual({ value: 1, max: 1, percentage: 100 })
    expect(result.current.previewImage).toContain('filename=out.png')

    // 4. execution_complete event
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: 'execution_complete',
          data: {},
        }),
      })
    })
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.progress).toEqual({ value: 1, max: 1, percentage: 100 })

    // 5. execution_error event
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => {
      mockWebSocketInstance.onmessage({
        data: JSON.stringify({
          type: 'execution_error',
          data: { exception_type: 'ValueError' },
        }),
      })
    })
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.progress).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should handle Blob and ArrayBuffer message data to set previewImage', async () => {
    const { result } = renderHook(() => useComfyWebSocket('test-client-id'), { wrapper })

    await waitFor(() => {
      expect(mockWebSocketInstance).not.toBeNull()
    })

    // Test Blob data
    const blob = new Blob(['dummy-binary-data'], { type: 'image/png' })
    act(() => {
      mockWebSocketInstance.onmessage({ data: blob })
    })
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(result.current.previewImage).toBe('blob:http://localhost:8188/mock-uuid')

    // Test ArrayBuffer data
    const arrayBuffer = new ArrayBuffer(8)
    act(() => {
      mockWebSocketInstance.onmessage({ data: arrayBuffer })
    })
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled()
    expect(result.current.previewImage).toBe('blob:http://localhost:8188/mock-uuid')
  })

  it('should call fetch with correct arguments on queuePrompt and cancelGeneration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt_id: 'prompt-xyz' }),
    })
    globalThis.fetch = mockFetch

    const { result } = renderHook(() => useComfyWebSocket('test-client-id'), { wrapper })

    // Test queuePrompt
    let promptId: string | null = null
    await act(async () => {
      promptId = await result.current.queuePrompt({ nodes: {} })
    })
    expect(promptId).toBe('prompt-xyz')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/comfy/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { nodes: {} },
        client_id: 'test-client-id',
      }),
    })

    // Test cancelGeneration
    await act(async () => {
      await result.current.cancelGeneration()
    })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/comfy/interrupt', {
      method: 'POST',
    })
  })
})
