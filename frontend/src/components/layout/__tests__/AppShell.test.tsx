import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Modal } from '../../common/Modal'
import { AppShell } from '../AppShell'

const routes = [
  { path: '/', label: 'Generate', id: 'nav-generate' },
  { path: '/studio', label: 'Studio', id: 'nav-studio' },
  { path: '/loras', label: 'LoRAs', id: 'nav-loras' },
  { path: '/tags', label: 'Tags', id: 'nav-tags' },
  { path: '/history', label: 'History', id: 'nav-history' },
  { path: '/settings', label: 'Settings', id: 'nav-settings' },
]

function CurrentRoute() {
  const location = useLocation()
  return <output data-testid="current-route">{location.pathname}</output>
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CurrentRoute />} />
          {routes.slice(1).map(({ path }) => (
            <Route key={path} path={path.slice(1)} element={<CurrentRoute />} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell REQ-334 navigation', () => {
  it.each(routes)('$label remains reachable and marks the active route', ({ path, id, label }) => {
    renderApp()

    const desktopLink = document.getElementById(id)!
    expect(desktopLink).toHaveAccessibleName(label)
    fireEvent.click(desktopLink)
    expect(screen.getByTestId('current-route')).toHaveTextContent(path)
    expect(desktopLink).toHaveAttribute('aria-current', 'page')

    const mobileLink = document.getElementById(`${id}-mobile`)!
    expect(mobileLink).toHaveAccessibleName(label)
    fireEvent.click(mobileLink)
    expect(screen.getByTestId('current-route')).toHaveTextContent(path)
    expect(mobileLink).toHaveAttribute('aria-current', 'page')
  })

  it('uses a 56px tablet rail and preserves the desktop collapse preference', () => {
    localStorage.setItem('prompt-surgeon-sidebar-collapsed', 'true')
    const collapsedRender = renderApp()

    const sidebar = screen.getByRole('complementary')
    expect(sidebar.className).toContain('w-14')
    expect(sidebar.className).toContain('lg:w-16')
    expect(localStorage.getItem('prompt-surgeon-sidebar-collapsed')).toBe('true')

    collapsedRender.unmount()
    localStorage.setItem('prompt-surgeon-sidebar-collapsed', 'false')
    renderApp()
    expect(screen.getByRole('complementary').className).toContain('lg:w-56')
    expect(localStorage.getItem('prompt-surgeon-sidebar-collapsed')).toBe('false')
  })

  it('keeps navigation targets at least 44px in both navigation layouts', () => {
    renderApp()

    for (const { id } of routes) {
      for (const suffix of ['', '-mobile']) {
        const link = document.getElementById(`${id}${suffix}`)!
        expect(link.className).toContain('min-h-11')
        expect(link.className).toContain('min-w-11')
      }
    }
  })
})

function renderAppWithModal(initialModalOpen = true, closeOnBackdropClick = true) {
  let setModalOpenState: (open: boolean) => void = () => {}

  function PageWithModal() {
    const location = useLocation()
    const [isOpen, setIsOpen] = useState(initialModalOpen)
    setModalOpenState = setIsOpen

    return (
      <div>
        <output data-testid="current-route">{location.pathname}</output>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          data-testid="page-action-btn"
        >
          Page Action
        </button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          closeOnBackdropClick={closeOnBackdropClick}
          ariaLabel="Test Modal Overlay"
        >
          <div data-testid="modal-content">
            <h2>Active Overlay Modal</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              data-testid="modal-close-btn"
            >
              閉じる
            </button>
          </div>
        </Modal>
      </div>
    )
  }

  const result = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PageWithModal />} />
          {routes.slice(1).map(({ path }) => (
            <Route key={path} path={path.slice(1)} element={<CurrentRoute />} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  )

  return {
    ...result,
    setModalOpen: (open: boolean) => setModalOpenState(open),
  }
}

describe('AppShell REQ-302 modal overlay and navigation shielding', () => {
  it('[REQ-302/AC-1] mobile navigation is not clickable or accessible when modal overlay is present', () => {
    // 1. Verify CSS stacking hierarchy contract between mobile navigation and modal backdrop
    const cssPath = resolve(__dirname, '../../../index.css')
    const css = readFileSync(cssPath, 'utf-8')

    // Root CSS defines --z-mobile-nav: 50 and --z-modal: 100 with modal having higher elevation
    const mobileNavZMatch = css.match(/--z-mobile-nav:\s*(\d+);/)
    const modalZMatch = css.match(/--z-modal:\s*(\d+);/)
    expect(mobileNavZMatch).not.toBeNull()
    expect(modalZMatch).not.toBeNull()
    const zMobileNav = parseInt(mobileNavZMatch![1], 10)
    const zModal = parseInt(modalZMatch![1], 10)
    expect(zModal).toBeGreaterThan(zMobileNav)
    expect(zMobileNav).toBe(50)
    expect(zModal).toBe(100)

    // .modal-backdrop is fixed inset-0 with z-index: var(--z-modal)
    const backdropMatch = css.match(/\.modal-backdrop\s*\{([^}]+)\}/)
    expect(backdropMatch).not.toBeNull()
    expect(backdropMatch![1]).toContain('z-index: var(--z-modal);')
    expect(backdropMatch![1]).toContain('inset: 0;')

    // 2. Render AppShell with active modal overlay
    const { container, setModalOpen } = renderAppWithModal(true)

    // Mobile nav element has class z-[var(--z-mobile-nav)]
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(mobileNav.className).toContain('z-[var(--z-mobile-nav)]')

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement
    expect(backdrop).toBeInTheDocument()

    // 3. Focus trapping: Tab navigation cannot escape into mobile nav items
    expect(dialog).toContainElement(document.activeElement)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(dialog).toContainElement(document.activeElement)

    for (const { id } of routes) {
      const mobileLink = document.getElementById(`${id}-mobile`)!
      expect(document.activeElement).not.toBe(mobileLink)
    }

    // 4. Pointer clicks over the modal overlay covering the bottom navigation do not leak to route change
    fireEvent.click(backdrop)
    expect(screen.getByTestId('current-route')).toHaveTextContent('/')

    // 5. When modal closes, normal mobile navigation is restored
    act(() => {
      setModalOpen(false)
    })
    expect(screen.queryByRole('dialog')).toBeNull()

    const studioMobileLink = document.getElementById('nav-studio-mobile')!
    fireEvent.click(studioMobileLink)
    expect(screen.getByTestId('current-route')).toHaveTextContent('/studio')
    expect(studioMobileLink).toHaveAttribute('aria-current', 'page')
  })

  it('[REQ-302/AC-1] [RedTeam] RT-1: rapid sequential clicks on bottom nav are fully trapped by modal backdrop', () => {
    // Render AppShell with persistent modal overlay (closeOnBackdropClick = false)
    const { container } = renderAppWithModal(true, false)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    const backdrop = container.querySelector('.modal-backdrop') as HTMLElement
    expect(backdrop).toBeInTheDocument()

    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    const navClickSpy = vi.fn()
    mobileNav.addEventListener('click', navClickSpy)

    // Dispatch rapid sequential pointerdown and click events across navigation areas
    const targetIds = ['nav-studio', 'nav-loras', 'nav-tags', 'nav-history', 'nav-settings']
    for (let round = 0; round < 3; round++) {
      for (const id of targetIds) {
        fireEvent.pointerDown(backdrop, { clientX: 200, clientY: 750 })
        fireEvent.click(backdrop, { clientX: 200, clientY: 750 })
      }
    }

    // Nav element received zero click events; route remained strictly on '/'
    expect(navClickSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('current-route')).toHaveTextContent('/')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    mobileNav.removeEventListener('click', navClickSpy)
  })
})
