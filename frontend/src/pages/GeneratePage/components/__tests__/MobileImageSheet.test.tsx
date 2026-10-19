import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MobileImageSheet } from '../MobileImageSheet'

describe('MobileImageSheet REQ-372', () => {
  const dummyImageUrl = '/api/view?filename=test_image.png'
  let onClose: ReturnType<typeof vi.fn>
  let onSaveSnapshot: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    onSaveSnapshot = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[REQ-372/AC-3] renders bottom sheet container and image with original aspect ratio when open', () => {
    render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    const sheetContainer = screen.getByTestId('mobile-image-sheet')
    expect(sheetContainer).toBeInTheDocument()
    expect(sheetContainer.className).toContain('fixed inset-0 z-50')

    const sheetContent = screen.getByTestId('mobile-image-sheet-content')
    expect(sheetContent.className).toContain('max-h-[88dvh]')
    expect(sheetContent.className).toContain('rounded-t-2xl')

    const img = screen.getByAltText('プレビュー画像')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', dummyImageUrl)
    expect(img.className).toContain('object-contain')
  })

  it('[REQ-372/AC-4] transitions to fullscreen viewer on sheet image tap with black background and hidden sheet chrome', () => {
    render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    expect(screen.queryByTestId('mobile-fullscreen-viewer')).not.toBeInTheDocument()
    const sheetImg = screen.getByAltText('プレビュー画像')

    fireEvent.click(sheetImg)

    const fullscreenViewer = screen.getByTestId('mobile-fullscreen-viewer')
    expect(fullscreenViewer).toBeInTheDocument()
    expect(fullscreenViewer.className).toContain('bg-black')
    expect(screen.queryByTestId('mobile-image-sheet-content')).not.toBeInTheDocument()
  })

  it('[REQ-372/AC-5] returns from fullscreen to sheet on tapping image, floating close button, or pressing Escape', () => {
    render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    fireEvent.click(screen.getByAltText('プレビュー画像'))
    expect(screen.getByTestId('mobile-fullscreen-viewer')).toBeInTheDocument()

    const floatingCloseBtn = screen.getByTestId('mobile-fullscreen-close-btn')
    expect(floatingCloseBtn).toBeInTheDocument()
    fireEvent.click(floatingCloseBtn)

    expect(screen.queryByTestId('mobile-fullscreen-viewer')).not.toBeInTheDocument()
    expect(screen.getByTestId('mobile-image-sheet-content')).toBeInTheDocument()

    // Tap fullscreen image to return
    fireEvent.click(screen.getByAltText('プレビュー画像'))
    expect(screen.getByTestId('mobile-fullscreen-viewer')).toBeInTheDocument()
    const fsImg = screen.getByAltText('全画面画像')
    fireEvent.click(fsImg)
    expect(screen.queryByTestId('mobile-fullscreen-viewer')).not.toBeInTheDocument()
    expect(screen.getByTestId('mobile-image-sheet-content')).toBeInTheDocument()

    // Press Escape to return
    fireEvent.click(screen.getByAltText('プレビュー画像'))
    expect(screen.getByTestId('mobile-fullscreen-viewer')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('mobile-fullscreen-viewer')).not.toBeInTheDocument()
    expect(screen.getByTestId('mobile-image-sheet-content')).toBeInTheDocument()
  })

  it('[REQ-372/AC-6] closes bottom sheet on backdrop tap, sheet close button, or Escape key', () => {
    const { unmount } = render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    const closeBtn = screen.getByTestId('mobile-sheet-close-btn')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    // Backdrop click
    const backdrop = screen.getByTestId('mobile-image-sheet-backdrop')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)

    // Escape in sheet mode
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)

    unmount()
  })

  it('[REQ-372/AC-8] provides download button (#download-btn-mobile) and snapshot save button inheriting preview features', () => {
    render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    const downloadBtn = screen.getByRole('link', { name: /ダウンロード/i })
    expect(downloadBtn).toHaveAttribute('id', 'download-btn-mobile')
    expect(downloadBtn).toHaveAttribute('href', dummyImageUrl)
    expect(downloadBtn).toHaveAttribute('download')

    const saveBtn = screen.getByTestId('mobile-sheet-save-btn')
    expect(saveBtn).toBeInTheDocument()
    fireEvent.click(saveBtn)
    expect(onSaveSnapshot).toHaveBeenCalledWith(dummyImageUrl)
  })

  it('[REQ-372/AC-11] shows fallback error state with ImageOff icon when image fails to load', () => {
    render(
      <MobileImageSheet
        isOpen={true}
        onClose={onClose}
        image={dummyImageUrl}
        onSaveSnapshot={onSaveSnapshot}
      />
    )

    const img = screen.getByAltText('プレビュー画像')
    fireEvent.error(img)

    expect(screen.getByTestId('mobile-sheet-image-error')).toBeInTheDocument()
    expect(screen.getByText('画像の読み込みに失敗しました')).toBeInTheDocument()
  })

  describe('Wake Lock and Fullscreen Integration (AC-12, AC-13)', () => {
    let mockRelease: ReturnType<typeof vi.fn>
    let mockRequest: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockRelease = vi.fn().mockResolvedValue(undefined)
      mockRequest = vi.fn().mockResolvedValue({
        released: false,
        release: mockRelease,
        addEventListener: vi.fn(),
      })

      Object.defineProperty(navigator, 'wakeLock', {
        value: {
          request: mockRequest,
        },
        writable: true,
        configurable: true,
      })
    })

    it('[REQ-372/AC-12] requests Wake Lock on entering fullscreen and releases on exiting fullscreen or page visibility hidden', async () => {
      render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={dummyImageUrl}
          onSaveSnapshot={onSaveSnapshot}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByAltText('プレビュー画像'))
      })

      expect(mockRequest).toHaveBeenCalledWith('screen')

      // Exit fullscreen via floating close button
      await act(async () => {
        fireEvent.click(screen.getByTestId('mobile-fullscreen-close-btn'))
      })
      expect(mockRelease).toHaveBeenCalledTimes(1)

      // Enter again and test visibilitychange
      await act(async () => {
        fireEvent.click(screen.getByAltText('プレビュー画像'))
      })
      expect(mockRequest).toHaveBeenCalledTimes(2)

      // Simulate visibilitychange -> hidden
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      })
      await act(async () => {
        fireEvent(document, new Event('visibilitychange'))
      })
      expect(mockRelease).toHaveBeenCalledTimes(2)
    })

    it('[REQ-372/AC-13] degrades gracefully without errors when Fullscreen API or Wake Lock API is not supported or rejected', async () => {
      // Remove wakeLock
      Object.defineProperty(navigator, 'wakeLock', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const { container } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={dummyImageUrl}
          onSaveSnapshot={onSaveSnapshot}
        />
      )

      // Should not throw and transition to CSS 100dvh fallback
      await act(async () => {
        fireEvent.click(screen.getByAltText('プレビュー画像'))
      })

      const fsViewer = screen.getByTestId('mobile-fullscreen-viewer')
      expect(fsViewer).toBeInTheDocument()
      expect(fsViewer.className).toContain('h-[100dvh]')
    })
  })
})
