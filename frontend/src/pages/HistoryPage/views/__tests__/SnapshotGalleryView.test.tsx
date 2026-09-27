import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SnapshotGalleryView, toThumbnailUrl } from '../SnapshotGalleryView'
import type { SnapshotGalleryViewProps } from '../SnapshotGalleryView'
import type { SnapshotSummary } from '../../../../api/types'

describe('SnapshotGalleryView', () => {
  const mockSnapshots: SnapshotSummary[] = [
    {
      id: 1,
      image_path: '/images/snap1.png',
      thumbnail_path: '/thumbnails/snap1.webp',
      workflow_id: 10,
      lora_id: 20,
      tag_set_id: 30,
      created_at: '2026-09-27T10:00:00Z',
    },
    {
      id: 2,
      image_path: '/images/snap2.png',
      thumbnail_path: null,
      workflow_id: 10,
      lora_id: null,
      tag_set_id: null,
      created_at: '2026-09-27T11:00:00Z',
    },
  ]

  const mockWorkflows = [{ id: 10, name: 'Workflow A' }]
  const mockLoras = [{ id: 20, model_name: 'lora-a', description: 'LoRA A' }] as any
  const mockTagSets = [{ id: 30, name: 'TagSet A' }] as any

  const mockMultiSelect: any = {
    isMultiSelectMode: false,
    selectedIds: new Set<number>(),
    isSelected: vi.fn().mockReturnValue(false),
    getLongPressHandlers: vi.fn().mockReturnValue({}),
    handleItemClick: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    enterMultiSelectMode: vi.fn(),
    exitMultiSelectMode: vi.fn(),
  }

  const defaultProps: SnapshotGalleryViewProps = {
    snapshots: mockSnapshots,
    workflows: mockWorkflows,
    loras: mockLoras,
    tagSets: mockTagSets,
    selectedWorkflowId: null,
    setSelectedWorkflowId: vi.fn(),
    selectedLoraId: null,
    setSelectedLoraId: vi.fn(),
    selectedTagSetId: null,
    setSelectedTagSetId: vi.fn(),
    sortOrder: 'desc',
    setSortOrder: vi.fn(),
    snapshotLimit: 24,
    setSnapshotLimit: vi.fn(),
    aspectRatioStyle: { aspectRatio: '1 / 1' },
    multiSelect: mockMultiSelect,
    onOpenPreview: vi.fn(),
    onOpenSpeechModal: vi.fn(),
    onDeleteSnapshot: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders snapshot cards and filter counters correctly', () => {
    render(<SnapshotGalleryView {...defaultProps} />)

    expect(screen.getByText('2 snapshots')).toBeInTheDocument()
    expect(screen.getByAltText('Snapshot 1')).toBeInTheDocument()
    expect(screen.getByAltText('Snapshot 2')).toBeInTheDocument()
  })

  it('fires filter change events correctly', () => {
    render(<SnapshotGalleryView {...defaultProps} />)

    // Workflow filter
    fireEvent.change(document.getElementById('history-workflow-filter')!, {
      target: { value: '10' },
    })
    expect(defaultProps.setSelectedWorkflowId).toHaveBeenCalledWith(10)

    // LoRA filter
    fireEvent.change(document.getElementById('history-lora-filter')!, {
      target: { value: '20' },
    })
    expect(defaultProps.setSelectedLoraId).toHaveBeenCalledWith(20)

    // TagSet filter
    fireEvent.change(document.getElementById('history-tagset-filter')!, {
      target: { value: '30' },
    })
    expect(defaultProps.setSelectedTagSetId).toHaveBeenCalledWith(30)

    // Sort order
    fireEvent.click(screen.getByRole('button', { name: '古い順' }))
    expect(defaultProps.setSortOrder).toHaveBeenCalledWith('asc')
  })

  it('renders empty state when there are no snapshots', () => {
    render(<SnapshotGalleryView {...defaultProps} snapshots={[]} />)

    expect(screen.getByText('0 snapshots')).toBeInTheDocument()
    expect(screen.getByText('No snapshots yet.')).toBeInTheDocument()
  })

  it('handles snapshot preview click when not in multi-select mode', () => {
    render(<SnapshotGalleryView {...defaultProps} />)

    const card = document.getElementById('snap-card-1')
    expect(card).toBeInTheDocument()
    fireEvent.click(card!)

    expect(defaultProps.onOpenPreview).toHaveBeenCalled()
  })

  it('handles speech modal open and delete actions', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SnapshotGalleryView {...defaultProps} />)

    const speechBtn = document.getElementById('snap-speech-edit-1')
    expect(speechBtn).toBeInTheDocument()
    fireEvent.click(speechBtn!)
    expect(defaultProps.onOpenSpeechModal).toHaveBeenCalledWith(mockSnapshots[0])

    const deleteBtn = document.getElementById('snap-delete-1')
    expect(deleteBtn).toBeInTheDocument()
    fireEvent.click(deleteBtn!)
    expect(defaultProps.onDeleteSnapshot).toHaveBeenCalledWith(1)
  })

  describe('toThumbnailUrl', () => {
    it('returns empty string for null/undefined/empty', () => {
      expect(toThumbnailUrl(null)).toBe('')
      expect(toThumbnailUrl(undefined)).toBe('')
      expect(toThumbnailUrl('')).toBe('')
    })

    it('transforms ComfyUI /view URLs to thumbnail API endpoints', () => {
      const input = 'http://localhost:8188/view?filename=output_123.png'
      expect(toThumbnailUrl(input)).toBe('/api/comfy/thumbnail?filename=output_123.png')
    })

    it('passes through relative and data URLs', () => {
      expect(toThumbnailUrl('/thumbnails/image.webp')).toBe('/thumbnails/image.webp')
      expect(toThumbnailUrl('data:image/png;base64,xxxx')).toBe('data:image/png;base64,xxxx')
    })
  })
})
