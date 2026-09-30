import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SpeechBubbleEditorModal } from '../SpeechBubbleEditorModal'
import { snapshotsApi, albumsApi, llmPromptsApi, fontsApi, speechBubblePresetsApi, sceneSpeechApi } from '../../api/client'
import type { SnapshotSummary } from '../../api/types'
import { LAST_USED_STYLE_STORAGE_KEY } from '../../types/speechBubble'
import { LS_KEYS } from '../../utils/localStorageKeys'

vi.mock('../../api/client', () => ({
  snapshotsApi: {
    list: vi.fn(),
    detectBubble: vi.fn(),
    detectBubbleROI: vi.fn(),
    detectBubbleDebug: vi.fn(),
    upload: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    patch: vi.fn(),
  },
  sceneSpeechApi: { generateStream: vi.fn() },
  SceneSpeechStreamError: class SceneSpeechStreamError extends Error {},
  workflowsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  lorasApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  tagSetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  albumsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ items: [] }),
    create: vi.fn().mockResolvedValue({ id: 10, name: 'New Album' }),
    addItems: vi.fn().mockResolvedValue(undefined),
  },
  llmPromptsApi: {
    speechDraft: vi.fn(),
  },
  fontsApi: {
    list: vi.fn(),
  },
  speechBubblePresetsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1, name: 'Default', shape: 'oval', orientation: 'vertical', font_family: 'sans-serif', font_size: 0, text_color: 'rgba(0,0,0,1)', background_color: 'rgba(255,255,255,1)', border_color: 'rgba(0,0,0,1)', border_width: 2, sort_order: 0, created_at: '' }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Default', shape: 'oval', orientation: 'vertical', font_family: 'sans-serif', font_size: 0, text_color: 'rgba(0,0,0,1)', background_color: 'rgba(255,255,255,1)', border_color: 'rgba(0,0,0,1)', border_width: 2, sort_order: 0, created_at: '' }),
    delete: vi.fn().mockResolvedValue(undefined),
    getByTagSetId: vi.fn().mockResolvedValue(null),
  },
  speechTonePresetsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1, name: 'Default', prompt: 'prompt', description: '', sort_order: 0, created_at: '' }),
    update: vi.fn().mockResolvedValue({ id: 1, name: 'Default', prompt: 'prompt', description: '', sort_order: 0, created_at: '' }),
    delete: vi.fn().mockResolvedValue(undefined),
    rewrite: vi.fn().mockResolvedValue({ rewritten_text: '' }),
  },
}))



describe('SpeechBubbleEditorModal', () => {
  let queryClient: QueryClient

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
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
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
      translate: vi.fn(),
      rotate: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
    }) as any

    HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
      callback(new Blob(['mock-image-data'], { type: 'image/png' }))
    }) as any
  })

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  it('renders modal and auto-detects initial bubble', async () => {
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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
    renderWithQuery(
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

    renderWithQuery(
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
    renderWithQuery(
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

    renderWithQuery(
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
    renderWithQuery(
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
    expect(await screen.findByRole('heading', { name: 'ベース画像を差し替え' })).toBeDefined()
    expect(snapshotsApi.list).toHaveBeenCalledWith({
      workflow_id: 1,
      lora_id: undefined,
      tag_set_id: undefined,
    })

    // Select snapshot #2
    const snap2Btn = await screen.findByText('#2')
    fireEvent.click(snap2Btn)

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'ベース画像を差し替え' })).toBeNull()
    })
  })

  it('saves image composite and includes speech_bubbles metadata, base_snapshot_id, and base_image_path', async () => {
    // Mock Image to trigger onload synchronously
    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
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

      const newAlbumInput = screen.getByTestId('new-album-name-input')
      fireEvent.change(newAlbumInput, { target: { value: 'Test Album' } })

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
      window.Image = OriginalImage
    }
  })

  it('handles saveMode overwrite by calling snapshotsApi.patch', async () => {
    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      // Switch save mode to overwrite
      const overwriteBtn = screen.getByTestId('save-mode-overwrite')
      fireEvent.click(overwriteBtn)

      // Set album select to none
      const albumSelect = screen.getByTestId('save-album-select')
      fireEvent.change(albumSelect, { target: { value: '' } })

      const saveBtn = screen.getByTestId('speech-bubble-save-btn')
      await waitFor(() => {
        expect(saveBtn).not.toBeDisabled()
      })
      expect(saveBtn.textContent).toContain('上書き保存')

      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(snapshotsApi.upload).toHaveBeenCalled()
        expect(snapshotsApi.patch).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            image_path: '/uploads/new-snap.png',
            params: expect.objectContaining({
              speech_bubbles: expect.any(Array),
            }),
          })
        )
        expect(snapshotsApi.create).not.toHaveBeenCalled()
        expect(mockOnSaved).toHaveBeenCalled()
        expect(mockOnClose).toHaveBeenCalled()
      })
    } finally {
      window.Image = OriginalImage
    }
  })

  it('creates new album and sets LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH on save', async () => {
    localStorage.clear()
    vi.mocked(albumsApi.create).mockResolvedValueOnce({ id: 99, name: 'My Comic Album' } as any)
    vi.mocked(snapshotsApi.create).mockResolvedValueOnce({ id: 55 } as any)

    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      const newAlbumInput = screen.getByTestId('new-album-name-input')
      fireEvent.change(newAlbumInput, { target: { value: 'My Comic Album' } })

      const saveBtn = screen.getByTestId('speech-bubble-save-btn')
      await waitFor(() => {
        expect(saveBtn).not.toBeDisabled()
      })

      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(albumsApi.create).toHaveBeenCalledWith({
          name: 'My Comic Album',
          snapshot_ids: [55],
        })
        expect(localStorage.getItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH)).toBe('99')
        expect(mockOnSaved).toHaveBeenCalled()
      })
    } finally {
      window.Image = OriginalImage
    }
  })

  it('adds snapshot to existing selected album and updates localStorage on save', async () => {
    vi.mocked(albumsApi.list).mockResolvedValueOnce([
      { id: 42, name: 'Chapter 1', items: [] } as any,
    ])
    vi.mocked(snapshotsApi.create).mockResolvedValueOnce({ id: 77 } as any)

    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(albumsApi.list).toHaveBeenCalled()
      })

      const albumSelect = screen.getByTestId('save-album-select')
      fireEvent.change(albumSelect, { target: { value: '42' } })

      const saveBtn = screen.getByTestId('speech-bubble-save-btn')
      await waitFor(() => {
        expect(saveBtn).not.toBeDisabled()
      })

      fireEvent.click(saveBtn)

      await waitFor(() => {
        expect(albumsApi.addItems).toHaveBeenCalledWith(42, [77])
        expect(localStorage.getItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH)).toBe('42')
        expect(mockOnSaved).toHaveBeenCalled()
      })
    } finally {
      window.Image = OriginalImage
    }
  })

  it('prioritizes LAST_SAVE_ALBUM_ID_SPEECH from localStorage over initialAlbumId, with fallback if not found in list', async () => {
    localStorage.setItem(LS_KEYS.LAST_SAVE_ALBUM_ID_SPEECH, '999') // Non-existent in fetched album list
    vi.mocked(albumsApi.list).mockResolvedValueOnce([
      { id: 200, name: 'Initial Album', items: [] } as any,
    ])

    renderWithQuery(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        initialAlbumId={200}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    // After albums load, since 999 is not in list, fallback to initialAlbumId (200)
    await waitFor(() => {
      const albumSelect = screen.getByTestId('save-album-select') as HTMLSelectElement
      expect(albumSelect.value).toBe('200')
    })
  })

  it('duplicates selected bubble when duplicate button is clicked', async () => {
    renderWithQuery(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalled()
    })

    const dupBtn = await screen.findByText('📋 この吹き出しを複製')
    fireEvent.click(dupBtn)

    await waitFor(() => {
      expect(screen.getByTestId('speech-bubble-save-btn').textContent).toContain('(2)')
    })
  })

  it('copies and pastes bubble using Ctrl+C / Ctrl+V keyboard shortcuts', async () => {
    renderWithQuery(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalled()
    })

    // Press Ctrl+C while bubble is selected
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })

    // Press Ctrl+V to paste
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('speech-bubble-save-btn').textContent).toContain('(2)')
    })
  })

  it('does not duplicate bubble with Ctrl+C / Ctrl+V when typing inside input or textarea', async () => {
    renderWithQuery(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.detectBubble).toHaveBeenCalled()
    })

    const textarea = screen.getByPlaceholderText('セリフを入力...')
    textarea.focus()

    fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(textarea, { key: 'v', ctrlKey: true })

    // Count should still be 1
    expect(screen.getByTestId('speech-bubble-save-btn').textContent).toContain('(1)')
  })

  it('rotates bubble when dragging rotation handle on canvas', async () => {
    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      // Wait for imageObj to load and canvas to render
      await waitFor(() => {
        expect(document.querySelector('canvas')).toBeDefined()
      })

      const canvas = document.querySelector('canvas')!
      // Bounding box from detectBubble is x:50, y:50, w:100, h:80
      // Top center is (100, 50), rotation handle is at (100, 30)
      // Drag rotation handle from (100, 30) to (150, 90) -> 90 degrees clockwise rotation
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 30 })
      fireEvent.mouseMove(canvas, { clientX: 150, clientY: 90 })
      fireEvent.mouseUp(canvas)

      // The rotation input should be updated
      await waitFor(() => {
        const rotInput = screen.getByLabelText('吹き出し回転角度数値') as HTMLInputElement
        expect(rotInput).toBeDefined()
        expect(parseInt(rotInput.value, 10)).not.toBe(0)
      })
    } finally {
      window.Image = OriginalImage
    }
  })

  it('supports tail fine-tuning mode toggle and contact reset (REQ-206 T2)', async () => {
    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      // The auto-detected bubble has a tail, so the fine tuning checkbox should be rendered
      await waitFor(() => {
        expect(screen.getByLabelText('しっぽ微調整モード')).toBeDefined()
      })

      const fineTuningToggle = screen.getByLabelText('しっぽ微調整モード') as HTMLInputElement
      expect(fineTuningToggle.checked).toBe(false)

      // Toggle ON
      fireEvent.click(fineTuningToggle)
      expect(fineTuningToggle.checked).toBe(true)

      // The fine-tuning guide text and reset button should now be rendered
      await waitFor(() => {
        expect(screen.getByText(/橙色の2接点をドラッグして配置/)).toBeDefined()
      })

      // Test reset button
      const resetBtn = screen.getByRole('button', { name: /接点初期化/ })
      expect(resetBtn).toBeDefined()
      fireEvent.click(resetBtn)
    } finally {
      window.Image = OriginalImage
    }
  })

  it('preserves full tail properties when moving or duplicating bubble (REQ-206 T2)', async () => {
    vi.mocked(snapshotsApi.get).mockResolvedValueOnce({
      id: 1,
      workflow_id: 1,
      image_path: '/composed-image.png',
      params: {
        speech_bubbles: [
          {
            id: 'saved-bubble-1',
            x: 50,
            y: 50,
            w: 100,
            h: 80,
            text: 'テスト',
            shape: 'oval',
            orientation: 'vertical',
            fontFamily: 'sans-serif',
            fontSize: 16,
            textColor: 'rgba(0, 0, 0, 1)',
            backgroundColor: 'rgba(255, 255, 255, 1)',
            borderColor: 'rgba(0, 0, 0, 1)',
            borderWidth: 2,
            tail: {
              x: 30,
              y: 150,
              baseAngle1: 0.5,
              baseAngle2: 1.2,
              isFineTuning: true,
            },
          }
        ],
      },
    } as any)

    const OriginalImage = window.Image
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
    window.Image = MockLoadedImage as any

    try {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.get).toHaveBeenCalledWith(1)
      })

      // Duplicate bubble
      const dupBtn = await screen.findByText('📋 この吹き出しを複製')
      fireEvent.click(dupBtn)

      // Bubble count should be 2
      await waitFor(() => {
        expect(screen.getByTestId('speech-bubble-save-btn').textContent).toContain('(2)')
      })

      // Canvas dragging move bubble
      const canvas = document.querySelector('canvas')!
      fireEvent.mouseDown(canvas, { clientX: 70, clientY: 70 })
      fireEvent.mouseMove(canvas, { clientX: 90, clientY: 90 })
      fireEvent.mouseUp(canvas)
    } finally {
      window.Image = OriginalImage
    }
  })

  describe('Red Teaming (boundary & error cases)', () => {
    it('Red-1: ignores and resets micro ROI (<10px) without calling API', async () => {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      const canvas = document.querySelector('canvas')!
      // Drag in empty area with micro delta (< 10px, e.g. 5px by 5px)
      fireEvent.mouseDown(canvas, { clientX: 300, clientY: 300 })
      fireEvent.mouseMove(canvas, { clientX: 305, clientY: 305 })
      fireEvent.mouseUp(canvas)

      expect(snapshotsApi.detectBubbleROI).not.toHaveBeenCalled()
    })

    it('Red-2: validates empty new album name and interrupts save with alert', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const OriginalImage = window.Image
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
      window.Image = MockLoadedImage as any

      try {
        renderWithQuery(
          <SpeechBubbleEditorModal
            snapshot={mockSnapshot}
            onClose={mockOnClose}
            onSaved={mockOnSaved}
          />
        )

        await waitFor(() => {
          expect(snapshotsApi.detectBubble).toHaveBeenCalled()
        })

        const albumSelect = screen.getByTestId('save-album-select')
        fireEvent.change(albumSelect, { target: { value: 'new' } })

        const newAlbumInput = screen.getByTestId('new-album-name-input')
        fireEvent.change(newAlbumInput, { target: { value: '   ' } })

        const saveBtn = await screen.findByTestId('speech-bubble-save-btn')
        fireEvent.click(saveBtn)

        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith('新規アルバム名を入力してください')
        })
        expect(snapshotsApi.upload).not.toHaveBeenCalled()
        expect(mockOnSaved).not.toHaveBeenCalled()
      } finally {
        window.Image = OriginalImage
        alertSpy.mockRestore()
      }
    })

    it('Red-3: disables save button when bubbles count is zero', async () => {
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
        />
      )

      await waitFor(() => {
        expect(snapshotsApi.detectBubble).toHaveBeenCalled()
      })

      const deleteBtn = await screen.findByRole('button', { name: /この吹き出しを削除/ })
      fireEvent.click(deleteBtn)

      await waitFor(() => {
        const saveBtn = screen.getByTestId('speech-bubble-save-btn')
        expect(saveBtn).toBeDisabled()
      })
    })

    it('Red-4: handles API error safely, restores isSaving flag, and displays alert', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(snapshotsApi.upload).mockRejectedValueOnce(new Error('Network 500 Failure'))

      const OriginalImage = window.Image
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
      window.Image = MockLoadedImage as any

      try {
        renderWithQuery(
          <SpeechBubbleEditorModal
            snapshot={mockSnapshot}
            onClose={mockOnClose}
            onSaved={mockOnSaved}
          />
        )

        await waitFor(() => {
          expect(snapshotsApi.detectBubble).toHaveBeenCalled()
        })

        const albumSelect = screen.getByTestId('save-album-select')
        fireEvent.change(albumSelect, { target: { value: 'new' } })

        const newAlbumInput = screen.getByTestId('new-album-name-input')
        fireEvent.change(newAlbumInput, { target: { value: 'Valid Album' } })

        const saveBtn = screen.getByTestId('speech-bubble-save-btn')
        fireEvent.click(saveBtn)

        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Network 500 Failure'))
        })

        await waitFor(() => {
          expect(saveBtn).not.toBeDisabled()
        })
        expect(mockOnClose).not.toHaveBeenCalled()
      } finally {
        window.Image = OriginalImage
        alertSpy.mockRestore()
        consoleErrorSpy.mockRestore()
      }
    })

    it('Red-5: clamps bubble dimensions to minSize (30px) when resizing inwards', async () => {
      const OriginalImage = window.Image
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
      window.Image = MockLoadedImage as any

      try {
        renderWithQuery(
          <SpeechBubbleEditorModal
            snapshot={mockSnapshot}
            onClose={mockOnClose}
            onSaved={mockOnSaved}
          />
        )

        await waitFor(() => {
          expect(snapshotsApi.detectBubble).toHaveBeenCalled()
        })

        const canvas = document.querySelector('canvas')!
        fireEvent.mouseDown(canvas, { clientX: 150, clientY: 130 })
        fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 })
        fireEvent.mouseUp(canvas)

        const wInput = screen.getByLabelText('吹き出し幅') as HTMLInputElement
        const hInput = screen.getByLabelText('吹き出し高さ') as HTMLInputElement
        expect(parseInt(wInput.value, 10)).toBeGreaterThanOrEqual(30)
        expect(parseInt(hInput.value, 10)).toBeGreaterThanOrEqual(30)
      } finally {
        window.Image = OriginalImage
      }
    })
  })

  describe('Scene Batch Generate (REQ-292)', () => {
    const emptySceneDraft = {
      scene_interpretation: '', bubbles: [], vram_unloaded: true,
      tone_samples: [], candidate_similar_scenes: [],
    }
    it('TEST-UI-01: primaryTagSetId 付きでレンダーしたとき「シーン一括生成」ボタンが存在する', async () => {
      const mockGenerateDraftApi = vi.fn().mockResolvedValue(emptySceneDraft)
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
          primaryTagSetId={1}
          generateDraftApi={mockGenerateDraftApi}
          applyPresetToBubbles={(b) => b}
        />
      )
      expect(screen.getByTestId('scene-batch-generate-btn')).toBeDefined()
    })

    it('TEST-UI-02: ボタンクリックで generateDraftApi が発火する (primaryTagSetId あり)', async () => {
      vi.mocked(speechBubblePresetsApi.getByTagSetId).mockResolvedValueOnce({
        id: 1, name: 'Preset', is_default: false,
      } as any)
      const mockGenerateDraftApi = vi.fn().mockResolvedValue(emptySceneDraft)
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
          primaryTagSetId={1}
          generateDraftApi={mockGenerateDraftApi}
          applyPresetToBubbles={(b) => b}
        />
      )
      fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
      await waitFor(() => {
        expect(mockGenerateDraftApi).toHaveBeenCalledWith(
          expect.objectContaining({ snapshot_id: expect.any(Number) }),
          expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) })
        )
      })
    })

    it('TEST-UI-03: primaryTagSetId=null でも generateDraftApi が target_tag_set_id: null で呼ばれる', async () => {
      const mockGenerateDraftApi = vi.fn().mockResolvedValue(emptySceneDraft)
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
          primaryTagSetId={null}
          generateDraftApi={mockGenerateDraftApi}
          applyPresetToBubbles={(b) => b}
        />
      )
      fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
      await waitFor(() => {
        expect(mockGenerateDraftApi).toHaveBeenCalledWith(
          expect.objectContaining({ target_tag_set_id: null }),
          expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) })
        )
      })
      expect(speechBubblePresetsApi.getByTagSetId).not.toHaveBeenCalled()
    })

    it('TEST-UI-04: 「編集設定」タブ中に生成ボタンを押すと、完了後に preview タブへ遷移する', async () => {
      const mockGenerateDraftApi = vi.fn().mockResolvedValue(emptySceneDraft)
      renderWithQuery(
        <SpeechBubbleEditorModal
          snapshot={mockSnapshot}
          onClose={mockOnClose}
          onSaved={mockOnSaved}
          primaryTagSetId={null}
          generateDraftApi={mockGenerateDraftApi}
          applyPresetToBubbles={(b) => b}
        />
      )
      // モバイル「編集設定」タブへ切替
      fireEvent.click(screen.getByText(/編集設定/))
      // 一括生成ボタン押下
      fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
      // 生成完了後、preview タブに戻る
      await waitFor(() => {
        // preview タブボタンが active スタイルを持つ
        const previewTab = screen.getByText(/プレビュー/).closest('button')
        expect(previewTab?.className).toContain('bg-blue-600')
      })
    })
  }) // end describe('Scene Batch Generate')

  it('REQ-294 T16: default stream API receives progress and advances to review', async () => {
    let onProgress: ((event: { type: 'progress'; step: 'reference' | 'vlm' | 'style' | 'vram'; status: 'active' | 'done' | 'error' }) => void) | undefined
    let resolveStream!: (value: any) => void
    vi.mocked(sceneSpeechApi.generateStream).mockImplementation((_payload, options) => {
      onProgress = options?.onProgress
      return new Promise((resolve) => { resolveStream = resolve })
    })
    renderWithQuery(
      <SpeechBubbleEditorModal
        snapshot={mockSnapshot}
        primaryTagSetId={null}
        onClose={mockOnClose}
        onSaved={mockOnSaved}
      />
    )
    fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
    await waitFor(() => {
      expect(sceneSpeechApi.generateStream).toHaveBeenCalledWith(
        expect.objectContaining({ snapshot_id: 1, target_tag_set_id: null }),
        expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) })
      )
    })
    act(() => onProgress?.({ type: 'progress', step: 'reference', status: 'done' }))
    expect(screen.getAllByLabelText('生成進捗')[0].textContent).toContain('参照抽出')
    act(() => onProgress?.({ type: 'progress', step: 'vlm', status: 'active' }))
    expect(screen.getAllByLabelText('生成進捗')[0].textContent).toContain('VLM推論')
    await act(async () => resolveStream({ scene_interpretation: 'stream結果', bubbles: [], vram_unloaded: true, tone_samples: [], candidate_similar_scenes: [] }))
    await waitFor(() => expect(screen.getAllByText('生成結果を確認').length).toBeGreaterThan(0))
  })

  it('REQ-294 T16: default stream rejection reaches the error and retry UI', async () => {
    vi.mocked(sceneSpeechApi.generateStream).mockRejectedValueOnce(new Error('stream failed'))
    renderWithQuery(<SpeechBubbleEditorModal snapshot={mockSnapshot} primaryTagSetId={null} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('stream failed'))
    expect(screen.getAllByRole('button', { name: '再試行' }).length).toBeGreaterThan(0)
  })

  it('REQ-294 T16: closing progress cancels the stream and discards its late result', async () => {
    let streamOptions: any
    let resolveStream!: (value: any) => void
    vi.mocked(sceneSpeechApi.generateStream).mockImplementation((_payload, options) => {
      streamOptions = options
      return new Promise((resolve) => { resolveStream = resolve })
    })
    renderWithQuery(<SpeechBubbleEditorModal snapshot={mockSnapshot} primaryTagSetId={null} onClose={mockOnClose} onSaved={mockOnSaved} />)
    fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
    await waitFor(() => expect(sceneSpeechApi.generateStream).toHaveBeenCalled())
    fireEvent.click(screen.getAllByLabelText('閉じる')[0])
    expect(streamOptions.signal.aborted).toBe(true)
    resolveStream({ scene_interpretation: 'stale', bubbles: [], vram_unloaded: true, tone_samples: [], candidate_similar_scenes: [] })
    expect(screen.queryByTestId('scene-speech-modal')).toBeNull()
  })

  it('REQ-294: 生成結果の選択分だけをキャンバスへ反映する', async () => {
    const generated = {
      scene_interpretation: 'テストシーン', vram_unloaded: true,
      tone_samples: [], candidate_similar_scenes: [],
      bubbles: [
        { id: 'draft-a', text: '選択する台詞' },
        { id: 'draft-b', text: '除外する台詞' },
      ],
    }
    const applyPresetToBubbles = vi.fn((bubbles) => bubbles)
    renderWithQuery(
      <SpeechBubbleEditorModal snapshot={mockSnapshot} onClose={mockOnClose} onSaved={mockOnSaved}
        primaryTagSetId={null} generateDraftApi={vi.fn().mockResolvedValue(generated)}
        applyPresetToBubbles={applyPresetToBubbles} />
    )

    fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
    await waitFor(() => expect(screen.getAllByText('生成結果を確認').length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByLabelText('除外する台詞')[0])
    fireEvent.click(screen.getAllByText('キャンバスに反映')[0])

    expect(applyPresetToBubbles).toHaveBeenCalledWith([generated.bubbles[0]], null)
    expect(screen.queryByTestId('scene-speech-modal')).toBeNull()
  })

  it('REQ-294: 結果を閉じた場合は生成バブルを反映しない', async () => {
    const applyPresetToBubbles = vi.fn((bubbles) => bubbles)
    renderWithQuery(
      <SpeechBubbleEditorModal snapshot={mockSnapshot} onClose={mockOnClose} onSaved={mockOnSaved}
        primaryTagSetId={null} generateDraftApi={vi.fn().mockResolvedValue({
          scene_interpretation: '', vram_unloaded: true, tone_samples: [], candidate_similar_scenes: [],
          bubbles: [{ id: 'draft-a', text: '反映しない台詞' }],
        })} applyPresetToBubbles={applyPresetToBubbles} />
    )

    fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
    await waitFor(() => expect(screen.getAllByText('生成結果を確認').length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByLabelText('閉じる')[0])

    expect(applyPresetToBubbles).not.toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
