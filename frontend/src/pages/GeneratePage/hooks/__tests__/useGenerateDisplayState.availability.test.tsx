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

describe('useGenerateDisplayState REQ-379', () => {
  beforeEach(() => {
    useGenerationStore.setState({ batchImages: [], comfyHistoryImages: [], selectedImg: null, generationSnapshot: null } as never)
    vi.clearAllMocks()
  })

  it('retains trial history image even if upstream ComfyUI original is missing [REQ-379/AC-2]', async () => {
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
      await result.current.trialAvailability.check(image('gone'))
    })
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([image('gone'), image('keep')])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([image('gone'), image('keep')])
    expect(useGenerationStore.getState().selectedImg).toBe(image('gone'))
    expect(useGenerationStore.getState().comfyHistoryImages).toEqual([image('gone'), image('keep')])
    expect(useGenerationStore.getState().batchImages).toEqual([image('gone'), image('keep')])
  })

  it('does not probe unknown cached history images during mount', () => {
    const client = new QueryClient()
    useGenerationStore.setState({ batchImages: [image('unknown')], comfyHistoryImages: [image('unknown')] } as never)
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    expect(result.current.residualHistoryStatus).toBe('waiting')
    expect(() => result.current.retryResidualHistory()).not.toThrow()
    expect(generationApi.imageAvailability).not.toHaveBeenCalled()
  })

  it('retains snapshot identity even if marked missing in job output [REQ-379/AC-2]', async () => {
    const client = new QueryClient()
    useGenerationStore.setState({
      batchImages: [image('gone')],
      comfyHistoryImages: [image('gone')],
      generationSnapshot: { jobs: [{ session_id: 'client', outputs: [{ view_url: image('gone'), availability: 'missing' }] }] },
    } as never)
    client.setQueryData(['generateDisplayImages', { filterOwnSession: false }], [image('gone')])
    client.setQueryData(['generateDisplayImages', { filterOwnSession: true }], [image('gone')])
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper: makeWrapper(client) })
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: false }])).toEqual([image('gone')])
    expect(client.getQueryData(['generateDisplayImages', { filterOwnSession: true }])).toEqual([image('gone')])
    expect(result.current.displayImages).toEqual([image('gone')])
  })

  it('survives StrictMode effect replay without disposing its controller', async () => {
    const client = new QueryClient()
    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), {
      wrapper: ({ children }) => <StrictMode>{makeWrapper(client)({ children })}</StrictMode>,
    })
    vi.mocked(generationApi.imageAvailability).mockResolvedValue({ availability: 'present' })
    await expect(result.current.trialAvailability.check(image('live'))).resolves.toBe('present')
  })
})
