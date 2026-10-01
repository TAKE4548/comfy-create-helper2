import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAlbumDndOrder } from '../useAlbumDndOrder'
import type { AlbumItem } from '../../../../api/types'

describe('useAlbumDndOrder', () => {
  const mockItems: AlbumItem[] = [
    { id: 1, album_id: 10, snapshot_id: 101, position: 0, added_at: '2026-01-01' },
    { id: 2, album_id: 10, snapshot_id: 102, position: 1, added_at: '2026-01-01' },
    { id: 3, album_id: 10, snapshot_id: 103, position: 2, added_at: '2026-01-01' },
    { id: 4, album_id: 10, snapshot_id: 104, position: 3, added_at: '2026-01-01' },
  ]

  it('does nothing if albumId is null', () => {
    const onUpdateOrder = vi.fn()
    const { result } = renderHook(() =>
      useAlbumDndOrder({
        albumId: null,
        sortedAlbumItems: mockItems,
        sortDirection: 'asc',
        multiSelect: { isMultiSelectMode: false, selectedIds: new Set() },
        onUpdateOrder,
      })
    )

    act(() => {
      result.current.handleAlbumItemDragEnd(101, 103)
    })

    expect(onUpdateOrder).not.toHaveBeenCalled()
  })

  it('handles single item drag and drop in asc order', () => {
    const onUpdateOrder = vi.fn()
    const { result } = renderHook(() =>
      useAlbumDndOrder({
        albumId: 10,
        sortedAlbumItems: mockItems,
        sortDirection: 'asc',
        multiSelect: { isMultiSelectMode: false, selectedIds: new Set() },
        onUpdateOrder,
      })
    )

    // Move 101 (index 0) to 103 (index 2) -> [102, 103, 101, 104]
    act(() => {
      result.current.handleAlbumItemDragEnd(101, 103)
    })

    expect(onUpdateOrder).toHaveBeenCalledWith({
      id: 10,
      snapshotIds: [102, 103, 101, 104],
    })
  })

  it('handles single item drag and drop in desc order (reverses snapshotIds)', () => {
    const onUpdateOrder = vi.fn()
    const { result } = renderHook(() =>
      useAlbumDndOrder({
        albumId: 10,
        sortedAlbumItems: mockItems,
        sortDirection: 'desc',
        multiSelect: { isMultiSelectMode: false, selectedIds: new Set() },
        onUpdateOrder,
      })
    )

    // Move 101 (index 0) to 103 (index 2) -> in asc it would be [102, 103, 101, 104], desc reverses it
    act(() => {
      result.current.handleAlbumItemDragEnd(101, 103)
    })

    expect(onUpdateOrder).toHaveBeenCalledWith({
      id: 10,
      snapshotIds: [104, 101, 103, 102],
    })
  })

  it('handles multi-select group move downwards', () => {
    const onUpdateOrder = vi.fn()
    const { result } = renderHook(() =>
      useAlbumDndOrder({
        albumId: 10,
        sortedAlbumItems: mockItems,
        sortDirection: 'asc',
        multiSelect: {
          isMultiSelectMode: true,
          selectedIds: new Set([101, 102]),
        },
        onUpdateOrder,
      })
    )

    // activeId = 101 (in selected, size > 1), overId = 104
    // nonSelected: [103, 104]. overIndexInNonSelected = 1 (104).
    // activeIndexInSorted(0) < overIndexInSorted(3) -> insertAt = overIndexInNonSelected + 1 = 2
    // newItems: nonSelected.slice(0, 2) + selected + nonSelected.slice(2) -> [103, 104, 101, 102]
    act(() => {
      result.current.handleAlbumItemDragEnd(101, 104)
    })

    expect(onUpdateOrder).toHaveBeenCalledWith({
      id: 10,
      snapshotIds: [103, 104, 101, 102],
    })
  })

  it('handles multi-select group move upwards', () => {
    const onUpdateOrder = vi.fn()
    const { result } = renderHook(() =>
      useAlbumDndOrder({
        albumId: 10,
        sortedAlbumItems: mockItems,
        sortDirection: 'asc',
        multiSelect: {
          isMultiSelectMode: true,
          selectedIds: new Set([103, 104]),
        },
        onUpdateOrder,
      })
    )

    // activeId = 103, overId = 101
    // nonSelected: [101, 102]. overIndexInNonSelected = 0 (101).
    // activeIndexInSorted(2) >= overIndexInSorted(0) -> insertAt = overIndexInNonSelected = 0
    // newItems: [103, 104, 101, 102]
    act(() => {
      result.current.handleAlbumItemDragEnd(103, 101)
    })

    expect(onUpdateOrder).toHaveBeenCalledWith({
      id: 10,
      snapshotIds: [103, 104, 101, 102],
    })
  })
})
