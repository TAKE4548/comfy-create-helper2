import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddSnapshotToAlbumModal } from '../AddSnapshotToAlbumModal'
import { albumsApi } from '../../api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/client', () => ({
  albumsApi: {
    list: vi.fn(),
  },
}))

describe('AddSnapshotToAlbumModal', () => {
  let queryClient: QueryClient
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()
  const TEST_STORAGE_KEY = 'test-last-save-album-id'

  const mockAlbums = [
    { id: 1, name: 'Album 1', description: '', created_at: '', updated_at: '', snapshot_count: 5, cover_snapshot: null },
    { id: 2, name: 'Album 2', description: '', created_at: '', updated_at: '', snapshot_count: 3, cover_snapshot: null },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.mocked(albumsApi.list).mockResolvedValue(mockAlbums as any)
  })

  const renderModal = (props: Partial<React.ComponentProps<typeof AddSnapshotToAlbumModal>> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AddSnapshotToAlbumModal
          isOpen={true}
          onClose={mockOnClose}
          onConfirm={mockOnConfirm}
          allowNone={true}
          {...props}
        />
      </QueryClientProvider>
    )
  }

  it('renders default selection as None when allowNone is true and no storageKey is set', async () => {
    renderModal()
    expect(screen.getByText('アルバムを選択しない (None)')).toBeDefined()
  })

  it('restores saved album ID from localStorage when storageKey is provided and album exists', async () => {
    localStorage.setItem(TEST_STORAGE_KEY, '2')
    renderModal({ storageKey: TEST_STORAGE_KEY })

    await waitFor(() => {
      expect(screen.getByText('Album 2')).toBeDefined()
    })
  })

  it('falls back to None if saved album ID does not exist in albums list', async () => {
    localStorage.setItem(TEST_STORAGE_KEY, '999')
    renderModal({ storageKey: TEST_STORAGE_KEY })

    await waitFor(() => {
      expect(screen.getByText('アルバムを選択しない (None)')).toBeDefined()
    })
  })

  it('falls back to Create New Album if saved album ID does not exist and allowNone is false', async () => {
    localStorage.setItem(TEST_STORAGE_KEY, '999')
    renderModal({ storageKey: TEST_STORAGE_KEY, allowNone: false })

    await waitFor(() => {
      expect(screen.getByText('新規アルバム作成 (Create New Album)')).toBeDefined()
    })
  })

  it('persists selected album ID to localStorage on confirm', async () => {
    renderModal({ storageKey: TEST_STORAGE_KEY })

    // Open dropdown
    const trigger = screen.getByRole('button', { name: /アルバムを選択しない/ })
    fireEvent.click(trigger)

    // Select Album 1
    const album1Btn = await screen.findByRole('button', { name: 'Album 1' })
    fireEvent.click(album1Btn)

    // Confirm
    const confirmBtn = screen.getByRole('button', { name: '保存' })
    fireEvent.click(confirmBtn)

    expect(mockOnConfirm).toHaveBeenCalledWith({
      albumId: 1,
      newAlbumName: undefined,
    })
    expect(localStorage.getItem(TEST_STORAGE_KEY)).toBe('1')
  })

  it('persists empty string to localStorage on confirm when None is selected', async () => {
    localStorage.setItem(TEST_STORAGE_KEY, '1')
    renderModal({ storageKey: TEST_STORAGE_KEY })

    await waitFor(() => {
      expect(screen.getByText('Album 1')).toBeDefined()
    })

    // Open dropdown and select None
    const trigger = screen.getByRole('button', { name: /Album 1/ })
    fireEvent.click(trigger)

    const noneBtn = screen.getByRole('button', { name: 'アルバムを選択しない (None)' })
    fireEvent.click(noneBtn)

    // Confirm
    const confirmBtn = screen.getByRole('button', { name: '保存' })
    fireEvent.click(confirmBtn)

    expect(mockOnConfirm).toHaveBeenCalledWith({
      albumId: null,
      newAlbumName: undefined,
    })
    expect(localStorage.getItem(TEST_STORAGE_KEY)).toBe('')
  })
})
