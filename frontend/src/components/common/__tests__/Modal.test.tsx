import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

  it('[REQ-365/AC-9] renders the sheet handle with testid and applies sheetMaxHeightClass', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()} sheetMaxHeightClass="max-h-[85dvh]">
        <div>Modal Content</div>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('max-h-[85dvh]')
    expect(dialog.className).not.toContain('calc(100dvh-env(safe-area-inset-top))')
    const handle = screen.getByTestId('modal-sheet-handle')
    expect(handle.className).toContain('md:hidden')
    expect(handle.getAttribute('aria-hidden')).toBe('true')
    unmount()

    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-env(safe-area-inset-top))]')
  })

  it('[REQ-365/AC-9] falls back to the default max-height class when sheetMaxHeightClass is empty', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} sheetMaxHeightClass="">
        <div>Modal Content</div>
      </Modal>,
    )
    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-env(safe-area-inset-top))]')
  })

  it('[REQ-365/AC-9] keeps rounded-t-2xl and items-end bottom-sheet classes on mobile', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop?.className).toContain('items-end')
    expect(backdrop?.className).toContain('md:items-center')
    expect(screen.getByRole('dialog').className).toContain('rounded-t-2xl')
  })

  it('[REQ-365/AC-9] exempts the sheet from the global radius override and keeps responsive radius classes', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.hasAttribute('data-radius-exempt')).toBe(true)
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog.className).toContain('rounded-b-none')
    expect(dialog.className).toContain('md:rounded-2xl')
  })

  it('[REQ-365/AC-9] exposes sheetMaxHeightClass max-h-[...] value to the mobile sheet CSS only when provided', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} sheetMaxHeightClass="max-h-[85dvh]">
        <div>Modal Content</div>
      </Modal>,
    )
    let dialog = screen.getByRole('dialog')
    expect(dialog.hasAttribute('data-sheet-max-height')).toBe(true)
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
    expect(dialog.className).toContain('max-h-[85dvh]')

    rerender(
      <Modal isOpen={true} onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    dialog = screen.getByRole('dialog')
    expect(dialog.hasAttribute('data-sheet-max-height')).toBe(false)
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('')
    expect(dialog.className).toContain('max-h-[calc(100dvh-env(safe-area-inset-top))]')
  })

  it('[REQ-302/AC-2] eliminates mobile-nav-height offset from backdrop padding-bottom at all breakpoints', () => {
    const cssPath = resolve(__dirname, '../../../index.css')
    const css = readFileSync(cssPath, 'utf-8')

    // Find the .modal-backdrop base rule block
    const backdropMatch = css.match(/\.modal-backdrop\s*\{([^}]+)\}/)
    expect(backdropMatch).not.toBeNull()
    const backdropBody = backdropMatch![1]

    // Must not contain --mobile-nav-height
    expect(backdropBody).not.toContain('--mobile-nav-height')
    // Base rule must set padding-bottom with 1rem + env(safe-area-inset-bottom, 0px)
    expect(backdropBody).toMatch(/padding-bottom:\s*calc\(\s*1rem\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\s*\);/)

    // Ensure no media query block re-introduces --mobile-nav-height into .modal-backdrop
    const mobileNavMatches = css.match(/\.modal-backdrop[^{]*\{[^}]*--mobile-nav-height[^}]*\}/g)
    expect(mobileNavMatches).toBeNull()
  })

  it('[REQ-302/AC-2] applies uniform 1rem padding-bottom in 768-1023px tablet range without nav margin', () => {
    const cssPath = resolve(__dirname, '../../../index.css')
    const css = readFileSync(cssPath, 'utf-8')

    // Obsolete selector excluding dialogs or flex-col must be removed
    expect(css).not.toContain('.modal-backdrop:not(.flex-col):not(:fullscreen):not(:has(> [role=\'dialog\']))')

    // Under @media (min-width: 768px), .modal-backdrop has uniform padding-bottom: 1rem;
    const media768Match = css.match(/@media\s*\(\s*min-width:\s*768px\s*\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/)
    expect(media768Match).not.toBeNull()
    expect(media768Match![0]).toMatch(/\.modal-backdrop\s*\{[^}]*padding-bottom:\s*1rem;/)
  })

  it('[REQ-302/AC-5] incorporates env(safe-area-inset-bottom) with 0px fallback and avoids double padding', () => {
    const cssPath = resolve(__dirname, '../../../index.css')
    const css = readFileSync(cssPath, 'utf-8')

    // Verify safe-area-inset-bottom has 0px fallback in .modal-backdrop
    expect(css).toContain('env(safe-area-inset-bottom, 0px)')

    // Render Modal and verify backdrop and dialog classes
    const { container } = render(
      <Modal isOpen onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    )
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    expect(backdrop.className).toContain('modal-backdrop')

    // Dialog has safe-area inset at mobile and resets at md:pb-0
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(dialog.className).toContain('md:pb-0')

    // Neither backdrop nor dialog introduces --mobile-nav-height inline or utility
    expect(backdrop.className).not.toContain('mobile-nav')
    expect(dialog.className).not.toContain('mobile-nav')
    expect(backdrop.style.paddingBottom).toBe('')
  })
})
