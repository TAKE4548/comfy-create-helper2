import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GenerationGallerySection } from '../GenerationGallerySection'

const mocks = vi.hoisted(() => ({
  imageAvailability: vi.fn(),
  setState: vi.fn(),
  rowClick: vi.fn(),
}))

vi.mock('../../../../api/domains/generation', () => ({
  generationApi: { imageAvailability: mocks.imageAvailability },
}))
vi.mock('../../../../store/useGenerationStore', () => ({
  useGenerationStore: { setState: mocks.setState },
}))
vi.mock('../../../../components/LazyThumbnail', () => ({
  LazyThumbnail: ({ src, alt, onError, containerRef: _containerRef, ...props }: any) => <img src={src} alt={alt} onError={onError} {...props} />,
}))

const imageUrl = 'http://localhost:8188/view?filename=trial.png&subfolder=tests&type=temp&t=1'
const identity = { filename: 'trial.png', subfolder: 'tests', type: 'temp' }

function renderGallery(overrides: Record<string, unknown> = {}) {
  const state = {
    thumbnailTab: 'history', setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(),
    previewAutoFollow: false, handleToggleAutoFollow: vi.fn(), filterOwnSession: false,
    setFilterOwnSession: vi.fn(), sortedDisplayImages: [imageUrl], otherSessionCount: 0,
    isMultiSelectMode: false, selectedIds: new Set(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: vi.fn(() => false),
    selectedImg: imageUrl, getSetNameForImage: vi.fn(() => null), sortedSnapshots: [], ...overrides,
  }
  return render(<GenerationGallerySection
    state={state as any}
    gallery={{
      scrollContainerRef: { current: null }, handleWheelScroll: vi.fn(),
      getThumbnailItemProps: () => ({ onClick: mocks.rowClick }), handleSnapshotClick: vi.fn(),
    } as any}
  />)
}

describe('GenerationGallerySection REQ-333-T31', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.imageAvailability.mockResolvedValue({ availability: 'present' })
  })
  afterEach(() => vi.restoreAllMocks())

  it('probes only the original identity after a thumbnail error and keeps the selected row when present', async () => {
    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener('comfy-image-availability', listener)
    renderGallery()
    fireEvent.error(screen.getByAltText('Generated 1'))

    await waitFor(() => expect(mocks.imageAvailability).toHaveBeenCalledWith(identity))
    expect(mocks.imageAvailability).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('Generated 1')).toHaveAttribute('src', expect.stringContaining('/api/comfy/thumbnail?'))
    expect(screen.getByText(/サムネイル再試行/)).toBeInTheDocument()
    expect(mocks.setState).not.toHaveBeenCalled()
    expect(events.at(-1)?.detail).toEqual({ url: imageUrl, availability: 'present' })
    window.removeEventListener('comfy-image-availability', listener)
  })

  it('keeps image on availability failure and reports unknown without removing history', async () => {
    mocks.imageAvailability.mockRejectedValue(new Error('503'))
    const eventListener = vi.fn()
    window.addEventListener('comfy-image-availability', eventListener)
    renderGallery()
    fireEvent.error(screen.getByAltText('Generated 1'))

    await waitFor(() => expect(eventListener).toHaveBeenCalled())
    expect(screen.getByAltText('Generated 1')).toBeInTheDocument()
    expect(mocks.setState).not.toHaveBeenCalled()
    expect((eventListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ url: imageUrl, availability: 'unknown' })
    window.removeEventListener('comfy-image-availability', eventListener)
  })

  it('removes trial history only for confirmed original missing and emits the agreed event', async () => {
    mocks.imageAvailability.mockResolvedValue({ availability: 'missing' })
    const eventListener = vi.fn()
    window.addEventListener('comfy-image-availability', eventListener)
    renderGallery()
    fireEvent.error(screen.getByAltText('Generated 1'))

    await waitFor(() => expect(mocks.setState).toHaveBeenCalledTimes(1))
    const update = mocks.setState.mock.calls[0][0]({ comfyHistoryImages: [imageUrl], batchImages: [imageUrl] })
    expect(update).toEqual({ comfyHistoryImages: [], batchImages: [] })
    expect((eventListener.mock.calls[0][0] as CustomEvent).detail).toEqual({ url: imageUrl, availability: 'missing' })
    window.removeEventListener('comfy-image-availability', eventListener)
  })

  it('shares concurrent probes and does not repeat completed probes until explicit retry', async () => {
    let resolveProbe: ((value: { availability: 'unknown' }) => void) | undefined
    mocks.imageAvailability.mockReturnValue(new Promise((resolve) => { resolveProbe = resolve }))
    renderGallery()
    fireEvent.error(screen.getByAltText('Generated 1'))
    fireEvent.error(screen.getByAltText('Generated 1'))
    expect(mocks.imageAvailability).toHaveBeenCalledTimes(1)
    resolveProbe?.({ availability: 'unknown' })
    await waitFor(() => expect(screen.getByText(/サムネイル再試行/)).toBeInTheDocument())
    fireEvent.error(screen.getByAltText('Generated 1'))
    expect(mocks.imageAvailability).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText(/サムネイル再試行/))
    expect(mocks.rowClick).not.toHaveBeenCalled()
    expect(screen.getByAltText('Generated 1')).toHaveAttribute('src', expect.stringContaining('/api/comfy/thumbnail?'))
    fireEvent.error(screen.getByAltText('Generated 1'))
    await waitFor(() => expect(mocks.imageAvailability).toHaveBeenCalledTimes(2))
  })

  it('does not probe or mutate saved Snapshot images', () => {
    renderGallery({
      thumbnailTab: 'snapshots',
      sortedSnapshots: [{ id: 1, image_path: imageUrl, thumbnail_path: null, params: {} }],
    })
    expect(screen.getByAltText('Snapshot')).toBeInTheDocument()
    expect(mocks.imageAvailability).not.toHaveBeenCalled()
    expect(mocks.setState).not.toHaveBeenCalled()
  })
})
