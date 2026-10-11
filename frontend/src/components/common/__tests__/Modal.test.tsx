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

  it('exposes a named modal dialog and keeps the existing desktop size', () => {
    render(
      <Modal isOpen onClose={vi.fn()} ariaLabel="Edit settings" size="5xl">
        <div>Modal Content</div>
      </Modal>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog.className).toContain('md:rounded-2xl')
    expect(dialog.className).toContain('md:max-w-[min(90vw,42.5rem)]')
    expect(dialog.className).toContain('lg:max-w-[42.5rem]')
    expect(dialog.className).toContain('bg-surface-3')
    expect(dialog.className).not.toContain('sm:rounded-2xl')
    const backdrop = dialog.parentElement
    expect(backdrop?.className).toContain('md:items-center')
    expect(backdrop?.className).toContain('md:p-4')
    expect(dialog.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(dialog.querySelector('[aria-hidden="true"]')?.className).toContain('md:hidden')
  })

  it.each([
    ['sm', 'max-w-[36.25rem]', 'md:max-w-[min(90vw,36.25rem)]'],
    ['md', 'max-w-[40rem]', 'md:max-w-[min(90vw,40rem)]'],
    ['lg', 'max-w-[42.5rem]', 'md:max-w-[min(90vw,42.5rem)]'],
    ['xl', 'max-w-[42.5rem]', 'md:max-w-[min(90vw,42.5rem)]'],
    ['4xl', 'max-w-[42.5rem]', 'md:max-w-[min(90vw,42.5rem)]'],
    ['5xl', 'max-w-[42.5rem]', 'md:max-w-[min(90vw,42.5rem)]'],
    ['7xl', 'max-w-[42.5rem]', 'md:max-w-[min(90vw,42.5rem)]'],
  ] as const)('caps ordinary %s dialogs to the approved desktop width', (size, widthClass, tabletClass) => {
    render(<Modal isOpen onClose={vi.fn()} size={size}><div>Content</div></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain(`lg:${widthClass}`)
    expect(dialog.className).toContain(tabletClass)
  })

  it('keeps full as an explicit fullscreen exception while preserving the default ordinary cap', () => {
    const { rerender } = render(<Modal isOpen onClose={vi.fn()}><div>Default</div></Modal>)
    expect(screen.getByRole('dialog').className).toContain('lg:max-w-[42.5rem]')
    rerender(<Modal isOpen onClose={vi.fn()} size="full"><div>Fullscreen</div></Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-w-full')
    expect(dialog.className).not.toContain('md:max-w-')
  })

  it('focuses the first available control, cycles Tab, and restores focus on close', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()

    const handleClose = vi.fn()
    const { rerender } = render(
      <Modal isOpen onClose={handleClose}>
        <button>First</button>
        <button disabled>Disabled</button>
        <button hidden>Hidden</button>
        <button>Last</button>
      </Modal>,
    )

    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    rerender(<Modal isOpen={false} onClose={handleClose}><button>Closed</button></Modal>)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('focuses the dialog when it has no enabled visible focus targets', () => {
    render(
      <Modal isOpen onClose={vi.fn()}>
        <button disabled>Disabled</button>
        <button hidden>Hidden</button>
      </Modal>,
    )

    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(dialog)
  })

  it('lets nested popovers consume Escape before the modal', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen onClose={handleClose}>
        <button onKeyDown={(event) => event.preventDefault()}>Nested popover</button>
      </Modal>,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested popover' }), { key: 'Escape' })
    expect(handleClose).not.toHaveBeenCalled()
  })

  it('respects preventDefault on backdrop clicks and preserves child input state', () => {
    const handleClose = vi.fn()
    const { container } = render(
      <Modal isOpen onClose={handleClose}>
        <input aria-label="Prompt" defaultValue="Keep this text" />
      </Modal>,
    )

    const input = screen.getByRole('textbox', { name: 'Prompt' })
    fireEvent.change(input, { target: { value: 'Updated text' } })
    expect(input).toHaveValue('Updated text')

    const backdrop = container.querySelector('.modal-backdrop')!
    backdrop.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true })
    fireEvent.click(backdrop)
    expect(handleClose).not.toHaveBeenCalled()
    expect(input).toHaveValue('Updated text')
  })

  it('locks body scroll when opened and restores original overflow on close and unmount', () => {
    document.body.style.overflow = ''
    const { rerender, unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )

    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal isOpen={false} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('')

    rerender(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('preserves body scroll lock when multiple modals are open and restores only when all are closed', () => {
    document.body.style.overflow = ''
    const { unmount: unmountModal1 } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal 1</div>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    const { unmount: unmountModal2 } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal 2</div>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    unmountModal2()
    expect(document.body.style.overflow).toBe('hidden')

    unmountModal1()
    expect(document.body.style.overflow).toBe('')
  })

  it('includes overscroll-contain on both the backdrop and dialog container', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )

    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop?.className).toContain('overscroll-contain')

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('overscroll-contain')
  })
})
