import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryPage } from '../HistoryPage'
import { albumsApi, snapshotsApi, workflowsApi, lorasApi, tagSetsApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({}),
  },
  albumsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    deleteItems: vi.fn().mockResolvedValue({}),
    updateOrder: vi.fn().mockResolvedValue({}),
  },
  workflowsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  lorasApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  tagSetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../components/SpeechBubbleEditorModal', () => ({
  SpeechBubbleEditorModal: ({ snapshot, onClose, onSaved }: any) => (
    <div data-testid="speech-bubble-modal">
      <div data-testid="modal-snapshot-id">{snapshot.id}</div>
      <button data-testid="modal-save-btn" onClick={() => onSaved()}>Save</button>
      <button data-testid="modal-close-btn" onClick={() => onClose()}>Close</button>
    </div>
  )
}))

describe('HistoryPage - Album Detail Speech Edit', () => {
  let queryClient: QueryClient

  const mockAlbum = {
    id: 10,
    name: 'Test Album',
    description: 'Album Description',
    item_count: 1,
    created_at: '2026-08-18T00:00:00Z',
    items: [
      {
        snapshot_id: 101,
        image_path: '/images/snap101.png',
        thumbnail_path: '/thumbs/snap101.png',
        created_at: '2026-08-18T01:00:00Z',
        order: 0,
      }
    ]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        }
      }
    })
    vi.mocked(albumsApi.list).mockResolvedValue([mockAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(mockAlbum)
    vi.mocked(snapshotsApi.list).mockResolvedValue([])
    vi.mocked(workflowsApi.list).mockResolvedValue([])
    vi.mocked(lorasApi.list).mockResolvedValue([])
    vi.mocked(tagSetsApi.list).mockResolvedValue([])
  })

  it('renders speech edit button in album detail view and opens modal on click', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    // Switch to Albums view
    const albumsTabBtn = screen.getByRole('button', { name: /albums/i })
    fireEvent.click(albumsTabBtn)

    // Click on the album card to enter album detail view
    const albumCard = await screen.findByText('Test Album')
    fireEvent.click(albumCard)

    // Check if speech edit button for item exists
    const speechBtn = await screen.findByRole('button', { name: /セリフ編集・吹き出し追加/i })
    expect(speechBtn).toBeInTheDocument()
    expect(speechBtn.id).toBe('item-speech-edit-101')

    // Click speech edit button
    fireEvent.click(speechBtn)

    // Verify modal is displayed with correct snapshot
    expect(screen.getByTestId('speech-bubble-modal')).toBeInTheDocument()
    expect(screen.getByTestId('modal-snapshot-id')).toHaveTextContent('101')
  })

  it('invalidates queries when modal onSaved is triggered', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    // Switch to Albums view
    const albumsTabBtn = screen.getByRole('button', { name: /albums/i })
    fireEvent.click(albumsTabBtn)

    // Click on the album card
    const albumCard = await screen.findByText('Test Album')
    fireEvent.click(albumCard)

    // Click speech edit button
    const speechBtn = await screen.findByRole('button', { name: /セリフ編集・吹き出し追加/i })
    fireEvent.click(speechBtn)

    // Click Save button in modal
    const saveBtn = screen.getByTestId('modal-save-btn')
    fireEvent.click(saveBtn)

    // Check invalidations
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['album', 10] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['albums'] })
  })
})
