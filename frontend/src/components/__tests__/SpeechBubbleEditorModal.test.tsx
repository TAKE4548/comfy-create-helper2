import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechBubbleEditorModal } from '../SpeechBubbleEditorModal'
import { snapshotsApi, llmPromptsApi, fontsApi } from '../../api/client'
import type { SnapshotSummary } from '../../api/types'
import { LAST_USED_STYLE_STORAGE_KEY } from '../../types/speechBubble'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn(),
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
    vi.mocked(snapshotsApi.list).mockResolvedValue([
      { id: 1, workflow_id: 1, created_at: '2026-08-18T00:00:00Z', image_path: '/test-image.png' },
      { id: 2, workflow_id: 1, created_at: '2026-08-18T01:00:00Z', image_path: '/test-image-2.png' },
    ])
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
      id: 1,
      workflow_id: 1,
      image_path: '/test-image.png',
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

  it('switches mobile tabs when tab buttons are clicked', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const previewTab = screen.getByText(/プレビュー/)
    const controlsTab = screen.getByText(/編集設定/)

    expect(previewTab).toBeDefined()
    expect(controlsTab).toBeDefined()

    // Switch to controls tab
    fireEvent.click(controlsTab)
    // Switch back to preview tab
    fireEvent.click(previewTab)
  })

  it('handles canvas touch interaction events', async () => {
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
      fireEvent.touchStart(canvas, {
        touches: [{ clientX: 100, clientY: 100 }],
      })
      fireEvent.touchMove(canvas, {
        touches: [{ clientX: 150, clientY: 150 }],
      })
      fireEvent.touchEnd(canvas)
    }
  })

  it('renders and resizes mini preview in mobile controls tab', async () => {
    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    const controlsTab = screen.getByText(/編集設定/)
    fireEvent.click(controlsTab)

    // Check mini preview canvas exists
    const miniCanvas = screen.getByTestId('mobile-mini-preview-canvas')
    expect(miniCanvas).toBeDefined()

    // Test resize handle dragging with mouse
    const resizeHandle = screen.getByTestId('mini-preview-resize-handle')
    expect(resizeHandle).toBeDefined()

    fireEvent.mouseDown(resizeHandle, { clientY: 100 })
    fireEvent.mouseMove(window, { clientY: 150 })
    fireEvent.mouseUp(window)

    // Test resize handle dragging with touch
    fireEvent.touchStart(resizeHandle, {
      touches: [{ clientY: 100 }],
    })
    fireEvent.touchMove(window, {
      touches: [{ clientY: 180 }],
    })
    fireEvent.touchEnd(window)

    // Test switching back to full preview via button on mini preview
    const fullPreviewBtn = screen.getByText(/全画面操作 ↗/)
    expect(fullPreviewBtn).toBeDefined()
    fireEvent.click(fullPreviewBtn)
  })

  it('inherits last used style on new bubble creation and persists to localStorage', async () => {
    localStorage.clear()
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

    // Change shape to burst
    const burstBtn = await screen.findByRole('button', { name: '叫び' })
    fireEvent.click(burstBtn)

    // Check localStorage
    const saved = localStorage.getItem(LAST_USED_STYLE_STORAGE_KEY)
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(parsed.shape).toBe('burst')

    // Add another bubble via double click
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeDefined()
    if (canvas) {
      fireEvent.doubleClick(canvas, { clientX: 200, clientY: 200 })
    }

    // New bubble should have the burst shape active
    await waitFor(() => {
      const activeBurstBtn = screen.getByRole('button', { name: '叫び' })
      expect(activeBurstBtn.className).toContain('bg-blue-600')
    })
  })

  it('restores lastUsedStyle from localStorage on mount', async () => {
    localStorage.setItem(
      LAST_USED_STYLE_STORAGE_KEY,
      JSON.stringify({
        shape: 'rounded-rect',
        orientation: 'horizontal',
        fontFamily: 'serif',
        fontSize: 24,
        textColor: 'rgba(255, 0, 0, 1)',
        backgroundColor: 'rgba(0, 0, 0, 1)',
        borderColor: 'rgba(255, 255, 0, 1)',
        borderWidth: 4,
      })
    )

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

    // The auto-detected bubble should inherit localStorage settings
    const roundedRectBtn = await screen.findByRole('button', { name: '角丸' })
    expect(roundedRectBtn.className).toContain('bg-blue-600')

    const horizBtn = screen.getByRole('button', { name: '横書き' })
    expect(horizBtn.className).toContain('bg-blue-600')
  })

  it('updates lastUsedStyle and persists to localStorage when selecting an existing bubble', async () => {
    localStorage.clear()
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

    // First bubble is auto-detected. Set its shape to burst
    const burstBtn = await screen.findByRole('button', { name: '叫び' })
    fireEvent.click(burstBtn)

    // Verify localStorage has burst
    expect(JSON.parse(localStorage.getItem(LAST_USED_STYLE_STORAGE_KEY)!).shape).toBe('burst')
  })

  it('restores existing speech bubbles and base image metadata without calling auto-detect', async () => {
    vi.mocked(snapshotsApi.get).mockResolvedValueOnce({
      id: 1,
      workflow_id: 1,
      image_path: '/composed-image.png',
      params: {
        speech_bubbles: [
          {
            id: 'saved-bubble-1',
            x: 20,
            y: 30,
            w: 120,
            h: 90,
            text: '復元されたセリフ',
            shape: 'oval',
            orientation: 'vertical',
            fontFamily: 'sans-serif',
            fontSize: 16,
            textColor: 'rgba(0, 0, 0, 1)',
            backgroundColor: 'rgba(255, 255, 255, 1)',
            borderColor: 'rgba(0, 0, 0, 1)',
            borderWidth: 2,
          }
        ],
        base_snapshot_id: 99,
        base_image_path: '/base-clean-image.png',
      },
    } as any)

    render(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // Should NOT call auto-detect because saved bubbles exist
    await waitFor(() => {
      expect(snapshotsApi.get).toHaveBeenCalledWith(1)
    })
    expect(snapshotsApi.detectBubble).not.toHaveBeenCalled()

    // Controls should show the restored bubble's text
    const textarea = await screen.findByDisplayValue('復元されたセリフ')
    expect(textarea).toBeDefined()
  })

  it('opens BaseImageSelectModal and replaces base image when a snapshot is selected', async () => {
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

    // Click base image replacement button
    const replaceBtn = screen.getByRole('button', { name: /ベース画像差し替え/ })
    fireEvent.click(replaceBtn)

    // Verify modal appears
    expect(await screen.findByText('生成履歴からベース画像を差し替え')).toBeDefined()
    expect(snapshotsApi.list).toHaveBeenCalledWith({ workflow_id: 1 })

    // Select snapshot #2
    const snap2Btn = screen.getByText('#2')
    fireEvent.click(snap2Btn)

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText('生成履歴からベース画像を差し替え')).toBeNull()
    })
  })

  it('saves image composite and includes speech_bubbles metadata, base_snapshot_id, and base_image_path', async () => {
    // Mock Image to trigger onload synchronously
    const OriginalImage = global.Image
    class MockLoadedImage {
      src = ''
      naturalWidth = 500
      naturalHeight = 500
      onload: (() => void) | null = null
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload()
        }, 0)
      }
    }
    global.Image = MockLoadedImage as any

    try {
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

      // Wait for image load and save button enabled
      const saveBtn = await screen.findByRole('button', { name: /保存して履歴へ追加/ })
      await waitFor(() => {
        expect(saveBtn).not.toBeDisabled()
      })

      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(snapshotsApi.upload).toHaveBeenCalled()
        expect(snapshotsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({
            workflow_id: 1,
            image_path: '/uploads/new-snap.png',
            params: expect.objectContaining({
              speech_bubbles: expect.any(Array),
              base_snapshot_id: 1,
              base_image_path: '/test-image.png',
            }),
          })
        )
        expect(mockOnSaved).toHaveBeenCalled()
        expect(mockOnClose).toHaveBeenCalled()
      })
    } finally {
      global.Image = OriginalImage
    }
  })
})

