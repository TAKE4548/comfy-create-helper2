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
})
