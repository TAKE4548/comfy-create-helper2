import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryPage } from '../HistoryPage'
import { albumsApi, snapshotsApi, workflowsApi, lorasApi, tagSetsApi } from '../../api/client'
import type { Album } from '../../api/types'


vi.mock('../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({}),
  },
  albumsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    reorder: vi.fn().mockResolvedValue({}),
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
  speechBatchApi: {
    getActiveJob: vi.fn().mockResolvedValue(null),
    getJob: vi.fn().mockResolvedValue(null),
  },
}))

let capturedOnDragEnd: ((event: any) => void) | null = null

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: any) => {
      capturedOnDragEnd = onDragEnd
      return <div data-testid="dnd-context">{children}</div>
    }
  }
})

vi.mock('../../components/SpeechBubbleEditorModal', () => ({
  SpeechBubbleEditorModal: ({ snapshot, onClose, onSaved }: any) => (
    <div data-testid="speech-bubble-modal">
      <div data-testid="modal-snapshot-id">{snapshot.id}</div>
      <button data-testid="modal-save-btn" onClick={() => onSaved()}>Save</button>
      <button data-testid="modal-close-btn" onClick={() => onClose()}>Close</button>
    </div>
  )
}))

vi.mock('../../components/BatchSpeechTransformModal', () => ({
  BatchSpeechTransformModal: ({ isOpen, onClose, onSaved }: any) => (
    isOpen ? (
      <div data-testid="batch-speech-transform-modal">
        <button data-testid="batch-modal-save-btn" onClick={() => onSaved?.()}>Save Batch</button>
        <button data-testid="batch-modal-close-btn" onClick={() => onClose()}>Close Batch</button>
      </div>
    ) : null
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
  } as unknown as Album


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

  it('renames an album from the album card in albums view', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    // Switch to Albums view
    const albumsTabBtn = screen.getByRole('button', { name: /albums/i })
    fireEvent.click(albumsTabBtn)

    // Find the edit button for the album
    const editBtn = await screen.findByRole('button', { name: /アルバム名を変更/i })
    fireEvent.click(editBtn)

    // Input should appear
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('Test Album')

    // Change input value and press Enter
    fireEvent.change(input, { target: { value: 'Renamed Test Album' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    // Verify albumsApi.update was called
    await waitFor(() => {
      expect(albumsApi.update).toHaveBeenCalledWith(10, { name: 'Renamed Test Album' })
    })
  })

  it('renames an album from the header in album detail view', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    // Switch to Albums view
    const albumsTabBtn = screen.getByRole('button', { name: /albums/i })
    fireEvent.click(albumsTabBtn)

    // Enter album detail
    const albumCard = await screen.findByText('Test Album')
    fireEvent.click(albumCard)

    // Find header edit button
    const editBtn = await screen.findByRole('button', { name: /アルバム名を変更/i })
    fireEvent.click(editBtn)

    // Input should appear in header
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('Test Album')

    // Change input value and click save button
    fireEvent.change(input, { target: { value: 'Header Renamed Album' } })
    const saveBtn = screen.getByTitle('保存')
    fireEvent.click(saveBtn)

    // Verify albumsApi.update was called
    await waitFor(() => {
      expect(albumsApi.update).toHaveBeenCalledWith(10, { name: 'Header Renamed Album' })
    })
  })

  it('renders snapshot cards with speech-edit, download, and delete badges always visible', async () => {
    vi.mocked(snapshotsApi.list).mockResolvedValue([
      {
        id: 501,
        workflow_id: 1,
        image_path: '/images/snap501.png',
        thumbnail_path: '/thumbs/snap501.png',
        created_at: '2026-08-18T00:00:00Z',
      }
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    const speechBtn = await screen.findByRole('button', { name: /セリフ編集・吹き出し追加/i })
    const downloadLink = screen.getByRole('link', { name: /ダウンロード/i })
    const deleteBtn = screen.getByRole('button', { name: /削除/i })

    expect(speechBtn).toBeInTheDocument()
    expect(speechBtn.id).toBe('snap-speech-edit-501')
    expect(downloadLink).toBeInTheDocument()
    expect(downloadLink.id).toBe('snap-download-501')
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn.id).toBe('snap-delete-501')
  })

  it('handles snapshot multi-select and bulk deletion with modal confirmation', async () => {
    vi.mocked(snapshotsApi.list).mockResolvedValue([
      { id: 1, workflow_id: 1, image_path: '/images/snap1.png', created_at: '2026-08-18T00:00:00Z' },
      { id: 2, workflow_id: 1, image_path: '/images/snap2.png', created_at: '2026-08-18T00:00:00Z' },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    const addAlbumBtn = await screen.findByRole('button', { name: /add to album/i })
    fireEvent.click(addAlbumBtn)

    const selectAllBtn = screen.getByRole('button', { name: /すべて選択/i })
    fireEvent.click(selectAllBtn)

    const bulkDeleteBtn = screen.getByRole('button', { name: /一括削除/i })
    fireEvent.click(bulkDeleteBtn)

    expect(screen.getByText(/スナップショットの一括削除/i)).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /削除する/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(snapshotsApi.delete).toHaveBeenCalledWith(1)
      expect(snapshotsApi.delete).toHaveBeenCalledWith(2)
    })
  })

  it('supports 2-axis sorting in album detail view (criterion and direction)', async () => {
    const multiItemAlbum = {
      id: 20,
      name: 'Sort Album',
      items: [
        { snapshot_id: 1, sequence_order: 1, created_at: '2026-08-18T01:00:00Z', image_path: '/images/1.png' },
        { snapshot_id: 2, sequence_order: 2, created_at: '2026-08-18T02:00:00Z', image_path: '/images/2.png' },
      ]
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([multiItemAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(multiItemAlbum)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('Sort Album')
    fireEvent.click(albumCard)

    const customSortBtn = await screen.findByRole('button', { name: /カスタム順/i })
    const dateSortBtn = screen.getByRole('button', { name: /登録日時/i })
    const ascBtn = screen.getByTitle('昇順')
    const descBtn = screen.getByTitle('降順')

    expect(customSortBtn).toBeInTheDocument()
    expect(dateSortBtn).toBeInTheDocument()
    expect(ascBtn).toBeInTheDocument()
    expect(descBtn).toBeInTheDocument()

    fireEvent.click(dateSortBtn)
    fireEvent.click(descBtn)
  })

  it('opens delete scope modal in album view when clicking delete badge and handles choices', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('Test Album')
    fireEvent.click(albumCard)

    const deleteBadge = await screen.findByRole('button', { name: /^削除$/i })
    expect(deleteBadge.id).toBe('item-delete-btn-101')
    fireEvent.click(deleteBadge)

    expect(screen.getByText(/アルバムからアイテムを削除/i)).toBeInTheDocument()

    const removeOnlyBtn = screen.getByText('アルバムから削除')
    fireEvent.click(removeOnlyBtn)

    await waitFor(() => {
      expect(albumsApi.deleteItems).toHaveBeenCalledWith(10, [101])
      expect(snapshotsApi.delete).not.toHaveBeenCalled()
    })
  })

  it('handles "元画像ごと完全に削除" from delete scope modal in album view', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('Test Album')
    fireEvent.click(albumCard)

    const deleteBadge = await screen.findByRole('button', { name: /^削除$/i })
    fireEvent.click(deleteBadge)

    const deleteAllBtn = screen.getByText('元画像ごと完全に削除')
    fireEvent.click(deleteAllBtn)

    await waitFor(() => {
      expect(albumsApi.deleteItems).toHaveBeenCalledWith(10, [101])
      expect(snapshotsApi.delete).toHaveBeenCalledWith(101)
    })
  })

  it('renders drag handles in album detail view when sorted by custom descending and hides them for date sorting', async () => {
    const multiItemAlbum = {
      id: 30,
      name: 'DnD Test Album',
      items: [
        { snapshot_id: 101, sequence_order: 0, created_at: '2026-08-18T01:00:00Z', image_path: '/images/101.png' },
        { snapshot_id: 102, sequence_order: 1, created_at: '2026-08-18T02:00:00Z', image_path: '/images/102.png' },
      ]
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([multiItemAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(multiItemAlbum)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('DnD Test Album')
    fireEvent.click(albumCard)

    // Initial state: custom + asc -> handles should be visible
    const handles = await screen.findAllByLabelText('並び替えハンドル')
    expect(handles).toHaveLength(2)

    // Switch to desc -> handles should still be visible (AC-1)
    const descBtn = screen.getByTitle('降順')
    fireEvent.click(descBtn)
    expect(screen.getAllByLabelText('並び替えハンドル')).toHaveLength(2)

    // Switch to date sort -> handles should NOT be visible
    const dateSortBtn = screen.getByRole('button', { name: /登録日時/i })
    fireEvent.click(dateSortBtn)
    expect(screen.queryByLabelText('並び替えハンドル')).not.toBeInTheDocument()

    // Switch back to custom sort -> handles should be visible again
    const customSortBtn = screen.getByRole('button', { name: /カスタム順/i })
    fireEvent.click(customSortBtn)
    expect(screen.getAllByLabelText('並び替えハンドル')).toHaveLength(2)
  })

  it('handles single item drag and drop reordering in custom desc mode (reverses order payload)', async () => {
    const multiItemAlbum = {
      id: 30,
      name: 'DnD Test Album',
      items: [
        { snapshot_id: 101, sequence_order: 0, created_at: '2026-08-18T01:00:00Z', image_path: '/images/101.png' },
        { snapshot_id: 102, sequence_order: 1, created_at: '2026-08-18T02:00:00Z', image_path: '/images/102.png' },
        { snapshot_id: 103, sequence_order: 2, created_at: '2026-08-18T03:00:00Z', image_path: '/images/103.png' },
      ]
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([multiItemAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(multiItemAlbum)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('DnD Test Album')
    fireEvent.click(albumCard)

    await screen.findAllByLabelText('並び替えハンドル')

    // Switch to desc (visible order on screen is 103, 102, 101)
    const descBtn = screen.getByTitle('降順')
    fireEvent.click(descBtn)

    // Drag item 101 (at index 2 on screen) to the top (over 103 at index 0)
    // Desired visual order: [101, 103, 102]
    // Sequence order ascending in DB should be: [102, 103, 101] (reversed from visual order)
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 101 },
        over: { id: 103 },
      })
    })

    await waitFor(() => {
      expect(albumsApi.updateOrder).toHaveBeenCalledWith(30, [102, 103, 101])
    })
  })

  it('handles multi-select group drag and drop reordering in custom desc mode (reverses order payload)', async () => {
    const multiItemAlbum = {
      id: 30,
      name: 'DnD Test Album',
      items: [
        { snapshot_id: 101, sequence_order: 0, created_at: '2026-08-18T01:00:00Z', image_path: '/images/101.png' },
        { snapshot_id: 102, sequence_order: 1, created_at: '2026-08-18T02:00:00Z', image_path: '/images/102.png' },
        { snapshot_id: 103, sequence_order: 2, created_at: '2026-08-18T03:00:00Z', image_path: '/images/103.png' },
        { snapshot_id: 104, sequence_order: 3, created_at: '2026-08-18T04:00:00Z', image_path: '/images/104.png' },
      ]
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([multiItemAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(multiItemAlbum)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('DnD Test Album')
    fireEvent.click(albumCard)

    await screen.findAllByLabelText('並び替えハンドル')

    // Switch to desc (visible order on screen: 104, 103, 102, 101)
    const descBtn = screen.getByTitle('降順')
    fireEvent.click(descBtn)

    // Enter multi-select mode
    const selectBtn = screen.getByRole('button', { name: /選択モード/i })
    fireEvent.click(selectBtn)

    // Select items 104 and 103
    const itemCard104 = document.getElementById('album-item-card-104')!
    const itemCard103 = document.getElementById('album-item-card-103')!
    expect(itemCard104).not.toBeNull()
    expect(itemCard103).not.toBeNull()
    fireEvent.click(itemCard104)
    fireEvent.click(itemCard103)

    // Drag selected group (active: 104) over non-selected item 101
    // nonSelected: [102, 101], selected: [104, 103]
    // activeIndex (0) < overIndex (3) -> insertAt = overIndexInNonSelected (1) + 1 = 2
    // newItems: [102, 101, 104, 103]
    // Reversed for desc: [103, 104, 101, 102]
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 104 },
        over: { id: 101 },
      })
    })

    await waitFor(() => {
      expect(albumsApi.updateOrder).toHaveBeenCalledWith(30, [103, 104, 101, 102])
    })
  })

  it('handles single item drag and drop reordering in custom asc mode (normal order payload)', async () => {
    const multiItemAlbum = {
      id: 30,
      name: 'DnD Test Album',
      items: [
        { snapshot_id: 101, sequence_order: 0, created_at: '2026-08-18T01:00:00Z', image_path: '/images/101.png' },
        { snapshot_id: 102, sequence_order: 1, created_at: '2026-08-18T02:00:00Z', image_path: '/images/102.png' },
      ]
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([multiItemAlbum])
    vi.mocked(albumsApi.get).mockResolvedValue(multiItemAlbum)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /albums/i }))
    const albumCard = await screen.findByText('DnD Test Album')
    fireEvent.click(albumCard)

    await screen.findAllByLabelText('並び替えハンドル')

    // In asc mode: drag 101 over 102
    // new order: [102, 101]
    act(() => {
      capturedOnDragEnd?.({
        active: { id: 101 },
        over: { id: 102 },
      })
    })

    await waitFor(() => {
      expect(albumsApi.updateOrder).toHaveBeenCalledWith(30, [102, 101])
    })
  })

  it('renders セリフ一括変換 button and opens BatchSpeechTransformModal when clicked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    const batchBtn = await screen.findByRole('button', { name: /セリフ一括変換/i })
    expect(batchBtn).toBeInTheDocument()

    expect(screen.queryByTestId('batch-speech-transform-modal')).not.toBeInTheDocument()

    fireEvent.click(batchBtn)

    expect(screen.getByTestId('batch-speech-transform-modal')).toBeInTheDocument()

    // Test close
    const closeBtn = screen.getByTestId('batch-modal-close-btn')
    fireEvent.click(closeBtn)

    expect(screen.queryByTestId('batch-speech-transform-modal')).not.toBeInTheDocument()
  })

  it('REQ-267: should render thumbnail with toThumbnailUrl fallback when ComfyUI direct URL is present', async () => {
    vi.mocked(snapshotsApi.list).mockResolvedValueOnce([
      {
        id: 999,
        workflow_id: 1,
        image_path: 'http://localhost:8188/view?filename=output_123.png',
        thumbnail_path: null,
        created_at: '2026-09-16T12:00:00Z',
      },
    ] as any)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    const img = await screen.findByAltText('Snapshot 999')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute(
      'src',
      '/api/comfy/thumbnail?filename=output_123.png'
    )
  })

  it('REQ-267: should preserve normal relative thumbnail path when present', async () => {
    vi.mocked(snapshotsApi.list).mockResolvedValueOnce([
      {
        id: 998,
        workflow_id: 1,
        image_path: '/api/snapshots/998/image',
        thumbnail_path: '/api/snapshots/998/thumbnail',
        created_at: '2026-09-16T12:00:00Z',
      },
    ] as any)

    render(
      <QueryClientProvider client={queryClient}>
        <HistoryPage />
      </QueryClientProvider>
    )

    const img = await screen.findByAltText('Snapshot 998')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/api/snapshots/998/thumbnail')
  })
})
