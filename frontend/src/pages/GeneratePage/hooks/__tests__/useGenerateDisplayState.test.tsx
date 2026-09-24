import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGenerateDisplayState } from '../useGenerateDisplayState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

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
})

