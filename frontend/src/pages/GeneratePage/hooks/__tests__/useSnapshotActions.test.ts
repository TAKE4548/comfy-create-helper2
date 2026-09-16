import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSnapshotActions } from '../useSnapshotActions'
import { snapshotsApi, promptMetadataApi } from '../../../../api/client'
import { useGenerationStore } from '../../../../store/useGenerationStore'

vi.mock('../../../../api/client', () => ({
  snapshotsApi: {
    create: vi.fn().mockResolvedValue({ id: 100 }),
  },
  promptMetadataApi: {
    get: vi.fn(),
  },
}))

describe('useSnapshotActions - REQ-227 Cross-device Snapshot Metadata Restoration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    useGenerationStore.setState({
      selectedImg: 'http://localhost:8188/view?filename=test.png&t=prompt-999',
      paramValues: { aspect_ratio: '9:16', steps: '20' },
      appliedAssets: {},
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  it('should restore metadata from server DB when local storage cache is missing', async () => {
    vi.mocked(promptMetadataApi.get).mockResolvedValueOnce({
      prompt_id: 'prompt-999',
      workflow_id: 1,
      param_values: { aspect_ratio: '16:9', steps: 40 },
      applied_assets: { role1: [] },
      created_at: '2026-09-07T00:00:00Z',
    })

    const { result } = renderHook(() => useSnapshotActions(1), { wrapper })

    await act(async () => {
      await result.current.saveSnapshot.mutateAsync({
        albumId: 1,
        imagePaths: ['http://localhost:8188/view?filename=test.png&t=prompt-999'],
      })
    })

    expect(promptMetadataApi.get).toHaveBeenCalledWith('prompt-999')
    expect(snapshotsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow_id: 1,
        image_path: 'http://localhost:8188/view?filename=test.png&t=prompt-999',
        params: { aspect_ratio: '16:9', steps: 40 },
      })
    )
  })

  it('Red Teaming: should fallback gracefully to current UI paramValues if server API fails', async () => {
    vi.mocked(promptMetadataApi.get).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useSnapshotActions(1), { wrapper })

    await act(async () => {
      await result.current.saveSnapshot.mutateAsync({
        albumId: 1,
        imagePaths: ['http://localhost:8188/view?filename=test.png&t=prompt-999'],
      })
    })

    expect(promptMetadataApi.get).toHaveBeenCalledWith('prompt-999')
    expect(snapshotsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { aspect_ratio: '9:16', steps: '20' },
      })
    )
  })

  it('REQ-267: should call setErrorToast when snapshotsApi.create fails', async () => {
    vi.mocked(snapshotsApi.create).mockRejectedValueOnce(new Error('Failed to fetch image from ComfyUI'))

    const { result } = renderHook(() => useSnapshotActions(1), { wrapper })

    await act(async () => {
      try {
        await result.current.saveSnapshot.mutateAsync({
          albumId: 1,
          imagePaths: ['http://localhost:8188/view?filename=test.png'],
        })
      } catch {
        // Expected mutation failure
      }
    })

    const state = useGenerationStore.getState()
    expect(state.errorToast).toEqual({
      type: 'error',
      message: 'スナップショットの保存に失敗しました: Failed to fetch image from ComfyUI',
    })
  })
})
