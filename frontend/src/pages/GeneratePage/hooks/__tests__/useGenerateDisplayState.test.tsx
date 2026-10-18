import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGenerateDisplayState } from '../useGenerateDisplayState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { toThumbnailUrl } from '../../../../utils/thumbnailUrl'

vi.mock('../../../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../../../store/useGenerationStore', () => {
  const state = {
    clientId: 'client-1',
    batchImages: ['img-own-1.png', 'img-own-2.png'],
    selectedImg: 'img-own-1.png',
    setSelectedImg: vi.fn(),
    comfyHistoryImages: ['img-own-1.png', 'img-own-2.png', 'img-other-1.png', 'img-other-2.png'],
    filterOwnSession: false,
    setFilterOwnSession: vi.fn(),
    activeClientId: null,
    isGenerating: false,
    activeBatch: null,
    queueRunning: [],
    queuePending: [],
    previewImage: null,
    previewAutoFollow: true,
    togglePreviewAutoFollow: vi.fn(() => {
      state.previewAutoFollow = !state.previewAutoFollow
    }),
    fetchQueue: vi.fn(),
    fetchHistory: vi.fn(),
    generationSnapshot: null,
  }
  const fn = () => state
  fn.getState = () => state
  fn.setState = (updater: any) => {
    Object.assign(state, typeof updater === 'function' ? updater(state) : updater)
  }
  return {
    useGenerationStore: fn,
  }
})

describe('useGenerateDisplayState', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.clearAllMocks()
    useGenerationStore.setState({
      clientId: 'client-1',
      batchImages: ['img-own-1.png', 'img-own-2.png'],
      selectedImg: 'img-own-1.png',
      comfyHistoryImages: ['img-own-1.png', 'img-own-2.png', 'img-other-1.png', 'img-other-2.png'],
      filterOwnSession: false,
      previewImage: null,
      previewAutoFollow: true,
      generationSnapshot: null,
    })
  })

  afterEach(() => {
    queryClient.clear()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe('AC-1: TanStack Query SSoT cache & otherSessionCount', () => {
    it('initializes displayImages from comfyHistoryImages when filterOwnSession is false', () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      expect(result.current.displayImages).toEqual([
        'img-own-1.png',
        'img-own-2.png',
        'img-other-1.png',
        'img-other-2.png',
      ])
      expect(result.current.otherSessionCount).toBe(2)
      expect(result.current.showStrip).toBe(true)
    })

    it('calculates displayImages and otherSessionCount correctly when filterOwnSession is true', () => {
      useGenerationStore.setState({ filterOwnSession: true })
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      expect(result.current.displayImages).toEqual(['img-own-1.png', 'img-own-2.png'])
      expect(result.current.otherSessionCount).toBe(2)
      expect(result.current.showStrip).toBe(true)
    })

    it('evaluates showStrip as false when there are no images and no snapshots', () => {
      useGenerationStore.setState({
        batchImages: [],
        comfyHistoryImages: [],
        filterOwnSession: false,
      })
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })

      expect(result.current.showStrip).toBe(false)
      expect(result.current.otherSessionCount).toBe(0)
    })
  })

  describe('AC-2: effectiveModalIndex zero-flicker protection', () => {
    it('maintains the current viewed image index using effectiveModalIndex when new images arrive at front', async () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      // Open modal at index 0 (img-own-1.png)
      act(() => {
        result.current.handleOpenModalPreview()
      })

      expect(result.current.isModalPreviewOpen).toBe(true)
      expect(result.current.modalPreviewIndex).toBe(0)
      expect(result.current.effectiveModalIndex).toBe(0)

      // Add a new image to the front via addHistoryImage
      act(() => {
        result.current.addHistoryImage('img-new.png', false)
      })

      // In the same state, effectiveModalIndex points to img-own-1.png (now at index 1)
      await waitFor(() => {
        expect(result.current.displayImages[1]).toBe('img-own-1.png')
        expect(result.current.effectiveModalIndex).toBe(1)
        expect(result.current.modalPreviewIndex).toBe(1)
      })
    })
  })

  describe('AC-3: addHistoryImage optimistic cache updates', () => {
    it('updates cache for both own-session and all-history when isOwnSession is true', () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      act(() => {
        result.current.addHistoryImage('img-own-fresh.png', true)
      })

      // Query cache for filterOwnSession: false
      const allHistory = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: false },
      ])
      expect(allHistory?.[0]).toBe('img-own-fresh.png')

      // Query cache for filterOwnSession: true
      const ownSession = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: true },
      ])
      expect(ownSession?.[0]).toBe('img-own-fresh.png')
    })

    it('updates cache only for all-history when isOwnSession is false', () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      act(() => {
        result.current.addHistoryImage('img-remote-session.png', false)
      })

      const allHistory = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: false },
      ])
      expect(allHistory?.[0]).toBe('img-remote-session.png')

      const ownSession = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: true },
      ])
      expect(ownSession?.includes('img-remote-session.png')).toBeFalsy()
    })

    it('deduplicates and brings image to front if already in list', () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      act(() => {
        result.current.addHistoryImage('img-own-2.png', true)
      })

      const allHistory = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: false },
      ])
      expect(allHistory?.[0]).toBe('img-own-2.png')
      expect(allHistory?.filter((x) => x === 'img-own-2.png').length).toBe(1)
    })
  })

  describe('AC-4: CustomEvent comfy-job-event integration', () => {
    it('listens to comfy-job-event and invokes addHistoryImage', async () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('comfy-job-event', {
            detail: {
              type: 'executed',
              promptId: 'test-prompt',
              images: ['img-from-event.png'],
              isOwn: true,
            },
          })
        )
      })

      await waitFor(() => {
        expect(result.current.displayImages[0]).toBe('img-from-event.png')
      })
    })
  })

  describe('REQ-253: reload and history-fetched race condition prevention', () => {
    it('preserves persisted query cache when rawImages is initially empty on reload', () => {
      // 事前にキャッシュにデータが存在する状態（PersistQueryClientProvider 復元シミュレーション）
      queryClient.setQueryData(
        ['generateDisplayImages', { filterOwnSession: false }],
        ['persisted-1.png', 'persisted-2.png']
      )

      // ストアはリロード直後の空状態
      useGenerationStore.setState({
        batchImages: [],
        comfyHistoryImages: [],
        filterOwnSession: false,
      })

      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      // キャッシュが空配列に上書きされず、復元された値が即座に表示されること
      expect(result.current.displayImages).toEqual(['persisted-1.png', 'persisted-2.png'])
    })

    it('directly updates query cache when history-fetched event carries allImages and ownImages', async () => {
      useGenerationStore.setState({
        batchImages: [],
        comfyHistoryImages: [],
        filterOwnSession: false,
      })

      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      // useEffect (イベントリスナー登録) が確実にコミットされるまで待機
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('comfy-job-event', {
            detail: {
              type: 'history-fetched',
              allImages: ['fetched-1.png', 'fetched-2.png'],
              ownImages: ['fetched-1.png'],
            },
          })
        )
      })

      await waitFor(() => {
        expect(result.current.displayImages).toEqual(['fetched-1.png', 'fetched-2.png'])
      })

      const ownSessionCache = queryClient.getQueryData<string[]>([
        'generateDisplayImages',
        { filterOwnSession: true },
      ])
      expect(ownSessionCache).toEqual(['fetched-1.png'])
    })
  })

  describe('REQ-264: auto-follow and lock behavior in useGenerateDisplayState', () => {
    it('exposes previewAutoFollow and handleToggleAutoFollow', () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      expect(result.current.previewAutoFollow).toBe(true)
      expect(typeof result.current.handleToggleAutoFollow).toBe('function')
    })

    it('toggling auto-follow from OFF to ON jumps to the latest image and updates selectedImg', () => {
      useGenerationStore.setState({
        previewAutoFollow: false,
        batchImages: ['img-1.png', 'img-2.png'],
        comfyHistoryImages: ['img-1.png', 'img-2.png'],
        selectedImg: 'img-2.png',
      })

      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      expect(result.current.previewAutoFollow).toBe(false)

      act(() => {
        result.current.handleToggleAutoFollow()
      })

      // In desc sortOrder (default), index 0 is the newest image: 'img-1.png'
      expect(useGenerationStore.getState().setSelectedImg).toHaveBeenCalledWith('img-1.png')
    })

    it('follows new image in modal preview when previewAutoFollow is true', async () => {
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      // Open modal preview
      act(() => {
        result.current.handleOpenModalPreview()
      })
      expect(result.current.isModalPreviewOpen).toBe(true)

      // Dispatch executed event with new image
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('comfy-job-event', {
            detail: {
              type: 'executed',
              images: ['img-newly-generated.png'],
              isOwn: true,
            },
          })
        )
      })

      // The modal should auto-follow to the newly added image at index 0 (desc sort)
      await waitFor(() => {
        expect(result.current.sortedDisplayImages[0]).toBe('img-newly-generated.png')
        expect(result.current.modalPreviewIndex).toBe(0)
      })
    })

    it('preserves current image in modal preview when previewAutoFollow is false (pinned mode)', async () => {
      useGenerationStore.setState({
        previewAutoFollow: false,
        batchImages: ['img-initial.png'],
        comfyHistoryImages: ['img-initial.png'],
        selectedImg: 'img-initial.png',
      })

      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

      // Open modal preview
      act(() => {
        result.current.handleOpenModalPreview()
      })
      expect(result.current.modalPreviewIndex).toBe(0)

      // Dispatch executed event with new image
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('comfy-job-event', {
            detail: {
              type: 'executed',
              images: ['img-incoming.png'],
              isOwn: true,
            },
          })
        )
      })

      // sortedDisplayImages now has ['img-incoming.png', 'img-initial.png']
      // The viewed image 'img-initial.png' shifted to index 1, modalPreviewIndex should adjust to 1 to preserve it
      await waitFor(() => {
        expect(result.current.sortedDisplayImages).toContain('img-incoming.png')
        expect(result.current.modalPreviewIndex).toBe(1)
        expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img-initial.png')
      })
    })
  })

  describe('REQ-333-T21: image identity and availability', () => {
    it('prepends foreign live images while preserving the modal image and index context', async () => {
      const viewed = '/view?filename=viewed.png&subfolder=&type=output&t=own-prompt'
      const foreign = '/view?filename=foreign.png&subfolder=&type=output&t=foreign-prompt'
      useGenerationStore.setState({ comfyHistoryImages: [viewed], batchImages: [viewed], selectedImg: viewed, filterOwnSession: false })
      const { result, rerender } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      act(() => result.current.handleOpenModalPreview())
      expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe(viewed)

      useGenerationStore.setState({
        comfyHistoryImages: [foreign, viewed],
        generationSnapshot: {
          version: 1, epoch: 'foreign-arrival', revision: 2, normal_group_id: null, batches: [],
          upstream: { http_ready: true, ws_connected: true, failure_since: null },
          jobs: [{ job_id: 'foreign-job', request_id: 'foreign-request', prompt_id: 'foreign-prompt', session_id: 'other-client', scope: 'normal', batch_id: 'foreign-batch', normal_group_id: null, project_id: null, status: 'succeeded', started_at: null, finished_at: null, node: null, failure: null,
            outputs: [{ node_id: '1', index: 0, view_url: foreign, thumbnail_url: '', availability: 'present' }],
          }],
        },
      })
      rerender()

      await waitFor(() => expect(result.current.sortedDisplayImages[0]).toBe(foreign))
      expect(result.current.effectiveModalIndex).toBe(1)
      expect(result.current.sortedDisplayImages[result.current.effectiveModalIndex]).toBe(viewed)
    })

    it('removes known foreign managed identities from persisted own-filter cache but keeps legacy entries', async () => {
      const foreign = '/view?filename=foreign.png&subfolder=&type=output&t=foreign-prompt'
      const legacy = '/legacy/unclassified.png'
      useGenerationStore.setState({
        batchImages: [], comfyHistoryImages: [foreign], filterOwnSession: true,
        generationSnapshot: {
          version: 1, epoch: 'foreign-filter', revision: 3, normal_group_id: null, batches: [],
          upstream: { http_ready: true, ws_connected: true, failure_since: null },
          jobs: [{ job_id: 'foreign-job', request_id: 'foreign-request', prompt_id: 'foreign-prompt', session_id: 'other-client', scope: 'normal', batch_id: 'foreign-batch', normal_group_id: null, project_id: null, status: 'succeeded', started_at: null, finished_at: null, node: null, failure: null,
            outputs: [{ node_id: '1', index: 0, view_url: foreign, thumbnail_url: '', availability: 'present' }],
          }],
        },
      })
      queryClient.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [foreign, legacy])
      const { result, rerender } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      rerender()

      await waitFor(() => expect(queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }])).toEqual([legacy]))
      expect(result.current.displayImages).toEqual([legacy])
    })

    it('normalizes legacy Comfy hosts and deduplicates by filename/subfolder/type identity', () => {
      useGenerationStore.setState({
        comfyHistoryImages: [
          'http://localhost:8188/view?filename=shared.png&subfolder=tests&type=output&t=1',
          '/view?filename=shared.png&subfolder=tests&type=output&t=2',
        ],
        batchImages: [],
      })
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      expect(result.current.displayImages).toEqual(['/view?filename=shared.png&subfolder=tests&type=output&t=1'])
    })

    it('retains Comfy t when building same-origin thumbnail URLs from legacy absolute URLs', () => {
      expect(toThumbnailUrl('http://localhost:8188/view?filename=a%20b.png&subfolder=x&type=output&t=42')).toBe(
        '/api/comfy/thumbnail?filename=a%20b.png&subfolder=x&type=output&size=256&t=42'
      )
    })

    it('retains image identities in display and cache even if comfy-image-availability reports missing', async () => {
      const legacy = 'http://localhost:8188/view?filename=trial.png&subfolder=tests&type=temp&t=11'
      useGenerationStore.setState({ selectedImg: legacy, batchImages: [legacy], comfyHistoryImages: [legacy] })
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      const canonical = '/view?filename=trial.png&subfolder=tests&type=temp&t=11'
      act(() => result.current.handleItemClick(canonical, { ctrlKey: true, metaKey: false, shiftKey: false } as React.MouseEvent))
      expect(result.current.selectedIds.has(canonical)).toBe(true)
      act(() => window.dispatchEvent(new CustomEvent('comfy-image-availability', {
        detail: { url: '/view?filename=trial.png&subfolder=tests&type=temp&t=99', availability: 'missing' },
      })))
      expect(result.current.displayImages).toContain(canonical)
      expect(queryClient.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }])).toContain(canonical)
      expect(result.current.selectedIds.has(canonical)).toBe(true)
    })

    it('retains unknown and thumbnail-failure images and snapshot outputs in trial history', () => {
      const original = '/view?filename=keep.png&subfolder=tests&type=temp&t=1'
      useGenerationStore.setState({
        comfyHistoryImages: [original, '/view?filename=thumb-error.png&subfolder=tests&type=temp', '/view?filename=missing.png&subfolder=tests&type=temp'],
        batchImages: [],
        generationSnapshot: {
          version: 1, epoch: 'e', revision: 1, normal_group_id: null, batches: [],
          upstream: { http_ready: true, ws_connected: true, failure_since: null },
          jobs: [{ job_id: 'j', request_id: 'r', prompt_id: null, session_id: 's', scope: 'normal', batch_id: 'b', normal_group_id: null, project_id: null, status: 'succeeded', started_at: null, finished_at: null, node: null, failure: null,
            outputs: [
              { node_id: '1', index: 0, view_url: original, thumbnail_url: '', availability: 'unknown' },
              { node_id: '1', index: 1, view_url: '/view?filename=missing.png&subfolder=tests&type=temp', thumbnail_url: '', availability: 'missing' },
            ],
          }],
        },
      })
      const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })
      expect(result.current.displayImages).toContain(original)
      expect(result.current.displayImages).toContain('/view?filename=thumb-error.png&subfolder=tests&type=temp')
      expect(result.current.displayImages).toContain('/view?filename=missing.png&subfolder=tests&type=temp')
    })
  })
})
