/**
 * NT-2: HistoryPage – generateDraftApi prop 渡し確認テスト
 *
 * SpeechBubbleEditorModal をモック化し、selectedForSpeech がセットされた際に
 * generateDraftApi prop が undefined でないことをアサートする。
 */
import React from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Module mocks ──────────────────────────────────────────────────────────────

// SpeechBubbleEditorModal: capture props via spy
const mockSpeechBubbleEditorModal = vi.fn(() => null)
vi.mock('../../../components/SpeechBubbleEditorModal', () => ({
  SpeechBubbleEditorModal: (props: any) => {
    mockSpeechBubbleEditorModal(props)
    return null
  },
}))

// API client: all methods return minimal stubs so React Query doesn't throw
vi.mock('../../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([
      {
        id: 1,
        image_path: '/img/snap1.png',
        thumbnail_path: null,
        workflow_id: null,
        lora_id: null,
        tag_set_id: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]),
  },
  workflowsApi:   { list: vi.fn().mockResolvedValue([]) },
  lorasApi:       { list: vi.fn().mockResolvedValue([]) },
  tagSetsApi:     { list: vi.fn().mockResolvedValue([]) },
  albumsApi:      { list: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
  speechBatchApi: { getActiveJob: vi.fn().mockResolvedValue(null) },
}))

// SnapshotGalleryView: expose a simple button to trigger onOpenSpeechModal
vi.mock('../views/SnapshotGalleryView', () => ({
  SnapshotGalleryView: ({ onOpenSpeechModal }: { onOpenSpeechModal: (s: any) => void }) => (
    <button
      data-testid="open-speech-btn"
      onClick={() =>
        onOpenSpeechModal({
          id: 1,
          image_path: '/img/snap1.png',
          thumbnail_path: null,
          workflow_id: null,
          lora_id: null,
          tag_set_id: null,
          created_at: '2026-01-01T00:00:00Z',
        })
      }
    >
      Open Speech
    </button>
  ),
  toThumbnailUrl: (url: string) => url ?? '',
}))

// Other heavy sub-components – render nothing
vi.mock('../views/AlbumDetailView', () => ({ AlbumDetailView: () => null }))
vi.mock('../components/AlbumListView', () => ({ AlbumListView: () => null }))
vi.mock('../../../components/HistoryModalPreview', () => ({ HistoryModalPreview: () => null }))
vi.mock('../../../components/AddSnapshotToAlbumModal', () => ({ AddSnapshotToAlbumModal: () => null }))
vi.mock('../../../components/BatchSpeechTransformModal', () => ({ BatchSpeechTransformModal: () => null }))
vi.mock('../../../components/MultiSelectToolbar', () => ({ MultiSelectToolbar: () => null }))
vi.mock('../../../components/common/PageHeader', () => ({ PageHeader: () => null }))

// Internal hooks that call React Query
vi.mock('../hooks/useAlbumOperations', () => ({
  useAlbumOperations: () => ({
    albums: [],
    isLoadingAlbums: false,
    currentAlbum: null,
    selectedAlbumId: null,
    setSelectedAlbumId: vi.fn(),
    albumSortCriterion: 'custom',
    setAlbumSortCriterion: vi.fn(),
    albumSortDirection: 'asc',
    setAlbumSortDirection: vi.fn(),
    sortedAlbumItems: [],
    visibleAlbumItems: [],
    setAlbumItemLimit: vi.fn(),
    deleteAlbum:       { mutate: vi.fn(), isPending: false },
    updateAlbum:       { mutate: vi.fn(), isPending: false },
    updateAlbumOrder:  { mutate: vi.fn() },
    deleteAlbumItems:  { mutate: vi.fn(), isPending: false },
    addToAlbumMutation:{ mutate: vi.fn(), isPending: false },
    handleAlbumReorder: vi.fn(),
    handleBackToAlbums: vi.fn(),
  }),
}))

vi.mock('../hooks/useBulkDownload', () => ({
  useBulkDownload: () => ({ isDownloading: false, handleBulkDownload: vi.fn() }),
}))

vi.mock('../hooks/useAlbumDndOrder', () => ({
  useAlbumDndOrder: () => ({ handleAlbumItemDragEnd: vi.fn() }),
}))

vi.mock('../../../hooks/useThumbnailAspectRatio', () => ({
  useThumbnailAspectRatio: () => ({ aspectRatioStyle: { aspectRatio: '1/1' } }),
}))

vi.mock('../../../hooks/useMultiSelect', () => ({
  useMultiSelect: () => ({
    isMultiSelectMode: false,
    selectedIds: new Set<number>(),
    isSelected: vi.fn().mockReturnValue(false),
    getLongPressHandlers: vi.fn().mockReturnValue({}),
    handleItemClick: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    enterMultiSelectMode: vi.fn(),
    exitMultiSelectMode: vi.fn(),
  }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

import { HistoryPage } from '../index'

function renderWithQueryClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <HistoryPage />
    </QueryClientProvider>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HistoryPage – generateDraftApi prop (NT-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes generateDraftApi (non-undefined function) to SpeechBubbleEditorModal when selectedForSpeech is set', () => {
    renderWithQueryClient()

    // Click the trigger button exposed by the mocked SnapshotGalleryView
    fireEvent.click(screen.getByTestId('open-speech-btn'))

    // SpeechBubbleEditorModal mock must have been invoked
    expect(mockSpeechBubbleEditorModal).toHaveBeenCalled()

    // The first call's props must contain generateDraftApi as a function
    const receivedProps = mockSpeechBubbleEditorModal.mock.calls[0][0]
    expect(receivedProps.generateDraftApi).toBeDefined()
    expect(typeof receivedProps.generateDraftApi).toBe('function')
  })
})
