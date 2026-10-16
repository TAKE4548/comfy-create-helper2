import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useGenerateDisplayState } from '../useGenerateDisplayState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { generationApi } from '../../../../api/client'
import type { ImageIdentity, ResidualHistoryResponse } from '../../../../api/domains/generation'

vi.mock('../../../../api/client', () => ({
  snapshotsApi: { list: vi.fn().mockResolvedValue([]) },
  generationApi: { imageAvailability: vi.fn(), residualHistory: vi.fn() },
}))

const image = (name: string) => `/view?filename=${name}.png&type=output`
const identity = (filename: string): ImageIdentity => ({ filename, subfolder: '', type: 'output' })
const item = (filename: string, session_id: string | null = 'client') => ({
  identity: identity(filename), view_url: image(filename.replace(/\.png$/, '')), session_id, availability: 'present' as const,
})
const response = (items: ResidualHistoryResponse['items'], has_more = false): ResidualHistoryResponse => ({ items, rejected: [], has_more })
const makeWrapper = (client: QueryClient, restoring = false) => ({ children }: { children: React.ReactNode }) =>
  <IsRestoringProvider value={restoring}><QueryClientProvider client={client}>{children}</QueryClientProvider></IsRestoringProvider>

describe('useGenerateDisplayState residual history sync', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      clientId: 'client', batchImages: [], comfyHistoryImages: [], selectedImg: null,
      generationSnapshot: { jobs: [] },
    } as never)
    vi.clearAllMocks()
  })

  it('waits for Query restoration, sends the displayed baseline, and merges only confirmed own images', async () => {
    const client = new QueryClient()
    const baseline = image('shown')
    useGenerationStore.setState({ selectedImg: baseline } as never)
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baseline])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baseline])
    let restore = true
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <IsRestoringProvider value={restore}><QueryClientProvider client={client}>{children}</QueryClientProvider></IsRestoringProvider>
    const { result, rerender } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })
    expect(generationApi.residualHistory).not.toHaveBeenCalled()

    vi.mocked(generationApi.residualHistory).mockResolvedValue(response([item('own.png'), item('foreign.png', 'other'), item('unknown.png', null)]))
    restore = false
    rerender()
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))

    expect(generationApi.residualHistory).toHaveBeenCalledTimes(1)
    expect(vi.mocked(generationApi.residualHistory).mock.calls[0][0]).toEqual({ known: [identity('shown.png')], examined: [] })
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([image('own'), image('foreign'), image('unknown'), baseline])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([image('own'), baseline])
    expect(useGenerationStore.getState().selectedImg).toBe(baseline)
  })

  it('keeps skipping focus and visibility history refresh with a persisted baseline', async () => {
    const client = new QueryClient()
    const baseline = image('shown')
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baseline])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baseline])
    const store = useGenerationStore.getState()
    const fetchHistory = vi.spyOn(store, 'fetchHistory').mockImplementation(vi.fn())
    const fetchQueue = vi.spyOn(store, 'fetchQueue').mockImplementation(vi.fn())
    let restore = true
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <IsRestoringProvider value={restore}><QueryClientProvider client={client}>{children}</QueryClientProvider></IsRestoringProvider>
    vi.mocked(generationApi.residualHistory).mockResolvedValue(response([item('restored.png')]))
    const { result, rerender } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })
    expect(result.current.residualHistoryStatus).toBe('waiting')

    act(() => window.dispatchEvent(new Event('focus')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(fetchQueue).toHaveBeenCalledTimes(2)
    expect(fetchHistory).not.toHaveBeenCalled()

    restore = false
    rerender()
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))
    act(() => window.dispatchEvent(new Event('focus')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(fetchQueue).toHaveBeenCalledTimes(4)
    expect(fetchHistory).not.toHaveBeenCalled()
    fetchHistory.mockRestore()
    fetchQueue.mockRestore()
  })

  it('keeps terminal focus history refresh when no displayed baseline exists', async () => {
    const client = new QueryClient()
    const store = useGenerationStore.getState()
    const fetchHistory = vi.spyOn(store, 'fetchHistory').mockImplementation(vi.fn())
    const fetchQueue = vi.spyOn(store, 'fetchQueue').mockImplementation(vi.fn())
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))

    act(() => window.dispatchEvent(new Event('focus')))
    expect(fetchHistory).toHaveBeenCalledTimes(1)
    expect(fetchQueue).toHaveBeenCalledTimes(1)
    fetchHistory.mockRestore()
    fetchQueue.mockRestore()
  })

  it('recomputes known after each page and deduplicates an image arriving while a page is in flight', async () => {
    const client = new QueryClient()
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('shown')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('shown')])
    let calls = 0
    vi.mocked(generationApi.residualHistory).mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        client.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }], (old = []) => [image('race'), ...old])
        client.setQueryData<string[]>(['generateDisplayImages', { filterOwnSession: true }], (old = []) => [image('race'), ...old])
        return response([item('page-a.png')], true)
      }
      return response([item('race.png'), item('page-b.png')])
    })
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))
    expect(calls).toBe(2)
    expect(vi.mocked(generationApi.residualHistory).mock.calls[1][0].known).toEqual([
      identity('page-a.png'), identity('race.png'), identity('shown.png'),
    ])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([
      image('page-a'), image('race'), image('page-b'), image('shown'),
    ])
    expect(useGenerationStore.getState().comfyHistoryImages.filter((url) => url === image('race'))).toHaveLength(1)
  })

  it('does not write a late response after unmount aborts the active sync', async () => {
    const client = new QueryClient()
    const baseline = image('shown')
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baseline])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baseline])
    let resolveRequest!: (value: ResidualHistoryResponse) => void
    vi.mocked(generationApi.residualHistory).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    const { unmount } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(generationApi.residualHistory).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => {
      await Promise.resolve()
      resolveRequest(response([item('late.png')]))
      await Promise.resolve()
    })
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([baseline])
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([])
  })

  it('shares one request through StrictMode reconnect and only retries unknown identities on request', async () => {
    const client = new QueryClient()
    const baseline = image('shown')
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baseline])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baseline])
    const unknown = identity('unknown.png')
    vi.mocked(generationApi.residualHistory)
      .mockResolvedValueOnce({ items: [], rejected: [{ identity: unknown, availability: 'unknown' }], has_more: false })
      .mockResolvedValueOnce(response([item('unknown.png')]))
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      <StrictMode>{makeWrapper(client)({ children })}</StrictMode>
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))
    expect(generationApi.residualHistory).toHaveBeenCalledTimes(1)
    expect(result.current.trialAvailability.getStatus(image('unknown'))).toBeUndefined()
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([baseline])

    act(() => result.current.retryResidualHistory())
    await waitFor(() => expect(generationApi.residualHistory).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([image('unknown'), baseline]))
    expect(result.current.trialAvailability.getStatus(image('unknown'))).toBe('present')
  })

  it('stops after one retry page when has_more repeats an already examined identity', async () => {
    const client = new QueryClient()
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('shown')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('shown')])
    const oldViewUrl = `${image('B')}&t=old`
    vi.mocked(generationApi.residualHistory)
      .mockResolvedValueOnce(response([{ ...item('B.png'), view_url: oldViewUrl }]))
      .mockResolvedValue(response([{ ...item('B.png'), view_url: `${image('B')}&t=new` }], true))
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))
    expect(generationApi.residualHistory).toHaveBeenCalledTimes(1)

    act(() => result.current.retryResidualHistory())
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('partial'))
    expect(generationApi.residualHistory).toHaveBeenCalledTimes(2)
    expect(vi.mocked(generationApi.residualHistory).mock.calls[1][0].examined).toEqual([identity('B.png')])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([oldViewUrl, image('shown')])
  })

  it('stops after one retry page when baseline-known B follows a full 20-page cycle', async () => {
    const client = new QueryClient()
    const baselineB = image('B')
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baselineB])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baselineB])
    let calls = 0
    vi.mocked(generationApi.residualHistory).mockImplementation(async () => {
      calls += 1
      return calls <= 20 ? response([item(`page-${calls}.png`)], true) : response([item('B.png')], true)
    })
    let hook!: ReturnType<typeof renderHook<ReturnType<typeof useGenerateDisplayState>, unknown>>
    await act(async () => {
      hook = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    })
    const { result } = hook
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('partial'))
    expect(calls).toBe(20)

    act(() => result.current.retryResidualHistory())
    await waitFor(() => expect(generationApi.residualHistory).toHaveBeenCalledTimes(21))
    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('partial'))
    expect(calls).toBe(21)
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toContain(baselineB)
  })

  it('[REQ-370/AC-4] calls store.loadSnapshot on visibilitychange and updates query cache with newly completed images', async () => {
    const client = new QueryClient()
    const baseline = image('shown')
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [baseline])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [baseline])
    const store = useGenerationStore.getState()
    const loadSnapshotSpy = vi.spyOn(store, 'loadSnapshot').mockImplementation(async () => {
      useGenerationStore.setState({
        comfyHistoryImages: [image('completed-on-other-device'), baseline],
      })
    })
    const fetchQueueSpy = vi.spyOn(store, 'fetchQueue').mockImplementation(vi.fn())

    renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), {
      wrapper: makeWrapper(client),
    })

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(loadSnapshotSpy).toHaveBeenCalled()
    await waitFor(() => {
      const data = client.getQueryData<string[]>(['generateDisplayImages', { filterOwnSession: false }])
      expect(data).toContain(image('completed-on-other-device'))
    })

    loadSnapshotSpy.mockRestore()
    fetchQueueSpy.mockRestore()
  })
})

