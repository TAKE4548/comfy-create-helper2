import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSnapshotActions } from '../useSnapshotActions'
import { snapshotsApi, promptMetadataApi } from '../../../../api/client'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { PROMPT_RECORD_KEY, ASSOCIATIONS_KEY } from '../../../../utils/generationRecord'

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

  it('[REQ-316/AC-1] keeps unrecorded params empty if server API fails', async () => {
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
        params: {},
      })
    )
  })

  it('[REQ-316/AC-2] saves each image from its own frozen record and initializes known trigger associations', async () => {
    const record = (id: number) => JSON.stringify({ version: 1, workflow_id: id, workflow_name: `WF${id}`,
      fields: [], parameters: [], assets: [{ type: 'lora', asset_id: 10, name: 'Captured', role: 'Quality',
        tags: ['captured'], origin: 'lora-trigger', trigger_set_id: 4, trigger_set_name: 'Set' }], queued_at: null, completeness: 'complete' });
    for (const id of [7, 8]) localStorage.setItem(`prompt-surgeon-meta-p${id}`, JSON.stringify({
      paramValues: { [PROMPT_RECORD_KEY]: record(id), Quality: `image${id}` },
      appliedAssets: { Quality: [{ type: 'lora', assetId: 10, name: 'Captured', tags: [], enabled: true }] }, timestamp: 1,
    }));
    const { result } = renderHook(() => useSnapshotActions(99), { wrapper });
    await act(async () => { await result.current.saveSnapshot.mutateAsync({ albumId: null,
      imagePaths: ['http://localhost/view?t=p7', 'http://localhost/view?t=p8'] }); });
    const calls = vi.mocked(snapshotsApi.create).mock.calls.map(([value]) => value);
    expect(calls.map(c => c.workflow_id)).toEqual([7, 8]);
    expect(calls.map(c => c.params.Quality)).toEqual(['image7', 'image8']);
    expect(JSON.parse(calls[0].params[ASSOCIATIONS_KEY] as string)).toEqual({ version: 1,
      lora_trigger_sets: [{ lora_id: 10, trigger_set_id: 4, role: 'Quality' }] });
    expect(calls[0].params[PROMPT_RECORD_KEY]).toBe(record(7));
  });

  it('[REQ-267/AC-1] should call setErrorToast when snapshotsApi.create fails', async () => {
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
