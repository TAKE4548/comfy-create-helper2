import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomSheet } from '../BottomSheet'

describe('BottomSheet component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()}>
        <div>Sheet Content</div>
      </BottomSheet>
    )
    expect(screen.queryByText('Sheet Content')).toBeNull()
    expect(screen.queryByTestId('bottom-sheet-backdrop')).toBeNull()
  })

  it('renders title, content, footer and drag handle when isOpen is true', () => {
    render(
      <BottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="Test Sheet Title"
        footer={<button>Confirm</button>}
      >
        <div>Sheet Content Body</div>
      </BottomSheet>
    )

    expect(screen.getByTestId('bottom-sheet-backdrop')).toBeDefined()
    expect(screen.getByTestId('bottom-sheet-drag-handle')).toBeDefined()
    expect(screen.getByText('Test Sheet Title')).toBeDefined()
    expect(screen.getByText('Sheet Content Body')).toBeDefined()
    expect(screen.getByText('Confirm')).toBeDefined()
  })

  it('calls onClose when backdrop is clicked if closeOnBackdropClick is true', () => {
    const handleClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={handleClose} closeOnBackdropClick={true}>
        <div>Sheet Content</div>
      </BottomSheet>
    )

    const backdrop = screen.getByTestId('bottom-sheet-backdrop')
    fireEvent.click(backdrop)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when backdrop is clicked if closeOnBackdropClick is false', () => {
    const handleClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={handleClose} closeOnBackdropClick={false}>
        <div>Sheet Content</div>
      </BottomSheet>
    )

    const backdrop = screen.getByTestId('bottom-sheet-backdrop')
    fireEvent.click(backdrop)
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('does not call onClose when sheet container is clicked', () => {
    const handleClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={handleClose}>
        <div data-testid="inner-content">Sheet Content</div>
      </BottomSheet>
    )

    const container = screen.getByTestId('bottom-sheet-container')
    fireEvent.click(container)
    expect(handleClose).not.toHaveBeenCalled()

    const inner = screen.getByTestId('inner-content')
    fireEvent.click(inner)
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={handleClose}>
        <div>Sheet Content</div>
      </BottomSheet>
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  describe('touch swipe gestures', () => {
    it('calls onClose when swiped downwards past the threshold (>= 80px)', () => {
      const handleClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={handleClose}>
          <div>Swipeable Content</div>
        </BottomSheet>
      )

      const container = screen.getByTestId('bottom-sheet-container')

      // Touch start at Y=100
      fireEvent.touchStart(container, {
        touches: [{ clientY: 100 }],
      })

      // Touch move to Y=200 (delta = +100px >= 80px)
      fireEvent.touchMove(container, {
        touches: [{ clientY: 200 }],
      })

      // Touch end
      fireEvent.touchEnd(container)

      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when swiped downwards below the threshold (< 80px) and resets translateY', () => {
      const handleClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={handleClose}>
          <div>Swipeable Content</div>
        </BottomSheet>
      )

      const container = screen.getByTestId('bottom-sheet-container')

      // Touch start at Y=100
      fireEvent.touchStart(container, {
        touches: [{ clientY: 100 }],
      })

      // Touch move to Y=150 (delta = +50px < 80px)
      fireEvent.touchMove(container, {
        touches: [{ clientY: 150 }],
      })

      // Verify intermediate transform during drag
      expect(container.style.transform).toBe('translateY(50px)')

      // Touch end
      fireEvent.touchEnd(container)

      expect(handleClose).not.toHaveBeenCalled()
      expect(container.style.transform).toBe('translateY(0px)')
    })

    it('suppresses upward dragging and does not call onClose', () => {
      const handleClose = vi.fn()
      render(
        <BottomSheet isOpen={true} onClose={handleClose}>
          <div>Swipeable Content</div>
        </BottomSheet>
      )

      const container = screen.getByTestId('bottom-sheet-container')

      // Touch start at Y=100
      fireEvent.touchStart(container, {
        touches: [{ clientY: 100 }],
      })

      // Touch move to Y=50 (delta = -50px, upward drag)
      fireEvent.touchMove(container, {
        touches: [{ clientY: 50 }],
      })

      // Should be clamped to 0
      expect(container.style.transform).toBe('translateY(0px)')

      fireEvent.touchEnd(container)
      expect(handleClose).not.toHaveBeenCalled()
    })
  })

  it('applies custom className and custom maxHeight', () => {
    render(
      <BottomSheet
        isOpen={true}
        onClose={vi.fn()}
        className="custom-sheet-class"
        maxHeight="50dvh"
      >
        <div>Content</div>
      </BottomSheet>
    )

    const container = screen.getByTestId('bottom-sheet-container')
    expect(container.className).toContain('custom-sheet-class')
    expect(container.style.maxHeight).toBe('50dvh')
  })
})
