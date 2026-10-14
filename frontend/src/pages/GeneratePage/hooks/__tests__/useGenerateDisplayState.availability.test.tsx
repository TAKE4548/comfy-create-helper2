import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useGenerateDisplayState } from '../useGenerateDisplayState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { generationApi } from '../../../../api/client'

vi.mock('../../../../api/client', () => ({
  snapshotsApi: { list: vi.fn().mockResolvedValue([]) },
  generationApi: { imageAvailability: vi.fn() },
}))

const image = (name: string) => `/view?filename=${name}.png&type=output`
const makeWrapper = (client: QueryClient) => ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={client}>{children}</QueryClientProvider>

describe('useGenerateDisplayState REQ-345', () => {
  beforeEach(() => {
    useGenerationStore.setState({ batchImages: [], comfyHistoryImages: [], selectedImg: null, generationSnapshot: null } as never)
    vi.clearAllMocks()
  })

  it('removes confirmed missing images from both history caches and clears selection', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({
      batchImages: [image('gone'), image('keep')],
      comfyHistoryImages: [image('gone'), image('keep')],
      selectedImg: image('gone'),
      generationSnapshot: { jobs: [] },
    } as never)
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('gone'), image('keep')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('gone'), image('keep')])
    vi.mocked(generationApi.imageAvailability).mockImplementation(async ({ filename }) => ({
      availability: filename === 'gone.png' ? 'missing' : 'present',
    }))
    const wrapper = makeWrapper(client)
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })

    await act(async () => {
      await expect(result.current.trialAvailability.check(image('gone'))).resolves.toBe('missing')
    })
    await waitFor(() => expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([image('keep')]))
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([image('keep')])
    expect(useGenerationStore.getState().selectedImg).toBeNull()
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([image('keep')])
    expect(useGenerationStore.getState().batchImages).toEqual([image('keep')])
  })

  it('does not probe unknown cached history images during mount', () => {
    const client = new QueryClient()
    useGenerationStore.setState({ batchImages: [image('unknown')], comfyHistoryImages: [image('unknown')] } as never)
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    expect(result.current.residualHistoryStatus).toBe('waiting')
    expect(() => result.current.retryResidualHistory()).not.toThrow()
    expect(generationApi.imageAvailability).not.toHaveBeenCalled()
  })

  it('filters an initially missing snapshot identity from both restored caches', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({
      batchImages: [image('gone')],
      comfyHistoryImages: [image('gone')],
      generationSnapshot: { jobs: [{ session_id: 'client', outputs: [{ view_url: image('gone'), availability: 'missing' }] }] },
    } as never)
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('gone')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('gone')])
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await waitFor(() => {
      expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([])
      expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([])
    })
    expect(result.current.displayImages).toEqual([])
  })

  it('keeps the query entry as an empty array when the last image is missing', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({ batchImages: [image('gone')], comfyHistoryImages: [image('gone')] } as never)
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('gone')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('gone')])
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'missing' })
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    await act(async () => { await result.current.trialAvailability.check(image('gone')) })
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([])
    expect(result.current.displayImages).toEqual([])
  })

  it('does not restore a missing image from a present event or a later history fetch', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({ batchImages: [image('gone')], comfyHistoryImages: [image('gone')] } as never)
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'present' })
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    act(() => result.current.trialAvailability.adopt(image('gone'), 'missing'))
    act(() => window.dispatchEvent(new CustomEvent('comfy-image-availability', {
      detail: { url: image('gone'), availability: 'present' },
    })))
    act(() => window.dispatchEvent(new CustomEvent('comfy-job-event', {
      detail: { type: 'history-fetched', allImages: [image('gone')], ownImages: [image('gone')] },
    })))
    await waitFor(() => expect(result.current.displayImages).toEqual([]))
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([])
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([])
  })

  it('closes the preview when its only displayed image becomes missing', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({ batchImages: [image('gone')], comfyHistoryImages: [image('gone')], selectedImg: image('gone') } as never)
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'missing' })
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    act(() => result.current.handleOpenModalPreview())
    expect(result.current.isModalPreviewOpen).toBe(true)
    await act(async () => { await result.current.trialAvailability.check(image('gone')) })
    await waitFor(() => expect(result.current.isModalPreviewOpen).toBe(false))
  })

  it('survives StrictMode effect replay without disposing its controller', async () => {
    const client = new QueryClient()
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), {
      wrapper: ({ children }) => <StrictMode>{makeWrapper(client)({ children })}</StrictMode>,
    })
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'present' })
    await expect(result.current.trialAvailability.check(image('live'))).resolves.toBe('present')
  })

  it('ignores a probe response that settles after unmount', async () => {
    const client = new QueryClient()
    let resolveProbe!: (value: { availability: 'missing' }) => void
    vi.mocked(generationApi.imageAvailability).mockReturnValue(new Promise((resolve) => { resolveProbe = resolve }))
    const { result, unmount } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    let pending!: Promise<unknown>
    act(() => { pending = result.current.trialAvailability.check(image('late')) })
    unmount()
    resolveProbe({ availability: 'missing' })
    await pending
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([])
  })
})
