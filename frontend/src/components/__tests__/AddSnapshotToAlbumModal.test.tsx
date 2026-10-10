import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddSnapshotToAlbumModal } from '../AddSnapshotToAlbumModal'
import { BubbleSaveExportBar } from '../SpeechBubbleEditorModal/sections/BubbleSaveExportBar'
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

  it('uses the accessible common sheet dialog and keeps interactive targets at least 44px tall', async () => {
    renderModal({ title: '履歴をアルバムへ追加' })

    const dialog = screen.getByRole('dialog', { name: '履歴をアルバムへ追加' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('max-w-full')
    expect(dialog.className).toContain('md:max-w-[min(90vw,36.25rem)]')
    expect(dialog.querySelector('div[aria-hidden="true"]')).toHaveClass('md:hidden')

    const selector = screen.getByRole('button', { name: /アルバムを選択しない/ })
    expect(selector).toHaveClass('min-h-11')
    fireEvent.click(selector)
    expect(screen.getAllByRole('button', { name: 'アルバムを選択しない (None)' })[1]).toHaveClass('min-h-11')
    const createAlbumButton = screen.getByRole('button', { name: /新規アルバム作成/ })
    expect(createAlbumButton).toHaveClass('min-h-11')
    expect(createAlbumButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(createAlbumButton).not.toHaveTextContent(/^\s*\+/)
    expect(await screen.findByRole('button', { name: 'Album 1' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: '保存' })).toHaveClass('min-h-11')
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

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith({ albumId: 1, newAlbumName: undefined })
      expect(localStorage.getItem(TEST_STORAGE_KEY)).toBe('1')
    })
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

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith({ albumId: null, newAlbumName: undefined })
      expect(localStorage.getItem(TEST_STORAGE_KEY)).toBe('')
    })
  })

  it('filters existing albums inline and adds the typed new album through onConfirm', async () => {
    renderModal({ allowNone: false, storageKey: TEST_STORAGE_KEY })
    fireEvent.click(screen.getByRole('button', { name: /新規アルバム作成/ }))
    fireEvent.change(screen.getByPlaceholderText('アルバム名を検索...'), { target: { value: 'Album 2' } })
    expect(await screen.findByRole('button', { name: 'Album 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Album 1' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('新規アルバム名'), { target: { value: '  New Collection  ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mockOnConfirm).toHaveBeenCalledWith({ albumId: null, newAlbumName: 'New Collection' }))
    expect(localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()
  })

  it('keeps the new-album draft on submission error and prevents duplicate pending submits', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('追加に失敗しました'))
    renderModal({ allowNone: false, onConfirm })
    fireEvent.click(screen.getByRole('button', { name: /新規アルバム作成/ }))
    const nameField = screen.getByLabelText('新規アルバム名')
    fireEvent.change(nameField, { target: { value: 'Retry Me' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('追加に失敗しました')
    expect(nameField).toHaveValue('Retry Me')
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('disables confirmation and closing while the parent reports pending work', () => {
    renderModal({ isPending: true })
    expect(document.getElementById('confirm-add-album-modal-btn')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled()
    fireEvent.click(document.getElementById('confirm-add-album-modal-btn')!)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })
})

describe('BubbleSaveExportBar album selection', () => {
  it('keeps the native new-album option value and callbacks without a plus decorator', () => {
    const setTargetAlbumId = vi.fn()
    const onSave = vi.fn()
    render(
      <BubbleSaveExportBar
        saveMode="new"
        setSaveMode={vi.fn()}
        targetAlbumId="new"
        setTargetAlbumId={setTargetAlbumId}
        newAlbumName="Fresh album"
        setNewAlbumName={vi.fn()}
        albums={[]}
        isSaving={false}
        bubblesCount={1}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    )

    const albumSelect = screen.getByTestId('save-album-select')
    const createOption = screen.getByRole('option', { name: '新規アルバムを作成' })
    expect(createOption).toHaveValue('new')
    expect(createOption).not.toHaveTextContent('+')
    fireEvent.change(albumSelect, { target: { value: 'new' } })
    expect(setTargetAlbumId).toHaveBeenCalledWith('new')
    expect(screen.getByTestId('new-album-name-input')).toHaveValue('Fresh album')

    fireEvent.click(screen.getByTestId('speech-bubble-save-btn'))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
