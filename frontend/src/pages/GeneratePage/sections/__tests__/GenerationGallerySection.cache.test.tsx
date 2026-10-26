import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'
import { GenerationGallerySection } from '../GenerationGallerySection'
import { useGalleryInteraction } from '../../hooks/useGalleryInteraction'

const url = '/view?filename=trial.png&subfolder=tests&type=temp&t=1'
vi.mock('../../../../components/LazyThumbnail', () => ({ LazyThumbnail: ({ src, alt, containerRef: _containerRef, ...props }: any) => <img src={src} alt={alt} {...props} /> }))
const controller = (probe: any = async () => ({ availability: 'present' })) => createTrialAvailabilityController(probe)

function gallery(trialAvailability: any, overrides: any = {}, isMobile = false) {
  const rowClick = vi.fn(), longPress = vi.fn(), keyDown = vi.fn(), retry = vi.fn()
  const state = {
    thumbnailTab: 'history', setThumbnailTab: vi.fn(), sortOrder: 'desc', setSortOrder: vi.fn(), previewAutoFollow: false,
    handleToggleAutoFollow: vi.fn(), filterOwnSession: false, setFilterOwnSession: vi.fn(), sortedDisplayImages: [url],
    otherSessionCount: 0, isMultiSelectMode: false, selectedIds: new Set(), selectAll: vi.fn(), clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(), exitMultiSelectMode: vi.fn(), isSelected: vi.fn(() => false), selectedImg: url,
    getSetNameForImage: vi.fn(() => null), sortedSnapshots: [], trialAvailability, residualHistoryStatus: 'complete',
    retryResidualHistory: retry, ...overrides,
  }
  const view = render(<GenerationGallerySection state={state as any} isMobile={isMobile} gallery={{ scrollContainerRef: { current: null },
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

  it('does not trigger probe on thumbnail load (zero probe) and blocks interaction if status is missing', () => {
    const probe = vi.fn(), c = controller(probe)
    const { rowClick, longPress, keyDown } = gallery(c)
    const row = screen.getByAltText('Generated 1').closest('button')!
    fireEvent.load(screen.getByAltText('Generated 1'))
    expect(probe).not.toHaveBeenCalled()
    expect(row).not.toBeDisabled()

    act(() => {
      c.adopt(url, 'missing')
    })
    const view2 = gallery(c)
    const missingRow = screen.getAllByAltText('Generated 1')[1].closest('button')!
    expect(missingRow).toBeDisabled()
    fireEvent.click(missingRow); fireEvent.touchStart(missingRow); fireEvent.keyDown(missingRow, { key: 'Enter' })
    expect(rowClick).not.toHaveBeenCalled(); expect(longPress).not.toHaveBeenCalled(); expect(keyDown).not.toHaveBeenCalled()
    expect(screen.queryByText('原画が見つかりません')).not.toBeInTheDocument()
    view2.unmount()
  })

  it('isolates residual retry and does not probe original availability on thumbnail load', () => {
    const probe = vi.fn()
    const c = controller(probe), { retry } = gallery(c, { residualHistoryStatus: 'error' })
    fireEvent.load(screen.getByAltText('Generated 1'))
    expect(probe).not.toHaveBeenCalled()
    expect(screen.getByAltText('Generated 1').closest('button')).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByText('履歴の追加確認に失敗')).toBeInTheDocument()
  })

  it('does not register observers or probe on load and leaves Snapshot images unregistered', () => {
    const probe = vi.fn(), c = controller(probe), observe = vi.spyOn(c, 'observe')
    const first = gallery(c); fireEvent.load(screen.getByAltText('Generated 1'))
    expect(observe).not.toHaveBeenCalled(); expect(probe).not.toHaveBeenCalled(); first.unmount()
    c.dispose()
    const snapshotController = controller(), snapshotObserve = vi.spyOn(snapshotController, 'observe')
    gallery(snapshotController, { thumbnailTab: 'snapshots', sortedSnapshots: [{ id: 1, image_path: url, params: {} }] })
    expect(screen.getByAltText('Snapshot')).toBeInTheDocument(); expect(snapshotObserve).not.toHaveBeenCalled()
  })
})

describe('GenerationGallerySection REQ-372', () => {
  it('[REQ-372/AC-2] renders 3-column vertical grid container and square thumbnails on mobile', () => {
    const c = controller()
    const { container } = gallery(c, {}, true)
    const gridContainer = container.querySelector('#thumb-mobile-0')?.parentElement
    expect(gridContainer).not.toBeNull()
    expect(gridContainer).toHaveClass('grid', 'grid-cols-3', 'gap-2', 'py-2', 'overflow-x-visible')
    expect(gridContainer).not.toHaveClass('overflow-x-auto')

    const thumbBtn = screen.getByRole('button', { name: 'Generated 1' })
    expect(thumbBtn).toHaveClass('w-full', 'aspect-square', 'rounded-lg')
    expect(thumbBtn).not.toHaveClass('w-12', 'h-12')
  })

  it('[REQ-372/AC-7] displays empty state and no fake images when history is empty', () => {
    const c = controller()
    gallery(c, { sortedDisplayImages: [] }, true)
    expect(screen.getByText('No history images found for this session.')).toBeInTheDocument()
    expect(screen.queryByAltText(/Generated/)).not.toBeInTheDocument()
  })

  it('[REQ-372/AC-8] renders previewAutoFollow toggle button with correct id and handles click', () => {
    const c = controller()
    const handleToggleAutoFollow = vi.fn()
    gallery(c, { previewAutoFollow: true, handleToggleAutoFollow }, true)
    const toggleBtn = screen.getByTestId ? screen.queryByTestId('preview-autofollow-toggle-mobile') : null
    const btn = toggleBtn || document.getElementById('preview-autofollow-toggle-mobile')
    expect(btn).not.toBeNull()
    fireEvent.click(btn!)
    expect(handleToggleAutoFollow).toHaveBeenCalledOnce()
  })

  it('[REQ-372/AC-10] protects multi-select mode so thumbnail tap toggles selection and does not trigger open modal preview', () => {
    const handleItemClick = vi.fn()
    const setSelectedImg = vi.fn()
    const onOpenModalPreview = vi.fn()

    // Test hook behavior directly to verify AC-10 multi-select protection contract
    const { result } = renderHook(() =>
      useGalleryInteraction({
        isMobile: true,
        selectedImg: null,
        setSelectedImg,
        multiSelect: {
          isMultiSelectMode: true,
          selectedIds: new Set([url]),
          handleItemClick,
          getLongPressHandlers: () => ({} as any),
        } as any,
        onOpenModalPreview,
      })
    )

    const fakeEvent = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent

    result.current.handleThumbnailClick(url, 0, fakeEvent)

    expect(handleItemClick).toHaveBeenCalledWith(url, fakeEvent)
    expect(setSelectedImg).not.toHaveBeenCalled()
    expect(onOpenModalPreview).not.toHaveBeenCalled()
  })
})

describe('GenerationGallerySection REQ-383', () => {
  it('[REQ-383/AC-1] does not render sort order toggle button in desktop history toolbar', () => {
    const c = controller()
    gallery(c, {}, false)
    expect(screen.queryByText('新しい順')).not.toBeInTheDocument()
    expect(screen.queryByText('古い順')).not.toBeInTheDocument()
  })

  it('[REQ-383/AC-7] triggers onCenterPreviewImage and selects image on normal thumbnail click', () => {
    const handleItemClick = vi.fn()
    const setSelectedImg = vi.fn()
    const onCenterPreviewImage = vi.fn()

    const { result } = renderHook(() =>
      useGalleryInteraction({
        isMobile: false,
        selectedImg: null,
        setSelectedImg,
        onCenterPreviewImage,
        multiSelect: {
          isMultiSelectMode: false,
          selectedIds: new Set(),
          handleItemClick,
          getLongPressHandlers: () => ({} as any),
        } as any,
      })
    )

    const fakeEvent = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent

    result.current.handleThumbnailClick(url, 0, fakeEvent)

    expect(setSelectedImg).toHaveBeenCalledWith(url)
    expect(onCenterPreviewImage).toHaveBeenCalledWith(url)
  })

  it('[REQ-383/AC-8] does not trigger preview center scroll when clicking thumbnail in multi-select mode or with modifier keys', () => {
    const handleItemClick = vi.fn()
    const setSelectedImg = vi.fn()
    const onCenterPreviewImage = vi.fn()

    // 1. In multi-select mode without modifiers
    const { result: multiSelectHook } = renderHook(() =>
      useGalleryInteraction({
        isMobile: false,
        selectedImg: null,
        setSelectedImg,
        onCenterPreviewImage,
        multiSelect: {
          isMultiSelectMode: true,
          selectedIds: new Set([url]),
          handleItemClick,
          getLongPressHandlers: () => ({} as any),
        } as any,
      })
    )

    multiSelectHook.current.handleThumbnailClick(url, 0, {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent)

    expect(handleItemClick).toHaveBeenCalled()
    expect(setSelectedImg).not.toHaveBeenCalled()
    expect(onCenterPreviewImage).not.toHaveBeenCalled()

    // 2. In normal mode with ctrlKey
    handleItemClick.mockClear()
    setSelectedImg.mockClear()
    onCenterPreviewImage.mockClear()

    const { result: ctrlKeyHook } = renderHook(() =>
      useGalleryInteraction({
        isMobile: false,
        selectedImg: null,
        setSelectedImg,
        onCenterPreviewImage,
        multiSelect: {
          isMultiSelectMode: false,
          selectedIds: new Set(),
          handleItemClick,
          getLongPressHandlers: () => ({} as any),
        } as any,
      })
    )

    ctrlKeyHook.current.handleThumbnailClick(url, 0, {
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    } as React.MouseEvent)

    expect(handleItemClick).toHaveBeenCalled()
    expect(setSelectedImg).not.toHaveBeenCalled()
    expect(onCenterPreviewImage).not.toHaveBeenCalled()
  })

  it('[REQ-383/AC-13] preserves multi-select checkboxes, bulk save, clear selection, and snapshots tab operations', () => {
    const c = controller()
    const selectAll = vi.fn()
    const clearSelection = vi.fn()
    const setIsSaveModalOpen = vi.fn()
    const exitMultiSelectMode = vi.fn()
    const setThumbnailTab = vi.fn()
    const handleToggleAutoFollow = vi.fn()
    const setFilterOwnSession = vi.fn()

    const { rerender } = gallery(
      c,
      {
        isMultiSelectMode: true,
        selectedIds: new Set([url]),
        selectAll,
        clearSelection,
        setIsSaveModalOpen,
        exitMultiSelectMode,
        isSelected: (img: string) => img === url,
        setThumbnailTab,
        handleToggleAutoFollow,
        setFilterOwnSession,
      },
      false
    )

    // Checkboxes and multi-select bar rendered
    expect(screen.getByText('1枚選択中')).toBeInTheDocument()
    fireEvent.click(screen.getByText('すべて選択'))
    expect(selectAll).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByText('選択解除'))
    expect(clearSelection).toHaveBeenCalledOnce()

    const saveBtn = screen.getByRole('button', { name: '選択した 1 枚を保存' })
    expect(saveBtn).toBeInTheDocument()
    fireEvent.click(saveBtn)
    expect(setIsSaveModalOpen).toHaveBeenCalledWith(true)

    // Tab switching to snapshots
    const snapshotsTabBtn = screen.getByRole('button', { name: 'スナップショット (Snapshots)' })
    fireEvent.click(snapshotsTabBtn)
    expect(setThumbnailTab).toHaveBeenCalledWith('snapshots')

    // Preserves previewAutoFollow and session filter toggles
    const autoFollowBtn = document.getElementById('preview-autofollow-toggle-desktop')
    expect(autoFollowBtn).not.toBeNull()
    fireEvent.click(autoFollowBtn!)
    expect(handleToggleAutoFollow).toHaveBeenCalledOnce()

    const sessionFilter = document.getElementById('session-filter-toggle')
    expect(sessionFilter).not.toBeNull()
    fireEvent.click(sessionFilter!)
    expect(setFilterOwnSession).toHaveBeenCalled()
  })
})

