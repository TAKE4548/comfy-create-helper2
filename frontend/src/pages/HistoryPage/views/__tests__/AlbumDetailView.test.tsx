import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Album } from '../../../../api/types'
import { AlbumDetailView, type AlbumDetailViewProps } from '../AlbumDetailView'

const album: Album = {
  id: 8,
  name: 'Portrait studies',
  created_at: '2026-10-01T00:00:00Z',
  items: [
    { snapshot_id: 11, sequence_order: 0, image_path: '/images/one.png', thumbnail_path: '/thumbs/one.png', created_at: '2026-10-02T00:00:00Z' },
    { snapshot_id: 12, sequence_order: 1, image_path: '/images/two.png', thumbnail_path: '/thumbs/two.png', created_at: '2026-10-02T00:00:00Z' },
  ],
}

function renderView(overrides: Partial<AlbumDetailViewProps> = {}) {
  const props: AlbumDetailViewProps = {
    album,
    sortedItems: album.items,
    visibleItems: album.items,
    sortCriterion: 'custom',
    sortDirection: 'asc',
    onSortCriterionChange: vi.fn(),
    onSortDirectionChange: vi.fn(),
    onBack: vi.fn(),
    onRename: vi.fn(),
    onItemDragEnd: vi.fn(),
    onOpenSpeechModal: vi.fn(),
    onOpenDeleteScopeModal: vi.fn(),
    onBulkDownload: vi.fn(),
    isDownloading: false,
    isDeletingItems: false,
    aspectRatioStyle: { aspectRatio: '2 / 3' },
    sentinelRef: createRef<HTMLDivElement>(),
    onItemClick: vi.fn(),
    isMultiSelectMode: false,
    selectedIds: new Set<number>(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onEnterMultiSelectMode: vi.fn(),
    onExitMultiSelectMode: vi.fn(),
    isSelected: () => false,
    getLongPressHandlers: () => ({
      onMouseDown: vi.fn(), onMouseUp: vi.fn(), onMouseLeave: vi.fn(),
      onTouchStart: vi.fn(), onTouchEnd: vi.fn(),
    }),
    ...overrides,
  }
  return { ...render(<AlbumDetailView {...props} />), props }
}

describe('AlbumDetailView REQ-334-T38', () => {
  it('keeps sort controls controlled and exposes drag handles in manual mode', () => {
    const { props, rerender } = renderView()
    expect(screen.getAllByRole('button', { name: '並び替えハンドル' })).toHaveLength(2)
    expect(document.querySelectorAll('[data-sortable-item]')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /登録日時/ }))
    fireEvent.click(screen.getByTitle('降順'))
    expect(props.onSortCriterionChange).toHaveBeenCalledWith('date')
    expect(props.onSortDirectionChange).toHaveBeenCalledWith('desc')
    rerender(<AlbumDetailView {...props} sortCriterion="date" />)
    expect(screen.queryByRole('button', { name: '並び替えハンドル' })).not.toBeInTheDocument()
  })

  it('disables sortable wrappers in multi-select mode and targets only selected IDs', () => {
    const { props } = renderView({ isMultiSelectMode: true, selectedIds: new Set([12]) })
    expect(screen.queryByRole('button', { name: '並び替えハンドル' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-sortable-item]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '一括ダウンロード' }))
    expect(props.onBulkDownload).toHaveBeenCalledWith([12], 'Portrait studies.zip')
    fireEvent.click(screen.getByRole('button', { name: '一括削除' }))
    expect(props.onOpenDeleteScopeModal).toHaveBeenCalledWith([12])
    expect(document.getElementById('album-item-card-12')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('shows selected snapshot identity accessibly with the green selection state', () => {
    renderView({
      isMultiSelectMode: true,
      selectedIds: new Set([12]),
      isSelected: (id) => id === 12,
    })

    expect(screen.getByRole('group', { name: 'Snapshot 12、選択済み' })).toBeInTheDocument()
    expect(screen.getByAltText('Snapshot 12')).toBeInTheDocument()
    expect(screen.getByText('1 /', { exact: false })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '並び替えハンドル' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-sortable-item]')).toBeNull()
    expect(document.getElementById('album-item-card-12')?.className).toContain('border-accent-green')
  })

  it('forwards the original snapshot identity and paths to the speech editor', () => {
    const { props } = renderView()
    fireEvent.click(document.getElementById('item-speech-edit-11')!)
    expect(props.onOpenSpeechModal).toHaveBeenCalledWith({
      id: 11,
      workflow_id: 0,
      image_path: '/images/one.png',
      thumbnail_path: '/thumbs/one.png',
      created_at: '2026-10-02T00:00:00Z',
    })
  })

  it('shows a drag ghost and destination marker while reordering in manual mode', async () => {
    const { props, unmount } = renderView()
    const first = document.querySelector('[data-sortable-item="11"]') as HTMLElement
    const second = document.querySelector('[data-sortable-item="12"]') as HTMLElement
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100))
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 0, 100, 100))

    await act(async () => {
      fireEvent.mouseDown(first, { button: 0, clientX: 20, clientY: 20 })
      fireEvent.mouseMove(document, { clientX: 30, clientY: 30 })
      fireEvent.mouseMove(document, { clientX: 160, clientY: 50 })
    })

    expect(document.querySelector('[data-drop-marker="true"]')).toBe(second.querySelector('[id="album-item-card-12"]'))
    expect(document.querySelector('.opacity-90.scale-105')).not.toBeNull()
    await act(async () => {
      fireEvent.mouseUp(document, { button: 0, clientX: 160, clientY: 50 })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(props.onItemDragEnd).toHaveBeenCalledWith(11, 12)
    unmount()
  })
})
