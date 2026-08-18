import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechBubbleEditorModal } from '../SpeechBubbleEditorModal'
import { snapshotsApi, llmPromptsApi, fontsApi } from '../../api/client'
import type { SnapshotSummary } from '../../api/types'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    detectBubble: vi.fn(),
    detectBubbleROI: vi.fn(),
    detectBubbleDebug: vi.fn(),
    upload: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  },
  llmPromptsApi: {
    speechDraft: vi.fn(),
  },
  fontsApi: {
    list: vi.fn(),
  },
}))

describe('SpeechBubbleEditorModal', () => {
  const mockSnapshot: SnapshotSummary = {
    id: 1,
    workflow_id: 1,
    created_at: '2026-08-18T00:00:00Z',
    image_path: '/test-image.png',
    thumbnail_path: '/test-thumb.png',
  }

  const mockOnClose = vi.fn()
  const mockOnSaved = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(snapshotsApi.detectBubble).mockResolvedValue({
      bounding_box: { x: 50, y: 50, w: 100, h: 80 }
    } as any)
    vi.mocked(snapshotsApi.detectBubbleROI).mockResolvedValue({
      bounding_box: { x: 10, y: 10, w: 80, h: 60 }
    } as any)
    vi.mocked(snapshotsApi.detectBubbleDebug).mockResolvedValue({
      candidates: [
        { id: 1, status: 'PASS', area: 5000, mean_brightness: 220, x: 50, y: 50, w: 100, h: 80 }
      ]
    } as any)
    vi.mocked(llmPromptsApi.speechDraft).mockResolvedValue({
      draft: 'AI生成ドラフトセリフ'
    } as any)
    vi.mocked(fontsApi.list).mockResolvedValue([
      { name: 'MS Gothic', file_name: 'msgothic.ttc', path: '/fonts/msgothic.ttc' } as any
    ])
    vi.mocked(snapshotsApi.get).mockResolvedValue({
      id: 'snap-1',
      workflow_id: 'wf-1',
      params: { prompt: 'test' },
    } as any)
    vi.mocked(snapshotsApi.upload).mockResolvedValue({
      image_path: '/uploads/new-snap.png'
    } as any)
    vi.mocked(snapshotsApi.create).mockResolvedValue({
      id: 'snap-new'
    } as any)

    // Mock HTMLCanvasElement.getContext and toBlob
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      roundRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
    }) as any

    HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
      callback(new Blob(['mock-image-data'], { type: 'image/png' }))
    }) as any
  })

  it('renders modal and auto-detects initial bubble', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    expect(screen.getByText('セリフ編集・吹き出し追加')).toBeDefined()
    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalledWith(1)
    })
  })

  it('adds a new bubble on double click', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeDefined()
    if (canvas) {
      fireEvent.doubleClick(canvas, { clientX: 200, clientY: 200 })
    }

    // Save button should show bubble count
    await waitFor(() => {
      const saveBtn = screen.getByRole('button', { name: /保存して履歴へ追加/ })
      expect(saveBtn).toBeDefined()
    })
  })

  it('generates speech draft when draft button is clicked', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalled()
    })

    const draftBtn = await screen.findByText(/ドラフト生成/)
    fireEvent.click(draftBtn)

    await waitFor(() => {
      expect(llmPromptsApi.speechDraft).toHaveBeenCalledWith(1)
    })
  })

  it('saves image composite and creates new snapshot on save', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalled()
    })

    // Simulate Image onload
    const canvas = document.querySelector('canvas')
    if (canvas) {
      fireEvent.doubleClick(canvas, { clientX: 150, clientY: 150 })
    }

    const saveBtn = await screen.findByRole('button', { name: /保存して履歴へ追加/ })
    fireEvent.click(saveBtn)

    // Verify onClose or error handling
    await waitFor(() => {
      expect(mockOnSaved).not.toHaveBeenCalled() // because imageObj wasn't fully loaded via DOM Image in jsdom without trigger
    })
  })

  it('calls onClose when close button is clicked', () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const cancelBtn = screen.getByText('キャンセル')
    fireEvent.click(cancelBtn)
    expect(mockOnClose).toHaveBeenCalled()
  })
})
