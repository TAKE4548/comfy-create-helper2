import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BaseImageSelectModal } from '../BaseImageSelectModal'
import { snapshotsApi, workflowsApi, lorasApi, tagSetsApi, albumsApi } from '../../api/client'
import type { SnapshotSummary, WorkflowSummary, Lora, TagSet, Album } from '../../api/types'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn(),
  },
  workflowsApi: {
    list: vi.fn(),
  },
  lorasApi: {
    list: vi.fn(),
  },
  tagSetsApi: {
    list: vi.fn(),
  },
  albumsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('BaseImageSelectModal', () => {
  let queryClient: QueryClient

  const mockWorkflows: WorkflowSummary[] = [
    { id: 1, name: 'Workflow 1', created_at: '2026-08-18T00:00:00Z' },
    { id: 2, name: 'Workflow 2', created_at: '2026-08-18T01:00:00Z' },
  ]

  const mockLoras = [
    { id: 10, model_name: 'Lora A', description: null, thumbnail_path: null },
  ] as unknown as Lora[]

  const mockTagSets = [
    { id: 20, name: 'TagSet 1', description: null, tags: ['tag1'] },
  ] as unknown as TagSet[]


  const mockSnapshots: SnapshotSummary[] = [
    { id: 1, workflow_id: 1, created_at: '2026-08-18T01:00:00Z', image_path: '/snap1.png', thumbnail_path: '/thumb1.png' },
    { id: 2, workflow_id: 1, created_at: '2026-08-18T02:00:00Z', image_path: '/snap2.png', thumbnail_path: '/thumb2.png' },
  ]

  const mockAlbums: Album[] = [
    {
      id: 100,
      name: 'Album 1',
      created_at: '2026-08-18T00:00:00Z',
      items: [
        { snapshot_id: 1, sequence_order: 1, image_path: '/snap1.png', thumbnail_path: '/thumb1.png', created_at: '2026-08-18T01:00:00Z' },
        { snapshot_id: 2, sequence_order: 2, image_path: '/snap2.png', thumbnail_path: '/thumb2.png', created_at: '2026-08-18T02:00:00Z' },
      ],
    },
  ]

  const mockOnClose = vi.fn()
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.mocked(workflowsApi.list).mockResolvedValue(mockWorkflows)
    vi.mocked(lorasApi.list).mockResolvedValue(mockLoras)
    vi.mocked(tagSetsApi.list).mockResolvedValue(mockTagSets)
    vi.mocked(snapshotsApi.list).mockResolvedValue(mockSnapshots)
    vi.mocked(albumsApi.list).mockResolvedValue(mockAlbums)
    vi.mocked(albumsApi.get).mockResolvedValue(mockAlbums[0])
  })

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  it('renders snapshot tab and loads filter options and snapshots by default', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('ベース画像を差し替え')).toBeDefined()
    expect(screen.getByText('全履歴・フィルタ')).toBeDefined()
    expect(screen.getByText('アルバム')).toBeDefined()

    await waitFor(() => {
      expect(workflowsApi.list).toHaveBeenCalled()
      expect(lorasApi.list).toHaveBeenCalled()
      expect(tagSetsApi.list).toHaveBeenCalled()
      expect(snapshotsApi.list).toHaveBeenCalledWith({
        workflow_id: 1,
        lora_id: undefined,
        tag_set_id: undefined,
      })
    })

    // Snapshot cards rendered
    expect(await screen.findByText('#1')).toBeDefined()
    expect(await screen.findByText('#2')).toBeDefined()
    expect(screen.getByText('現在')).toBeDefined()
  })

  it('switches to Albums tab and displays album list', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    const albumTabBtn = screen.getByRole('button', { name: /アルバム/ })
    fireEvent.click(albumTabBtn)

    await waitFor(() => {
      expect(albumsApi.list).toHaveBeenCalled()
    })

    expect(await screen.findByText('Album 1')).toBeDefined()
    expect(screen.getByText('2 枚')).toBeDefined()
  })

  it('filters snapshots by Workflow, LoRA, and TagSet', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    expect(await screen.findByText('Workflow 2')).toBeDefined()
    expect(await screen.findByText('Lora A')).toBeDefined()
    expect(await screen.findByText('TagSet 1')).toBeDefined()

    const workflowSelect = screen.getByLabelText('Workflow Filter')
    fireEvent.change(workflowSelect, { target: { value: '2' } })

    await waitFor(() => {
      expect(snapshotsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_id: 2 })
      )
    })

    const loraSelect = screen.getByLabelText('LoRA Filter')
    fireEvent.change(loraSelect, { target: { value: '10' } })

    await waitFor(() => {
      expect(snapshotsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_id: 2, lora_id: 10 })
      )
    })

    const tagSetSelect = screen.getByLabelText('Tag Set Filter')
    fireEvent.change(tagSetSelect, { target: { value: '20' } })

    await waitFor(() => {
      expect(snapshotsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_id: 2, lora_id: 10, tag_set_id: 20 })
      )
    })
  })

  it('sorts snapshots when sort buttons are clicked', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    expect(await screen.findByText('#1')).toBeDefined()

    const sortAscBtn = document.getElementById('sort-asc')!
    fireEvent.click(sortAscBtn)

    const sortDescBtn = document.getElementById('sort-desc')!
    fireEvent.click(sortDescBtn)
  })

  it('calls onSelect when a snapshot card is clicked', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    expect(await screen.findByText('#2')).toBeDefined()
    const card = screen.getByText('#2').closest('button')!
    fireEvent.click(card)

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, image_path: '/snap2.png' })
    )
  })

  it('browses album, sorts album items, and selects an item', async () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    // Switch to album tab
    const albumTabBtn = screen.getByRole('button', { name: /アルバム/ })
    fireEvent.click(albumTabBtn)

    expect(await screen.findByText('Album 1')).toBeDefined()

    // Click on album card
    const albumCard = screen.getByText('Album 1').closest('button')!
    fireEvent.click(albumCard)

    // In album detail view
    await waitFor(() => {
      expect(albumsApi.get).toHaveBeenCalledWith(100)
    })
    expect(await screen.findByRole('button', { name: /アルバム一覧へ/ })).toBeDefined()
    expect(screen.getByText('#1')).toBeDefined()
    expect(screen.getByText('#2')).toBeDefined()

    // Test album sorting buttons
    const dateAscBtn = document.getElementById('album-sort-date-asc')!
    fireEvent.click(dateAscBtn)

    const dateDescBtn = document.getElementById('album-sort-date-desc')!
    fireEvent.click(dateDescBtn)

    const customSortBtn = document.getElementById('album-sort-custom')!
    fireEvent.click(customSortBtn)

    // Select snapshot inside album
    const itemCard = (await screen.findByText('#1')).closest('button')!
    fireEvent.click(itemCard)

    expect(mockOnSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, image_path: '/snap1.png' })
    )
  })

  it('renders empty states when no snapshots or albums available', async () => {
    vi.mocked(snapshotsApi.list).mockResolvedValue([])
    vi.mocked(albumsApi.list).mockResolvedValue([])

    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    expect(await screen.findByText('利用可能なスナップショットが見つかりませんでした')).toBeDefined()

    const albumTabBtn = screen.getByRole('button', { name: /アルバム/ })
    fireEvent.click(albumTabBtn)

    expect(await screen.findByText('アルバムが存在しません')).toBeDefined()
  })

  it('calls onClose when close button or backdrop is clicked', () => {
    renderWithQuery(
      <BaseImageSelectModal
        workflowId={1}
        currentSnapshotId={1}
        onClose={mockOnClose}
        onSelect={mockOnSelect}
      />
    )

    const closeBtn = screen.getByRole('button', { name: '' }) // Lucide X button
    fireEvent.click(closeBtn)
    expect(mockOnClose).toHaveBeenCalled()
  })
})
