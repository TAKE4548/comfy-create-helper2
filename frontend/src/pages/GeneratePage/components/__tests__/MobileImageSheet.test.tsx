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
    expect(sheetContainer.className).toContain('fixed inset-0 z-[var(--z-modal)]')

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

  describe('REQ-302 Modal Elevation and Viewer Exception Preservation', () => {
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

    it('[REQ-302/AC-1] mobile image sheet and fullscreen viewer render with elevated modal z-index', async () => {
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
      expect(sheetContainer.className).toContain('z-[var(--z-modal)]')
      expect(sheetContainer.className).not.toContain('z-50')

      // Transition to fullscreen
      await act(async () => {
        fireEvent.click(screen.getByAltText('プレビュー画像'))
      })

      const fsViewer = screen.getByTestId('mobile-fullscreen-viewer')
      expect(fsViewer).toBeInTheDocument()
      expect(fsViewer.className).toContain('z-[var(--z-modal)]')
      expect(fsViewer.className).not.toContain('z-50')
    })

    it('[REQ-302/AC-6] preserves fullscreen viewer zoom, aspect ratio, and wake lock exception without regression', async () => {
      render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={dummyImageUrl}
          onSaveSnapshot={onSaveSnapshot}
        />
      )

      // Sheet preview preserves original aspect ratio styling
      const sheetImg = screen.getByAltText('プレビュー画像')
      expect(sheetImg.className).toContain('object-contain')
      expect(sheetImg.className).toContain('max-h-[60dvh]')

      // Preserves image viewer exception structure (not converted to generic role="dialog" Modal)
      expect(screen.queryByRole('dialog')).toBeNull()

      // Transition to fullscreen
      await act(async () => {
        fireEvent.click(sheetImg)
      })

      const fsViewer = screen.getByTestId('mobile-fullscreen-viewer')
      expect(fsViewer).toBeInTheDocument()
      // Universal safety and mobile viewer constraints
      expect(fsViewer.className).toContain('h-[100dvh]')
      expect(fsViewer.className).toContain('touch-manipulation')
      expect(fsViewer.className).toContain('select-none')

      const fsImg = screen.getByAltText('全画面画像')
      expect(fsImg.className).toContain('object-contain')

      // Wake lock requested on fullscreen
      expect(mockRequest).toHaveBeenCalledWith('screen')

      // Exiting fullscreen releases wake lock
      await act(async () => {
        fireEvent.click(screen.getByTestId('mobile-fullscreen-close-btn'))
      })
      expect(mockRelease).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('mobile-image-sheet')).toBeInTheDocument()
    })
  })

  describe('REQ-431 Horizontal Carousel & Swipe-Down-To-Close', () => {
    const sampleImages = [
      '/api/view?filename=img_0.png',
      '/api/view?filename=img_1.png',
      '/api/view?filename=img_2.png',
      '/api/view?filename=img_3.png',
      '/api/view?filename=img_4.png',
    ]

    const createTouchEventData = (x: number, y: number) => ({
      touches: [{ clientX: x, clientY: y }],
      changedTouches: [{ clientX: x, clientY: y }],
    })

    let originalInnerWidth: number

    beforeEach(() => {
      originalInnerWidth = window.innerWidth
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      })
    })

    it('[REQ-431/AC-1] follows finger on horizontal drag, snaps back below threshold, and switches to older image on left swipe in sheet', () => {
      const onSelectImage = vi.fn()
      render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')
      const track = screen.getByTestId('mobile-image-carousel-track')

      // Finger-following translateX during slow horizontal drag (< threshold 40px)
      const nowSpy = vi.spyOn(Date, 'now')
      nowSpy.mockReturnValue(1000)
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      nowSpy.mockReturnValue(1500)
      fireEvent.touchMove(sheetContent, createTouchEventData(170, 302))
      expect(track.style.transform).toBe('translateX(calc(-100% + -30px))')

      // Release below threshold -> snap back to 0 without selecting
      fireEvent.touchEnd(sheetContent, createTouchEventData(170, 302))
      expect(track.style.transform).toBe('translateX(calc(-100% + 0px))')
      expect(onSelectImage).not.toHaveBeenCalled()

      // Left swipe >= 40px -> selects older image (index + 1)
      nowSpy.mockReturnValue(2000)
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      nowSpy.mockReturnValue(2500)
      fireEvent.touchMove(sheetContent, createTouchEventData(150, 301))
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 301))
      expect(onSelectImage).toHaveBeenCalledWith(sampleImages[2])
    })

    it('[REQ-431/AC-2] mounts at most 3 images in carousel window and keeps alt text unique', () => {
      render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[2]}
          images={sampleImages}
          onSelectImage={vi.fn()}
        />
      )

      const track = screen.getByTestId('mobile-image-carousel-track')
      const imgs = track.querySelectorAll('img')
      expect(imgs.length).toBe(3)
      expect(imgs[0]).toHaveAttribute('src', sampleImages[1])
      expect(imgs[0]).toHaveAttribute('aria-hidden', 'true')
      expect(imgs[1]).toHaveAttribute('src', sampleImages[2])
      expect(imgs[1]).toHaveAttribute('alt', 'プレビュー画像')
      expect(imgs[2]).toHaveAttribute('src', sampleImages[3])
      expect(imgs[2]).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getAllByAltText('プレビュー画像')).toHaveLength(1)
    })

    it('[REQ-431/AC-3] applies 0.25x damping at boundaries and does not wrap around', () => {
      const onSelectImage = vi.fn()
      const { rerender } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[0]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')
      const track = screen.getByTestId('mobile-image-carousel-track')

      // At index 0, swiping right (trying to go newer) applies 0.25x damping and does not switch
      fireEvent.touchStart(sheetContent, createTouchEventData(100, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(180, 300))
      expect(track.style.transform).toBe('translateX(calc(0% + 20px))')
      fireEvent.touchEnd(sheetContent, createTouchEventData(180, 300))
      expect(track.style.transform).toBe('translateX(calc(0% + 0px))')
      expect(onSelectImage).not.toHaveBeenCalled()

      // At last index, swiping left (trying to go older) applies 0.25x damping and does not switch
      rerender(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[4]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(120, 300))
      expect(track.style.transform).toBe('translateX(calc(-400% + -20px))')
      fireEvent.touchEnd(sheetContent, createTouchEventData(120, 300))
      expect(onSelectImage).not.toHaveBeenCalled()
    })

    it('[REQ-431/AC-4] switches images on horizontal swipe in fullscreen while preserving fullscreen mode', () => {
      const onSelectImage = vi.fn()
      const { rerender } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      fireEvent.click(screen.getByAltText('プレビュー画像'))
      const fsViewer = screen.getByTestId('mobile-fullscreen-viewer')
      expect(fsViewer).toBeInTheDocument()

      // Swipe right in fullscreen -> index - 1
      fireEvent.touchStart(fsViewer, createTouchEventData(100, 300))
      fireEvent.touchMove(fsViewer, createTouchEventData(160, 302))
      fireEvent.touchEnd(fsViewer, createTouchEventData(160, 302))
      expect(onSelectImage).toHaveBeenCalledWith(sampleImages[0])

      // Parent updates image prop -> stays in fullscreen
      rerender(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[0]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )
      expect(screen.getByTestId('mobile-fullscreen-viewer')).toBeInTheDocument()
      expect(screen.getByAltText('全画面画像')).toHaveAttribute('src', sampleImages[0])

      // Downward swipe in fullscreen does NOT close sheet
      fireEvent.touchStart(fsViewer, createTouchEventData(150, 100))
      fireEvent.touchMove(fsViewer, createTouchEventData(150, 250))
      fireEvent.touchEnd(fsViewer, createTouchEventData(150, 250))
      expect(onClose).not.toHaveBeenCalled()
    })

    it('[REQ-431/AC-5] closes sheet on swipe down >= 80px or fast flick, snaps back below threshold, and clamps upward drag', () => {
      render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[0]}
          images={sampleImages}
        />
      )

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')

      // Upward drag clamped to 0
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(150, 240))
      expect(sheetContent.style.transform).not.toContain('-60px')
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 240))
      expect(onClose).not.toHaveBeenCalled()

      // Downward drag < 80px (slow) snaps back without closing
      const nowSpy = vi.spyOn(Date, 'now')
      nowSpy.mockReturnValue(1000)
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 200))
      nowSpy.mockReturnValue(1500)
      fireEvent.touchMove(sheetContent, createTouchEventData(150, 250))
      expect(sheetContent.style.transform).toBe('translateY(50px)')
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 250))
      expect(onClose).not.toHaveBeenCalled()
      expect(sheetContent.style.transform).toBe('')

      // Downward drag >= 80px closes sheet
      nowSpy.mockReturnValue(2000)
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 200))
      nowSpy.mockReturnValue(2500)
      fireEvent.touchMove(sheetContent, createTouchEventData(150, 290))
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 290))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('[REQ-431/AC-6] respects scrollTop > 0, diagonal lock, desktop width >= 768px, single image, touchCancel, and error recovery swipe', () => {
      const onSelectImage = vi.fn()
      const { rerender } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')
      const track = screen.getByTestId('mobile-image-carousel-track')

      // scrollTop > 0 blocks both horizontal and vertical gestures
      Object.defineProperty(sheetContent, 'scrollTop', { value: 25, configurable: true })
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(100, 420))
      fireEvent.touchEnd(sheetContent, createTouchEventData(100, 420))
      expect(onSelectImage).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
      Object.defineProperty(sheetContent, 'scrollTop', { value: 0, configurable: true })

      // Diagonal swipe locked to horizontal does not move translateY
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(160, 320))
      expect(sheetContent.style.transform).toBe('')
      expect(track.style.transform).toBe('translateX(calc(-100% + -40px))')
      // touchCancel resets dragOffsetX
      fireEvent.touchCancel(sheetContent)
      expect(track.style.transform).toBe('translateX(calc(-100% + 0px))')

      // Image load error still allows horizontal swipe recovery
      const previewImg = screen.getByAltText('プレビュー画像')
      fireEvent.error(previewImg)
      expect(screen.getByTestId('mobile-sheet-image-error')).toBeInTheDocument()
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(140, 300))
      fireEvent.touchEnd(sheetContent, createTouchEventData(140, 300))
      expect(onSelectImage).toHaveBeenCalledWith(sampleImages[2])

      // Desktop width >= 768px disables swipe-down-to-close
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 200))
      fireEvent.touchMove(sheetContent, createTouchEventData(150, 320))
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 320))
      expect(onClose).not.toHaveBeenCalled()

      // Single image mounts only 1 img
      rerender(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[0]}
          images={[sampleImages[0]]}
          onSelectImage={onSelectImage}
        />
      )
      expect(screen.getByTestId('mobile-image-carousel-track').querySelectorAll('img')).toHaveLength(1)
    })

    it('[REQ-431/Bug-1] preserves DOM node identity and transitions directly via absolute-index coordinates on carousel commit', () => {
      const onSelectImage = vi.fn()
      const { rerender } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')
      const track = screen.getByTestId('mobile-image-carousel-track')
      expect(track.className).toContain('h-[60dvh]')
      expect(track.style.transform).toBe('translateX(calc(-100% + 0px))')

      const nextImgBefore = track.querySelectorAll('img')[2]
      expect(nextImgBefore).toHaveAttribute('src', sampleImages[2])
      expect((nextImgBefore.parentElement as HTMLElement).style.transform).toBe('translateX(200%)')

      // Swipe left >= threshold
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      fireEvent.touchMove(sheetContent, createTouchEventData(120, 300))
      expect(track.style.transition).toBe('none')
      expect(track.style.transform).toBe('translateX(calc(-100% + -80px))')

      // touchEnd immediately calls onSelectImage, resets dragOffsetX to 0, and enables CAROUSEL_TRANSITION
      fireEvent.touchEnd(sheetContent, createTouchEventData(120, 300))
      expect(onSelectImage).toHaveBeenCalledTimes(1)
      expect(onSelectImage).toHaveBeenCalledWith(sampleImages[2])
      expect(track.style.transition).toBe('transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)')

      rerender(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[2]}
          images={sampleImages}
          onSelectImage={onSelectImage}
        />
      )

      expect(track.style.transition).toBe('transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)')
      expect(track.style.transform).toBe('translateX(calc(-200% + 0px))')
      const centerImgAfter = screen.getByAltText('プレビュー画像')
      expect(centerImgAfter).toBe(nextImgBefore)
      expect((centerImgAfter.parentElement as HTMLElement).style.transform).toBe('translateX(200%)')
    })

    it('[REQ-431/Bug-2] sets overscrollBehaviorY while open, restores on close, and calls preventDefault on native touchmove except when scrollTop > 0', () => {
      document.documentElement.style.overscrollBehaviorY = 'auto'
      document.body.style.overscrollBehaviorY = 'auto'

      const { rerender } = render(
        <MobileImageSheet
          isOpen={true}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={vi.fn()}
        />
      )

      expect(document.documentElement.style.overscrollBehaviorY).toBe('contain')
      expect(document.body.style.overscrollBehaviorY).toBe('contain')

      const sheetContent = screen.getByTestId('mobile-image-sheet-content')

      // Vertical swipe-down at scrollTop === 0 -> native touchmove should call preventDefault()
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 200))
      const verticalMove = new Event('touchmove', { bubbles: true, cancelable: true })
      Object.defineProperty(verticalMove, 'touches', { value: [{ clientX: 150, clientY: 230 }] })
      act(() => {
        sheetContent.dispatchEvent(verticalMove)
      })
      expect(verticalMove.defaultPrevented).toBe(true)
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 230))

      // Horizontal swipe -> native touchmove should call preventDefault()
      fireEvent.touchStart(sheetContent, createTouchEventData(200, 300))
      const horizontalMove = new Event('touchmove', { bubbles: true, cancelable: true })
      Object.defineProperty(horizontalMove, 'touches', { value: [{ clientX: 170, clientY: 300 }] })
      act(() => {
        sheetContent.dispatchEvent(horizontalMove)
      })
      expect(horizontalMove.defaultPrevented).toBe(true)
      fireEvent.touchEnd(sheetContent, createTouchEventData(170, 300))

      // scrollTop > 0 -> native touchmove should NOT call preventDefault()
      Object.defineProperty(sheetContent, 'scrollTop', { value: 20, configurable: true })
      fireEvent.touchStart(sheetContent, createTouchEventData(150, 200))
      const scrolledMove = new Event('touchmove', { bubbles: true, cancelable: true })
      Object.defineProperty(scrolledMove, 'touches', { value: [{ clientX: 150, clientY: 230 }] })
      act(() => {
        sheetContent.dispatchEvent(scrolledMove)
      })
      expect(scrolledMove.defaultPrevented).toBe(false)
      fireEvent.touchEnd(sheetContent, createTouchEventData(150, 230))
      Object.defineProperty(sheetContent, 'scrollTop', { value: 0, configurable: true })

      // Closing sheet restores overscrollBehaviorY
      rerender(
        <MobileImageSheet
          isOpen={false}
          onClose={onClose}
          image={sampleImages[1]}
          images={sampleImages}
          onSelectImage={vi.fn()}
        />
      )
      expect(document.documentElement.style.overscrollBehaviorY).toBe('auto')
      expect(document.body.style.overscrollBehaviorY).toBe('auto')
    })
  })
})
