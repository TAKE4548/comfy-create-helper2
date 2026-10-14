import React from 'react'
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerationGallerySection } from '../GenerationGallerySection'
import { useGenerateDisplayState } from '../../hooks/useGenerateDisplayState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { comfyApi, generationApi } from '../../../../api/client'
import type { ImageIdentity, ResidualHistoryResponse } from '../../../../api/domains/generation'
import { cleanupAllTestState } from '../../../../test/utils'

const api = vi.hoisted(() => ({
  snapshotList: vi.fn(),
  imageAvailability: vi.fn(),
  residualHistory: vi.fn(),
  getHistory: vi.fn(),
}))

vi.mock('../../../../api/client', () => ({
  snapshotsApi: { list: api.snapshotList },
  generationApi: {
    imageAvailability: api.imageAvailability,
    residualHistory: api.residualHistory,
  },
  comfyApi: { getHistory: api.getHistory },
}))

vi.mock('../../../../components/LazyThumbnail', () => {
  const Thumbnail = ({ src, alt, onLoad, onError }: {
    src: string; alt: string; onLoad?: () => void; onError?: () => void
  }) => <img src={src} alt={alt} onLoad={onLoad} onError={onError} />
  return { default: Thumbnail, LazyThumbnail: Thumbnail }
})

const identity = (filename: string, subfolder = '', type = 'output'): ImageIdentity => ({
  filename, subfolder, type,
})
const url = (image: ImageIdentity, host = '', t = '') =>
  `${host}/view?filename=${encodeURIComponent(image.filename)}${image.subfolder ? `&subfolder=${encodeURIComponent(image.subfolder)}` : ''}&type=${encodeURIComponent(image.type)}${t ? `&t=${t}` : ''}`
const A = identity('a.png')
const B = identity('b.png')
const C = identity('c.png')
const D = identity('d.png')
const E = identity('e.png')
const F = identity('b.png', 'different-folder', 'input')
const initial = [url(A), url(B, '', 'old')]
const shown = identity('shown.png')
const shownUrl = url(shown)
const keys = [
  ['generateDisplayImages', { filterOwnSession: false }] as const,
  ['generateDisplayImages', { filterOwnSession: true }] as const,
]

function makeResponse(items: ResidualHistoryResponse['items'] = [], rejected: ResidualHistoryResponse['rejected'] = [], has_more = false): ResidualHistoryResponse {
  return { items, rejected, has_more }
}

function imageItem(image: ImageIdentity, view_url = url(image), session_id: string | null = null): ResidualHistoryResponse['items'][number] {
  return { identity: image, view_url, session_id, availability: 'present' }
}

function Harness({ filterOwnSession = false, thumbnailTab = 'history' }: { filterOwnSession?: boolean; thumbnailTab?: string }) {
  const state = useGenerateDisplayState({ selectedWorkflowId: null })
  const selectedImage = useGenerationStore((store) => store.selectedImg)
  const base = {
    thumbnailTab, setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(),
    previewAutoFollow: false, handleToggleAutoFollow: vi.fn(), filterOwnSession,
    setFilterOwnSession: vi.fn(), otherSessionCount: 0, isMultiSelectMode: false,
    selectedIds: new Set<string>(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: () => false,
    getSetNameForImage: () => null, sortedSnapshots: [],
  }
  const display = (state.sortedDisplayImages as unknown[]).map((entry) => {
    if (typeof entry === 'string') return entry
    const image = entry as { view_url?: string; url?: string }
    return image.view_url ?? image.url ?? String(entry)
  })
  return <>
    <GenerationGallerySection
      state={{ ...base, ...state }}
      gallery={{ scrollContainerRef: { current: null }, handleWheelScroll: vi.fn(), getThumbnailItemProps: () => ({}), handleSnapshotClick: vi.fn() }}
    />
    <output data-testid="display-images">{JSON.stringify(display)}</output>
    <output data-testid="selected-image">{selectedImage ?? ''}</output>
    <output data-testid="residual-status">{String(state.residualHistoryStatus)}</output>
    <button onClick={() => { void state.retryResidualHistory() }}>retry residual</button>
  </>
}

function App({ client, restoring, filterOwnSession = false, thumbnailTab = 'history' }: {
  client: QueryClient; restoring: boolean; filterOwnSession?: boolean; thumbnailTab?: string
}) {
  return <IsRestoringProvider value={restoring}><QueryClientProvider client={client}>
    <Harness filterOwnSession={filterOwnSession} thumbnailTab={thumbnailTab} />
  </QueryClientProvider></IsRestoringProvider>
}

function seed(client: QueryClient, images: string[]) {
  keys.forEach((key) => client.setQueryData(key, images))
}

function seedStore(images: string[], selectedImg: string | null, generationSnapshot: { jobs: [] } | null = null) {
  useGenerationStore.setState({
    ...useGenerationStore.getInitialState(), clientId: 'client', batchImages: images,
    comfyHistoryImages: images, selectedImg, generationSnapshot,
  } as never)
}

function parseImages() {
  return JSON.parse(screen.getByTestId('display-images').textContent || '[]') as string[]
}

function hasIdentity(viewUrl: string, image: ImageIdentity) {
  const query = new URL(viewUrl, 'http://local').searchParams
  return query.get('filename') === image.filename
    && (query.get('subfolder') ?? '') === image.subfolder
    && (query.get('type') ?? 'output') === image.type
}

async function settleThumbnails() {
  await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0))
  for (const image of screen.getAllByRole('img')) {
    if (image.getAttribute('src')?.includes('a.png')) fireEvent.error(image)
    else fireEvent.load(image)
  }
}

beforeEach(() => {
  cleanupAllTestState()
  api.snapshotList.mockResolvedValue([])
  api.imageAvailability.mockImplementation((candidate: ImageIdentity) => Promise.resolve({
    availability: candidate?.filename === 'a.png' ? 'missing' : 'present',
  }))
  api.residualHistory.mockReset()
  api.getHistory.mockReset()
  useGenerationStore.setState({
    ...useGenerationStore.getInitialState(), clientId: 'self', batchImages: [],
    comfyHistoryImages: [], selectedImg: url(B, '', 'old'), generationSnapshot: null,
  } as never)
})

afterEach(() => {
  cleanup()
  cleanupAllTestState()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('REQ-345 residual history restore integration', () => {
  it.each(['snapshot-before-restore', 'restore-before-snapshot'])('%s merges by identity after the restore barrier', async (order) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seed(client, initial)
    seedStore(initial, url(B, '', 'old'), order === 'snapshot-before-restore' ? { jobs: [] } : null)
    let resolveResponse!: (response: ResidualHistoryResponse) => void
    api.residualHistory.mockReturnValue(new Promise((resolve) => { resolveResponse = resolve }))
    const getHistorySpy = vi.spyOn(comfyApi, 'getHistory')
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem')
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const view = render(<App client={client} restoring />)
    if (order === 'restore-before-snapshot') {
      act(() => useGenerationStore.setState({ generationSnapshot: { jobs: [] } } as never))
    }
    view.rerender(<App client={client} restoring={false} />)
    await waitFor(() => expect(api.residualHistory).toHaveBeenCalledTimes(1))
    const request = api.residualHistory.mock.calls[0][0] as { known: ImageIdentity[]; examined: ImageIdentity[] }
    expect(request.known).toEqual(expect.arrayContaining([A, B]))
    expect(request.known).toHaveLength(2)
    expect(request.examined).toEqual([])
    act(() => seed(client, [...initial, url(C, '', 'live')]))
    await act(async () => resolveResponse(makeResponse(
      [imageItem(B, url(B, '', 'replacement')), imageItem(C), imageItem(F)],
      [{ identity: D, availability: 'missing' }, { identity: E, availability: 'unknown' }],
    )))
    await settleThumbnails()
    await waitFor(() => expect(parseImages().some((image) => image.includes('b.png'))).toBe(true))
    const displayed = parseImages()
    expect(displayed.filter((image) => hasIdentity(image, B))).toHaveLength(1)
    expect(displayed.filter((image) => hasIdentity(image, C))).toHaveLength(1)
    expect(displayed.some((image) => hasIdentity(image, F))).toBe(true)
    expect(displayed.some((image) => /filename=[ade]\.png/.test(image))).toBe(false)
    expect(displayed.find((image) => image.includes('filename=b.png'))).toBe(initial[1])
    expect(displayed.find((image) => image.includes('filename=c.png'))).toContain('t=live')
    expect(screen.getByTestId('selected-image').textContent).toBe(url(B, '', 'old'))
    expect(getHistorySpy).not.toHaveBeenCalled()
    expect(dispatchSpy.mock.calls.filter(([event]) => event.type === 'history-fetched')).toHaveLength(0)
    expect(removeItemSpy).not.toHaveBeenCalled()
    getHistorySpy.mockRestore()
    removeItemSpy.mockRestore()
    dispatchSpy.mockRestore()
  })

  it('does not start a residual or full-history request without a persisted baseline', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seed(client, [])
    seedStore([], null, { jobs: [] })
    render(<App client={client} restoring={false} />)
    await act(async () => { await Promise.resolve() })
    expect(api.residualHistory).not.toHaveBeenCalled()
    expect(api.getHistory).not.toHaveBeenCalled()
  })

  it('caps pagination at 20 pages/200 items and stops a repeated has_more identity', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seed(client, initial)
    seedStore(initial, url(B, '', 'old'), { jobs: [] })
    for (let page = 0; page < 20; page += 1) {
      const items = Array.from({ length: 10 }, (_, index) => {
        const n = page * 10 + index
        return imageItem(identity(`page-${n}.png`), url(identity(`page-${n}.png`)), null)
      })
      api.residualHistory.mockResolvedValueOnce(makeResponse(items, [], true))
    }
    const getHistorySpy = vi.spyOn(comfyApi, 'getHistory')
    render(<App client={client} restoring={false} filterOwnSession thumbnailTab="snapshots" />)
    await waitFor(() => expect(api.residualHistory).toHaveBeenCalledTimes(20), { timeout: 15000 })
    expect(api.residualHistory.mock.calls.length).toBeLessThanOrEqual(20)
    expect(client.getQueryData(keys[1])).toEqual(initial)
    expect(getHistorySpy).not.toHaveBeenCalled()
    api.residualHistory.mockReset()
    api.residualHistory.mockResolvedValue(makeResponse([imageItem(B, url(B, '', 'replacement'))], [], true))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry residual' })))
    await waitFor(() => expect(api.residualHistory).toHaveBeenCalledTimes(1))
    expect(api.residualHistory).toHaveBeenCalledTimes(1)
    getHistorySpy.mockRestore()
  }, 15000)

  it('keeps the baseline after errors and only manual retry starts another cycle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    seed(client, [shownUrl])
    seedStore([shownUrl], shownUrl, { jobs: [] })
    api.residualHistory.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(makeResponse([imageItem(C)]))
    render(<App client={client} restoring={false} />)
    await waitFor(() => expect(api.residualHistory).toHaveBeenCalledTimes(1))
    const request = api.residualHistory.mock.calls[0][0] as { known: ImageIdentity[]; examined: ImageIdentity[] }
    expect(request.known).toEqual([{ filename: 'shown.png', subfolder: '', type: 'output' }])
    expect(request.examined).toEqual([])
    await waitFor(() => expect(screen.getByTestId('selected-image').textContent).toBe(shownUrl))
    expect(parseImages()).toContain(shownUrl)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'retry residual' })))
    await waitFor(() => expect(api.residualHistory).toHaveBeenCalledTimes(2))
    expect(api.getHistory).not.toHaveBeenCalled()
    expect(screen.getByTestId('selected-image').textContent).toBe(shownUrl)
  })
})
