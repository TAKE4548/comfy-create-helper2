import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useComfyWebSocket } from '../useComfyWebSocket'
import { configApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  configApi: {
    get: vi.fn(),
  },
}))

describe('useComfyWebSocket', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket
  })

  it('should handle WebSocket constructor exception gracefully (Red Teaming Scenario)', async () => {
    // configApi.get をモック化して適切な戻り値を設定
    const mockGet = configApi.get as any
    mockGet.mockResolvedValue({ comfy_url: 'http://localhost:8188' })

    // WebSocket のコンストラクタが例外をスローするようにグローバル WebSocket をモック
    (globalThis as any).WebSocket = vi.fn().mockImplementation(() => {
      throw new Error('SecurityError: WebSocket connection failed')
    }) as any

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useComfyWebSocket('test-client-id'))

    // URL取得を待つ
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
    })

    // isConnected が false になり、エラーがログ出力されることを確認
    expect(result.current.isConnected).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to establish WebSocket connection in useComfyWebSocket:',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })
})
