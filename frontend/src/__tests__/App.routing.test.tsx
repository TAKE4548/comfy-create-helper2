import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/layout/AppShell', async () => {
  const { Outlet, NavLink } = await import('react-router-dom')
  return { AppShell: () => <><nav><NavLink to="/">Generate</NavLink><NavLink to="/settings">Settings</NavLink><NavLink to="/studio">Studio</NavLink><NavLink to="/loras">LoRAs</NavLink><NavLink to="/tags">Tags</NavLink><NavLink to="/history">History</NavLink></nav><Outlet /></> }
})
const routeError = vi.hoisted(() => ({ shouldThrow: false }))
vi.mock('../pages/GeneratePage', () => ({ GeneratePage: () => { if (routeError.shouldThrow) throw new Error('route render failure'); return <div>Generate route</div> } }))
vi.mock('../pages/LoRAsPage', () => ({ LoRAsPage: () => <div>LoRAs route</div> }))
vi.mock('../pages/TagsPage', () => ({ TagsPage: () => <div>Tags route</div> }))
vi.mock('../pages/HistoryPage', () => ({ HistoryPage: () => <div>History route</div> }))
vi.mock('../pages/DatasetStudioPage', () => ({ DatasetStudioPage: () => <div>Studio route</div> }))
vi.mock('../pages/SettingsPage', async () => {
  const { useSettingsDraftRegistration } = await import('../pages/SettingsPage/context/SettingsDraftContext')
  return { SettingsPage: () => { useSettingsDraftRegistration('routing-test', { cancelQueued: () => {}, discardLocal: () => {} }); return <div>Settings route</div> } }
})
vi.mock('../store/useGenerationStore', () => ({ useGenerationStore: (select: (state: { initialize: () => void }) => unknown) => select({ initialize: vi.fn() }) }))

let App: typeof import('../App').default
let createAppRoutes: typeof import('../App').createAppRoutes
afterEach(() => { cleanup(); routeError.shouldThrow = false; window.history.replaceState({}, '', '/') })

class OuterBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div>outer error boundary</div> : this.props.children }
}

describe('App route table', () => {
  it('[REQ-381/AC-12] preserves all existing routes and mounts Settings below its draft boundary', async () => {
    window.history.replaceState({}, '', '/')
    const app = await import('../App')
    App = app.default
    createAppRoutes = app.createAppRoutes
    render(<App />)
    expect(await screen.findByText('Generate route')).toBeTruthy()
    for (const [link, text] of [['Studio', 'Studio route'], ['LoRAs', 'LoRAs route'], ['Tags', 'Tags route'], ['History', 'History route'], ['Settings', 'Settings route']] as const) {
      fireEvent.click(screen.getByRole('link', { name: link }))
      expect(await screen.findByText(text)).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
  })

  it('[REQ-381/AC-12] rethrows route render failures to an outer React error boundary', async () => {
    const app = await import('../App')
    createAppRoutes = app.createAppRoutes
    routeError.shouldThrow = true
    const router = createMemoryRouter(createAppRoutes(), { initialEntries: ['/'] })
    render(<OuterBoundary><RouterProvider router={router} /></OuterBoundary>)
    expect(await screen.findByText('outer error boundary')).toBeTruthy()
    router.dispose()
  })
})
