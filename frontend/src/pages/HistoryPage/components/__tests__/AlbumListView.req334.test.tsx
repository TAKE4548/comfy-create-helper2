import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AlbumListView } from '../AlbumListView'
import type { Album } from '../../../../api/types'

const dndMocks = vi.hoisted(() => ({
  handleMouseDown: vi.fn(),
  handleTouchStart: vi.fn(),
  handleKeyDown: vi.fn(),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragOver, onDragEnd }: any) => (
    <div>
      <button data-testid="mock-drag-start" onClick={() => onDragStart({ active: { id: 1 } })} />
      <button data-testid="mock-drag-over" onClick={() => onDragOver({ over: { id: 2 } })} />
      <button data-testid="mock-drag-end" onClick={() => onDragEnd({ active: { id: 1 }, over: { id: 2 } })} />
      {children}
    </div>
  ),
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  MouseSensor: {},
  TouchSensor: {},
  DragOverlay: ({ children }: any) => <>{children}</>,
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  rectSortingStrategy: {},
  useSortable: () => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: {
      onMouseDown: dndMocks.handleMouseDown,
      onTouchStart: dndMocks.handleTouchStart,
      onKeyDown: dndMocks.handleKeyDown,
    },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeAlbum(id: number, items: Album['items'] = [], description?: string | null): Album {
  return {
    id,
    name: `アルバム ${id}`,
    created_at: '2024-05-06T12:00:00',
    description,
    items,
  }
}

function renderAlbums(albums: Album[]) {
  const callbacks = {
    onSelectAlbum: vi.fn(),
    onDeleteAlbum: vi.fn(),
    onRenameAlbum: vi.fn(),
    onReorderAlbums: vi.fn(),
  }
  const view = render(<AlbumListView albums={albums} {...callbacks} />)
  return { ...view, callbacks }
}

describe('AlbumListView REQ-334', () => {
  it('shows empty, single-image, and stacked multi-image covers with album details', () => {
    renderAlbums([
      makeAlbum(1),
      makeAlbum(2, [{ snapshot_id: 20, sequence_order: 0, image_path: '/single.png' }], null),
      makeAlbum(
        3,
        [1, 2, 3, 4].map((id) => ({
          snapshot_id: id,
          sequence_order: id - 1,
          image_path: `/image-${id}.png`,
        })),
        '旅行の記録',
      ),
    ])

    expect(screen.getByTestId('album-cover-1')).toHaveTextContent('画像はありません')
    expect(screen.getByTestId('album-cover-image-2-0')).toHaveAttribute('src', '/single.png')
    expect(screen.getByTestId('album-cover-image-3-0')).toHaveAttribute('src', '/image-1.png')
    expect(screen.getByTestId('album-cover-image-3-2')).toHaveAttribute('src', '/image-3.png')
    expect(screen.getByText('旅行の記録')).toBeInTheDocument()
    expect(screen.getAllByText('未設定')).toHaveLength(2)
    expect(screen.getByText('4枚')).toBeInTheDocument()
    expect(screen.getByTestId('album-created-at-2')).toHaveTextContent('2024')
  })

  it('starts drag only from the dedicated handle and shows a drop marker before reorder', () => {
    const { callbacks } = renderAlbums([makeAlbum(1), makeAlbum(2)])
    const card = document.getElementById('album-card-1')!
    const handle = within(card).getByRole('button', { name: '並び替えハンドル' })

    fireEvent.mouseDown(card)
    expect(dndMocks.handleMouseDown).not.toHaveBeenCalled()
    fireEvent.mouseDown(handle)
    expect(dndMocks.handleMouseDown).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTestId('mock-drag-start'))
    expect(screen.getByTestId('album-drag-overlay-1')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mock-drag-over'))
    expect(screen.getByTestId('album-drop-marker-2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('mock-drag-end'))
    expect(callbacks.onReorderAlbums).toHaveBeenCalledWith(0, 1)
  })

  it('requires an inline named confirmation before deleting an album', () => {
    const { callbacks } = renderAlbums([makeAlbum(7, [
      { snapshot_id: 1, sequence_order: 0, image_path: '/one.png' },
      { snapshot_id: 2, sequence_order: 1, image_path: '/two.png' },
    ])])
    const card = document.getElementById('album-card-7')!

    fireEvent.click(within(card).getByRole('button', { name: 'アルバムを削除' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('アルバム 7')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2枚')
    expect(callbacks.onDeleteAlbum).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'アルバム 7 を削除' }))
    expect(callbacks.onDeleteAlbum).toHaveBeenCalledWith(7)
  })
})
