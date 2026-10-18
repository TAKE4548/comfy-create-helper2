import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GenerationGallerySection } from '../GenerationGallerySection'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'

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

const imageUrl = '/view?filename=trial.png&subfolder=tests&type=temp&t=1'
const identity = { filename: 'trial.png', subfolder: 'tests', type: 'temp' }

function renderGallery(overrides: Record<string, unknown> = {}) {
  const trialAvailability = createTrialAvailabilityController(mocks.imageAvailability)
  const state = {
    thumbnailTab: 'history', setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(),
    previewAutoFollow: false, handleToggleAutoFollow: vi.fn(), filterOwnSession: false,
    setFilterOwnSession: vi.fn(), sortedDisplayImages: [imageUrl], otherSessionCount: 0,
    isMultiSelectMode: false, selectedIds: new Set(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: vi.fn(() => false),
    selectedImg: imageUrl, getSetNameForImage: vi.fn(() => null), sortedSnapshots: [],
    trialAvailability, residualHistoryStatus: 'complete', retryResidualHistory: vi.fn(), ...overrides,
  }
  return { ...render(<GenerationGallerySection
    state={state as any}
    gallery={{
      scrollContainerRef: { current: null }, handleWheelScroll: vi.fn(),
      getThumbnailItemProps: () => ({ onClick: mocks.rowClick }), handleSnapshotClick: vi.fn(),
    } as any}
  />), trialAvailability }
}

describe('GenerationGallerySection REQ-379', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.imageAvailability.mockResolvedValue({ availability: 'present' })
  })
  afterEach(() => vi.restoreAllMocks())

  it('does not trigger image availability probe on thumbnail load [REQ-379/AC-1]', async () => {
    const { trialAvailability } = renderGallery()
    fireEvent.load(screen.getByAltText('Generated 1'))
    fireEvent.error(screen.getByAltText('Generated 1'))

    expect(mocks.imageAvailability).not.toHaveBeenCalled()
    expect(screen.getByAltText('Generated 1')).toHaveAttribute('src', expect.stringContaining('/api/comfy/thumbnail?'))
    expect(screen.getByText(/サムネイル再試行/)).toBeInTheDocument()
    expect(mocks.setState).not.toHaveBeenCalled()
    expect(trialAvailability.getStatus(imageUrl)).toBeUndefined()
  })

  it('retries thumbnail reload on retry click without probing ComfyUI [REQ-379/AC-1]', async () => {
    renderGallery()
    fireEvent.error(screen.getByAltText('Generated 1'))
    expect(screen.getByText(/サムネイル再試行/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/サムネイル再試行/))
    expect(mocks.imageAvailability).not.toHaveBeenCalled()
    expect(mocks.rowClick).not.toHaveBeenCalled()
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
