import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { useGenerateDisplayState } from '../hooks/useGenerateDisplayState'
import { LS_KEYS } from '../../../utils/localStorageKeys'

vi.mock('../../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

describe('REQ-264: Preview Auto-Follow and Lock Toggle E2E Integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    useGenerationStore.setState({
      clientId: 'session-client-1',
      batchImages: ['img-1.png'],
      selectedImg: 'img-1.png',
      comfyHistoryImages: ['img-1.png'],
      filterOwnSession: false,
      previewAutoFollow: true,
      previewImage: null,
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  it('AC-1 & AC-6: toggles previewAutoFollow state, updates store and persists to localStorage', () => {
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    // 初期状態: 自動追従 ON (デフォルト true)
    expect(result.current.previewAutoFollow).toBe(true)

    // トグル実行 -> OFF
    act(() => {
      result.current.handleToggleAutoFollow()
    })
    expect(result.current.previewAutoFollow).toBe(false)
    expect(useGenerationStore.getState().previewAutoFollow).toBe(false)
    expect(localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)).toBe('false')

    // トグル再実行 -> ON
    act(() => {
      result.current.handleToggleAutoFollow()
    })
    expect(result.current.previewAutoFollow).toBe(true)
    expect(useGenerationStore.getState().previewAutoFollow).toBe(true)
    expect(localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)).toBe('true')
  })

  it('AC-2: auto-follows latest image when new generation finishes in auto-follow mode (modal & store)', async () => {
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    // モーダルを開く (初期画像 img-1.png, index 0)
    act(() => {
      result.current.handleOpenModalPreview()
    })
    expect(result.current.isModalPreviewOpen).toBe(true)
    expect(result.current.modalPreviewIndex).toBe(0)

    // 新規生成完了 (isOwn: true)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('comfy-job-event', {
          detail: {
            type: 'executed',
            images: ['img-2-new.png'],
            isOwn: true,
          },
        })
      )
    })

    // 自動追従により、モーダルが先頭(最新画像)に更新され、index 0を維持
    await waitFor(() => {
      expect(result.current.sortedDisplayImages[0]).toBe('img-2-new.png')
      expect(result.current.modalPreviewIndex).toBe(0)
    })
  })

  it('AC-3: preserves current viewed image when new generation finishes in locked mode (zero-flicker lock)', async () => {
    useGenerationStore.setState({
      previewAutoFollow: false,
      batchImages: ['img-pinned.png'],
      selectedImg: 'img-pinned.png',
      comfyHistoryImages: ['img-pinned.png'],
    })
    localStorage.setItem(LS_KEYS.PREVIEW_AUTO_FOLLOW, 'false')

    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    // モーダルを開く (img-pinned.png)
    act(() => {
      result.current.handleOpenModalPreview()
    })
    expect(result.current.modalPreviewIndex).toBe(0)

    // 新規画像が生成完了
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('comfy-job-event', {
          detail: {
            type: 'executed',
            images: ['img-newer.png'],
            isOwn: true,
          },
        })
      )
    })

    // 固定モードにより、閲覧中画像 img-pinned.png の位置に合わせて index が 1 に補正され、表示画像が保持される
    await waitFor(() => {
      expect(result.current.sortedDisplayImages).toEqual(['img-newer.png', 'img-pinned.png'])
      expect(result.current.modalPreviewIndex).toBe(1)
      expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img-pinned.png')
    })
  })

  it('RedTeam-1: toggling from locked to auto-follow immediately jumps to the newest image', async () => {
    useGenerationStore.setState({
      previewAutoFollow: false,
      batchImages: ['img-newer.png', 'img-older.png'],
      selectedImg: 'img-older.png',
      comfyHistoryImages: ['img-newer.png', 'img-older.png'],
    })

    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    act(() => {
      result.current.handleOpenModalPreview()
    })
    // 閲覧対象を古い画像 (index 1) に設定
    act(() => {
      result.current.setModalPreviewIndex(1)
    })
    expect(result.current.modalPreviewIndex).toBe(1)

    // トグルを ON に切替
    act(() => {
      result.current.handleToggleAutoFollow()
    })

    // 即座に最新画像 (index 0: img-newer.png) へジャンプ
    expect(result.current.previewAutoFollow).toBe(true)
    expect(result.current.modalPreviewIndex).toBe(0)
    expect(useGenerationStore.getState().selectedImg).toBe('img-newer.png')
  })

  it('RedTeam-2: protects viewing context when other session completes generation', async () => {
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    act(() => {
      result.current.handleOpenModalPreview()
    })
    expect(result.current.modalPreviewIndex).toBe(0)

    // 別端末・別セッションの生成完了 (isOwn: false)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('comfy-job-event', {
          detail: {
            type: 'executed',
            images: ['img-from-other-client.png'],
            isOwn: false,
          },
        })
      )
    })

    // 自セッションではないため、自動追従は作動せず現在画像を維持
    await waitFor(() => {
      expect(result.current.sortedDisplayImages).toEqual(['img-from-other-client.png', 'img-1.png'])
      expect(result.current.modalPreviewIndex).toBe(1)
      expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img-1.png')
    })
  })

  it('RedTeam-3: handles toggle safely when image list is empty without throwing exception', () => {
    useGenerationStore.setState({
      batchImages: [],
      selectedImg: null,
      comfyHistoryImages: [],
      previewAutoFollow: false,
    })

    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    expect(() => {
      act(() => {
        result.current.handleToggleAutoFollow()
      })
    }).not.toThrow()

    expect(result.current.previewAutoFollow).toBe(true)
    expect(useGenerationStore.getState().selectedImg).toBeNull()
  })
})
