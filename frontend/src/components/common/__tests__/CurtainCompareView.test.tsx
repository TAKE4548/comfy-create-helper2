import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CurtainCompareView } from '../CurtainCompareView'
import { LightboxModal } from '../LightboxModal'

describe('CurtainCompareView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders single image mode when imageB is not provided', () => {
    render(<CurtainCompareView imageA="test-a.png" />)

    const imgA = screen.getByTestId('curtain-image-a')
    expect(imgA).toBeDefined()
    expect(imgA.getAttribute('src')).toBe('test-a.png')
    expect(screen.queryByTestId('curtain-image-b')).toBeNull()
    expect(screen.queryByTestId('curtain-split-divider')).toBeNull()
  })

  it('renders both images and split divider when imageB is provided', () => {
    render(<CurtainCompareView imageA="test-a.png" imageB="test-b.png" initialSplit={40} />)

    const imgA = screen.getByTestId('curtain-image-a')
    const imgB = screen.getByTestId('curtain-image-b')
    const divider = screen.getByTestId('curtain-split-divider')

    expect(imgA.getAttribute('src')).toBe('test-a.png')
    expect(imgB.getAttribute('src')).toBe('test-b.png')
    expect(divider).toBeDefined()
    expect(divider.style.left).toBe('40%')
    expect(screen.getByTestId('split-indicator').textContent).toContain('40%')
  })

  it('handles mouse wheel zoom clamped between 1.0 and 4.0', () => {
    render(<CurtainCompareView imageA="test-a.png" />)
    const container = screen.getByTestId('curtain-compare-container')
    const indicator = screen.getByTestId('zoom-indicator')

    expect(indicator.textContent).toBe('100%')

    // Wheel up: zoom in
    fireEvent.wheel(container, { deltaY: -100 })
    expect(indicator.textContent).toBe('120%')

    // Zoom in multiple times until clamped at 400%
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(container, { deltaY: -100 })
    }
    expect(indicator.textContent).toBe('400%')

    // Wheel down: zoom out until clamped at 100%
    for (let i = 0; i < 25; i++) {
      fireEvent.wheel(container, { deltaY: 100 })
    }
    expect(indicator.textContent).toBe('100%')
  })

  it('resets zoom and pan when Reset button is clicked', () => {
    render(<CurtainCompareView imageA="test-a.png" />)
    const container = screen.getByTestId('curtain-compare-container')

    fireEvent.wheel(container, { deltaY: -100 })
    expect(screen.getByTestId('zoom-indicator').textContent).toBe('120%')

    const resetButton = screen.getByTestId('reset-zoom-button')
    fireEvent.click(resetButton)

    expect(screen.getByTestId('zoom-indicator').textContent).toBe('100%')
  })

  it('handles pan drag via pointer events', () => {
    render(<CurtainCompareView imageA="test-a.png" />)
    const container = screen.getByTestId('curtain-compare-container')
    const imgA = screen.getByTestId('curtain-image-a')

    const dispatchPointer = (target: HTMLElement, type: string, clientX: number, clientY: number, button = 0) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: button },
      })
      fireEvent(target, event)
    }

    // Pointer down to start pan
    dispatchPointer(container, 'pointerdown', 100, 100, 0)

    // Move pointer on container
    dispatchPointer(container, 'pointermove', 150, 130)
    expect(imgA.style.transform).toContain('translate(50px, 30px)')

    // Release pointer
    dispatchPointer(container, 'pointerup', 150, 130)

    // Further move should not alter pan
    dispatchPointer(container, 'pointermove', 200, 200)
    expect(imgA.style.transform).toContain('translate(50px, 30px)')
  })

  it('handles split divider pointer dragging and updates splitPercent', () => {
    render(<CurtainCompareView imageA="test-a.png" imageB="test-b.png" initialSplit={50} />)
    const container = screen.getByTestId('curtain-compare-container')
    const divider = screen.getByTestId('curtain-split-divider')

    const dispatchPointer = (target: HTMLElement, type: string, clientX: number, clientY: number, button = 0) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        clientX: { value: clientX },
        clientY: { value: clientY },
        button: { value: button },
      })
      fireEvent(target, event)
    }

    // Mock getBoundingClientRect on container
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      width: 1000,
      height: 600,
      right: 1100,
      bottom: 600,
      x: 100,
      y: 0,
      toJSON: () => {},
    })

    // Pointer down on divider
    dispatchPointer(divider, 'pointerdown', 600, 300, 0)

    // Move pointer to 350px (relative offset = (350 - 100) / 1000 = 25%)
    dispatchPointer(divider, 'pointermove', 350, 300)
    expect(divider.style.left).toBe('25%')
    expect(screen.getByTestId('split-indicator').textContent).toContain('25%')

    // Release divider drag
    dispatchPointer(divider, 'pointerup', 350, 300)
  })

  it('handles keyboard shortcuts: [Esc], [Space], [K], [D]', () => {
    const handleClose = vi.fn()
    const handleKeep = vi.fn()
    const handleDiscard = vi.fn()

    render(
      <CurtainCompareView
        imageA="img-a.jpg"
        imageB="img-b.jpg"
        initialSplit={50}
        onClose={handleClose}
        onKeep={handleKeep}
        onDiscard={handleDiscard}
      />
    )

    // [Esc] triggers onClose
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)

    // [Space] toggles split from 50 to 0
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByTestId('split-indicator').textContent).toContain('0%')

    // At split 0%, active image is img-a.jpg
    fireEvent.keyDown(window, { key: 'k' })
    expect(handleKeep).toHaveBeenCalledWith('img-a.jpg')

    fireEvent.keyDown(window, { key: 'd' })
    expect(handleDiscard).toHaveBeenCalledWith('img-a.jpg')

    // Press [Space] again: toggles split from 0 to 100
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByTestId('split-indicator').textContent).toContain('100%')

    // At split 100%, active image is img-b.jpg
    fireEvent.keyDown(window, { key: 'k' })
    expect(handleKeep).toHaveBeenCalledWith('img-b.jpg')

    fireEvent.keyDown(window, { key: 'd' })
    expect(handleDiscard).toHaveBeenCalledWith('img-b.jpg')
  })

  it('triggers keep and discard via button clicks', () => {
    const handleKeep = vi.fn()
    const handleDiscard = vi.fn()

    render(
      <CurtainCompareView
        imageA="img-a.jpg"
        imageB="img-b.jpg"
        initialSplit={100}
        onKeep={handleKeep}
        onDiscard={handleDiscard}
      />
    )

    fireEvent.click(screen.getByTestId('keep-button'))
    expect(handleKeep).toHaveBeenCalledWith('img-b.jpg')

    fireEvent.click(screen.getByTestId('discard-button'))
    expect(handleDiscard).toHaveBeenCalledWith('img-b.jpg')
  })
})

describe('LightboxModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <LightboxModal isOpen={false} onClose={vi.fn()}>
        <div>Lightbox Content</div>
      </LightboxModal>
    )
    expect(screen.queryByText('Lightbox Content')).toBeNull()
  })

  it('renders content and dialog role when isOpen is true', () => {
    render(
      <LightboxModal isOpen={true} onClose={vi.fn()} ariaLabel="Comparison Modal">
        <div>Lightbox Content</div>
      </LightboxModal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(dialog.getAttribute('aria-label')).toBe('Comparison Modal')
    expect(screen.getByText('Lightbox Content')).toBeDefined()
  })

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn()
    render(
      <LightboxModal isOpen={true} onClose={handleClose}>
        <div>Lightbox Content</div>
      </LightboxModal>
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <LightboxModal isOpen={true} onClose={handleClose}>
        <div>Lightbox Content</div>
      </LightboxModal>
    )

    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
