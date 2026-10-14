import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'
import { GenerationGallerySection } from '../GenerationGallerySection'

const url = '/view?filename=trial.png&subfolder=tests&type=temp&t=1'
vi.mock('../../../../components/LazyThumbnail', () => ({ LazyThumbnail: ({ src, alt, containerRef: _containerRef, ...props }: any) => <img src={src} alt={alt} {...props} /> }))
const controller = (probe: any = async () => ({ availability: 'present' })) => createTrialAvailabilityController(probe)

function gallery(trialAvailability: any, overrides: any = {}) {
  const rowClick = vi.fn(), longPress = vi.fn(), keyDown = vi.fn(), retry = vi.fn()
  const state = {
    thumbnailTab: 'history', setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(), previewAutoFollow: false,
    handleToggleAutoFollow: vi.fn(), filterOwnSession: false, setFilterOwnSession: vi.fn(), sortedDisplayImages: [url],
    otherSessionCount: 0, isMultiSelectMode: false, selectedIds: new Set(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: vi.fn(() => false), selectedImg: url,
    getSetNameForImage: vi.fn(() => null), sortedSnapshots: [], trialAvailability, residualHistoryStatus: 'complete',
    retryResidualHistory: retry, ...overrides,
  }
  const view = render(<GenerationGallerySection state={state as any} gallery={{ scrollContainerRef: { current: null },
    handleWheelScroll: vi.fn(), getThumbnailItemProps: () => ({ onClick: rowClick, onTouchStart: longPress, onKeyDown: keyDown }),
    handleSnapshotClick: vi.fn() } as any} />)
  return { ...view, rowClick, longPress, keyDown, retry }
}

describe('GenerationGallerySection REQ-345-T4', () => {
  it('uses cached present status after successful thumbnail load', () => {
    const probe = vi.fn(async () => ({ availability: 'present' as const })), c = controller(probe)
    c.adopt(url, 'present')
    const { rowClick } = gallery(c)
    fireEvent.load(screen.getByAltText('Generated 1'))
    fireEvent.click(screen.getByAltText('Generated 1').closest('button')!)
    expect(probe).not.toHaveBeenCalled(); expect(rowClick).toHaveBeenCalledOnce()
  })

  it('blocks checking interactions and confirms missing without retry', async () => {
    let resolve!: (value: { availability: 'missing' }) => void
    const c = controller(() => new Promise((r) => { resolve = r }))
    const { rowClick, longPress, keyDown } = gallery(c), row = screen.getByAltText('Generated 1').closest('button')!
    fireEvent.load(screen.getByAltText('Generated 1')); expect(row).toBeDisabled()
    fireEvent.click(row); fireEvent.touchStart(row); fireEvent.keyDown(row, { key: 'Enter' })
    expect(rowClick).not.toHaveBeenCalled(); expect(longPress).not.toHaveBeenCalled(); expect(keyDown).not.toHaveBeenCalled()
    await act(async () => { resolve({ availability: 'missing' }) })
    await waitFor(() => expect(screen.getByText('原画が見つかりません')).toBeInTheDocument())
    fireEvent.load(screen.getByAltText('Generated 1'))
    expect(screen.getByText('原画が見つかりません')).toBeInTheDocument()
    expect(screen.queryByText(/再試行/)).not.toBeInTheDocument()
  })

  it('keeps unknown selectable, retries explicitly, and isolates residual retry', async () => {
    const probe = vi.fn().mockResolvedValueOnce({ availability: 'unknown' }).mockResolvedValueOnce({ availability: 'present' })
    const c = controller(probe), { rowClick, retry } = gallery(c, { residualHistoryStatus: 'error' })
    fireEvent.load(screen.getByAltText('Generated 1'))
    await waitFor(() => expect(screen.getByText('原画を再確認')).toBeInTheDocument())
    expect(screen.getByAltText('Generated 1').closest('button')).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '再試行' })); expect(retry).toHaveBeenCalledOnce()
    await act(async () => { fireEvent.click(screen.getByText('原画を再確認')) })
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2))
    expect(rowClick).not.toHaveBeenCalled(); expect(screen.getByText('履歴の追加確認に失敗')).toBeInTheDocument()
  })

  it('shares a pending probe across owners and leaves Snapshot images unregistered', () => {
    const probe = vi.fn(() => new Promise(() => {})), c = controller(probe), observe = vi.spyOn(c, 'observe')
    const first = gallery(c); fireEvent.load(screen.getByAltText('Generated 1'))
    const second = gallery(c); fireEvent.load(screen.getAllByAltText('Generated 1')[1])
    expect(observe).toHaveBeenCalledTimes(2); expect(probe).toHaveBeenCalledOnce(); first.unmount()
    second.unmount(); c.dispose()
    const snapshotController = controller(), snapshotObserve = vi.spyOn(snapshotController, 'observe')
    gallery(snapshotController, { thumbnailTab: 'snapshots', sortedSnapshots: [{ id: 1, image_path: url, params: {} }] })
    expect(screen.getByAltText('Snapshot')).toBeInTheDocument(); expect(snapshotObserve).not.toHaveBeenCalled()
  })
})
