import React from 'react'
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerationGallerySection } from '../pages/GeneratePage/sections/GenerationGallerySection'
import { useGenerateDisplayState } from '../pages/GeneratePage/hooks/useGenerateDisplayState'
import { useGenerationStore } from '../store/useGenerationStore'
import { comfyApi, generationApi } from '../api/client'

const mocks = vi.hoisted(() => ({
  snapshotList: vi.fn(), imageAvailability: vi.fn(), residualHistory: vi.fn(), getHistory: vi.fn(),
}))

vi.mock('../api/client', () => ({
  snapshotsApi: { list: mocks.snapshotList },
  generationApi: { imageAvailability: mocks.imageAvailability, residualHistory: mocks.residualHistory },
  comfyApi: { getHistory: mocks.getHistory },
}))
vi.mock('../components/LazyThumbnail', () => ({
  LazyThumbnail: ({ src, alt, onLoad, onError }: any) => <img src={src} alt={alt} onLoad={onLoad} onError={onError} />,
}))

const image = (name: string) => `/view?filename=${name}&subfolder=tests&type=temp&t=1`
const imageA = image('A.png')
const imageB = image('B.png')
const allImagesKey = ['generateDisplayImages', { filterOwnSession: false }] as const
const ownImagesKey = ['generateDisplayImages', { filterOwnSession: true }] as const
const snapshotRecord = { id: 91, image_path: imageA, thumbnail_path: null, params: { seed: 91, nested: { prompt: 'kept' } } }

function createClient(images: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(allImagesKey, images)
  client.setQueryData(ownImagesKey, images)
  return client
}

function setStore(images: string[], selectedImg = imageA) {
  useGenerationStore.setState({
    clientId: 'req345-test', batchImages: images, comfyHistoryImages: images, selectedImg,
    generationSnapshot: { jobs: [] },
  } as any)
}

function GalleryHarness({ isMobile = false, filterOwnSession = false, sortOrder = 'desc', thumbnailTab = 'history', sortedSnapshots = [] }: any) {
  const displayState = useGenerateDisplayState({ selectedWorkflowId: null })
  const selectedImg = useGenerationStore((store) => store.selectedImg)
  return <GenerationGallerySection state={{
    ...displayState, thumbnailTab, setThumbnailTab: vi.fn(), sortOrder, setSortOrder: vi.fn(), previewAutoFollow: false,
    handleToggleAutoFollow: vi.fn(), filterOwnSession, setFilterOwnSession: vi.fn(), otherSessionCount: 0,
    isMultiSelectMode: false, selectedIds: new Set(), selectAll: vi.fn(), clearSelection: vi.fn(), setIsSaveModalOpen: vi.fn(),
    exitMultiSelectMode: vi.fn(), isSelected: () => false, selectedImg, getSetNameForImage: () => null, sortedSnapshots,
  } as any} gallery={{ scrollContainerRef: { current: null }, handleWheelScroll: vi.fn(),
    getThumbnailItemProps: () => ({}), handleSnapshotClick: vi.fn() }} isMobile={isMobile} />
}

function renderPage(client: QueryClient, options: Record<string, unknown> = {}) {
  let current = { restoring: true, ...options }
  const tree = () => <IsRestoringProvider value={current.restoring as boolean}>
    <QueryClientProvider client={client}><GalleryHarness {...current} /></QueryClientProvider>
  </IsRestoringProvider>
  const view = render(tree())
  return { ...view, update: (next: Record<string, unknown>) => { current = { ...current, ...next }; view.rerender(tree()) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.snapshotList.mockResolvedValue([])
  mocks.residualHistory.mockImplementation(() => new Promise(() => {}))
  mocks.getHistory.mockImplementation(() => new Promise(() => {}))
  mocks.imageAvailability.mockResolvedValue({ availability: 'present' })
})

describe('REQ-345 DisplayState, Gallery, controller and restored QueryClient', () => {
  it('probes only two loaded rows among 200 restored candidates and never rechecks missing A after view changes', async () => {
    const urls = [imageA, imageB, ...Array.from({ length: 198 }, (_, i) => image(`candidate-${i}.png`))]
    setStore(urls, imageB)
    const client = createClient(urls)
    let releaseA!: (result: { availability: 'missing' }) => void
    let releaseB!: (result: { availability: 'present' }) => void
    let active = 0, maxActive = 0
    mocks.imageAvailability.mockImplementation(({ filename }: { filename: string }) => {
      active++; maxActive = Math.max(active, maxActive)
      const promise = new Promise((resolve) => {
        if (filename === 'A.png') releaseA = resolve as typeof releaseA
        else if (filename === 'B.png') releaseB = resolve as typeof releaseB
        else resolve({ availability: 'present' })
      })
      return promise.finally(() => { active-- })
    })
    const removeMetadata = vi.spyOn(Storage.prototype, 'removeItem')
    const snapshotWrites = vi.spyOn(client, 'setQueryData')
    const page = renderPage(client)
    page.update({ restoring: false })
    await waitFor(() => expect(screen.getAllByAltText(/^Generated /)).toHaveLength(200))
    const thumbs = screen.getAllByAltText(/^Generated /)
    fireEvent.load(thumbs.find((node) => node.getAttribute('src')?.includes('filename=A.png'))!)
    fireEvent.load(thumbs.find((node) => node.getAttribute('src')?.includes('filename=B.png'))!)
    await waitFor(() => expect(generationApi.imageAvailability.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(generationApi.imageAvailability.mock.calls.length).toBeLessThan(200)
    expect(generationApi.imageAvailability.mock.calls.map(([arg]) => arg.filename)).toEqual(expect.arrayContaining(['A.png', 'B.png']))
    expect(maxActive).toBeLessThanOrEqual(2)
    await act(async () => { releaseA({ availability: 'missing' }); releaseB({ availability: 'present' }) })
    await waitFor(() => expect(useGenerationStore.getState().comfyHistoryImages).not.toContain(imageA))
    expect(useGenerationStore.getState().comfyHistoryImages).toContain(imageB)
    expect(useGenerationStore.getState().selectedImg).toBe(imageB)
    const missingCalls = generationApi.imageAvailability.mock.calls.filter(([arg]) => arg.filename === 'A.png').length
    page.update({ isMobile: true, filterOwnSession: true, sortOrder: 'asc' })
    page.update({ isMobile: false, filterOwnSession: false, sortOrder: 'desc' })
    act(() => window.dispatchEvent(new CustomEvent('comfy-job-event', {
      detail: { type: 'history-fetched', allImages: urls, ownImages: urls },
    })))
    await waitFor(() => expect(generationApi.imageAvailability.mock.calls.filter(([arg]) => arg.filename === 'A.png')).toHaveLength(missingCalls))
    expect(useGenerationStore.getState().comfyHistoryImages).not.toContain(imageA)
    expect(useGenerationStore.getState().generationSnapshot).toEqual({ jobs: [] })
    expect(removeMetadata).not.toHaveBeenCalled()
    expect(snapshotWrites.mock.calls.filter(([key]) => Array.isArray(key) && key[0] === 'snapshots')).toHaveLength(0)
    expect(screen.getAllByAltText(/^Generated /).every((node) => node.getAttribute('src')?.includes('/api/comfy/thumbnail?'))).toBe(true)
  })

  it('retains history for thumbnail-only failure and unknown API failures until explicit retry', async () => {
    setStore([imageA])
    const client = createClient([imageA])
    mocks.imageAvailability.mockResolvedValueOnce({ availability: 'present' })
    const page = renderPage(client, { restoring: false })
    const thumb = await screen.findByAltText('Generated 1')
    fireEvent.error(thumb)
    await waitFor(() => expect(screen.getByText(/サムネイル再試行/)).toBeInTheDocument())
    expect(useGenerationStore.getState().comfyHistoryImages).toContain(imageA)
    expect(generationApi.imageAvailability).toHaveBeenCalledTimes(1)

    const imageC = image('C.png')
    setStore([imageA, imageC])
    const retryPage = renderPage(createClient([imageA, imageC]), { restoring: false })
    mocks.imageAvailability.mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('timeout'))
    fireEvent.error(await screen.findByAltText('Generated 2'))
    await waitFor(() => expect(screen.getByText('原画を再確認')).toBeInTheDocument())
    expect(useGenerationStore.getState().comfyHistoryImages).toContain(imageC)
    fireEvent.click(screen.getByText('原画を再確認'))
    await waitFor(() => expect(generationApi.imageAvailability).toHaveBeenCalledTimes(3))
    expect(useGenerationStore.getState().comfyHistoryImages).toContain(imageC)
    retryPage.unmount()
    page.unmount()
  })

  it('keeps same-URL Snapshot image, params and query data unchanged without probing', async () => {
    setStore([imageA])
    const client = createClient([imageA])
    const snapshotKey = ['snapshots', null] as const
    client.setQueryData(snapshotKey, [snapshotRecord])
    const savedParams = structuredClone(snapshotRecord.params)
    const writes = vi.spyOn(client, 'setQueryData')
    renderPage(client, { restoring: false, thumbnailTab: 'snapshots', sortedSnapshots: [snapshotRecord] })
    expect(await screen.findByAltText('Snapshot')).toHaveAttribute('src', imageA)
    fireEvent.load(screen.getByAltText('Snapshot'))
    fireEvent.error(screen.getByAltText('Snapshot'))
    expect(generationApi.imageAvailability).not.toHaveBeenCalled()
    expect(screen.getByAltText('Snapshot')).toHaveAttribute('src', imageA)
    expect(snapshotRecord.params).toEqual(savedParams)
    expect(client.getQueryData(snapshotKey)).toEqual([snapshotRecord])
    expect(writes.mock.calls.filter(([key]) => Array.isArray(key) && key[0] === 'snapshots')).toHaveLength(0)
  })
})
