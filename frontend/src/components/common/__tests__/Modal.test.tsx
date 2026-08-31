import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Modal } from '../Modal'

describe('Common Modal component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>
    )
    expect(screen.queryByText('Modal Content')).toBeNull()
  })

  it('renders content with .modal-backdrop when isOpen is true', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>
    )
    expect(screen.getByText('Modal Content')).toBeDefined()
    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).not.toBeNull()
  })

  it('calls onClose when backdrop is clicked', () => {
    const handleClose = vi.fn()
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Modal Content</div>
      </Modal>
    )
    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).not.toBeNull()
    if (backdrop) {
      fireEvent.click(backdrop)
    }
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when inner dialog content is clicked', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose}>
        <div data-testid="inner-content">Modal Content</div>
      </Modal>
    )
    const inner = screen.getByTestId('inner-content')
    fireEvent.click(inner)
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed if closeOnEsc is true', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} closeOnEsc={true}>
        <div>Modal Content</div>
      </Modal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when closeOnEsc is false and Escape is pressed', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} closeOnEsc={false}>
        <div>Modal Content</div>
      </Modal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(handleClose).not.toHaveBeenCalled()
  })
})
