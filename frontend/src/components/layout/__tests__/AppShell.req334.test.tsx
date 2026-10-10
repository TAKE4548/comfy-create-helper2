import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
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
