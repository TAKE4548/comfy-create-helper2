import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary'

vi.mock('../components/layout/AppShell', async () => {
  const { Outlet, NavLink } = await import('react-router-dom')
  return { AppShell: () => <><nav><NavLink to="/">Generate</NavLink><NavLink to="/settings">Settings</NavLink><NavLink to="/studio">Studio</NavLink><NavLink to="/loras">LoRAs</NavLink><NavLink to="/tags">Tags</NavLink><NavLink to="/history">History</NavLink></nav><Outlet /></> }
})
const routeError = vi.hoisted(() => ({ shouldThrow: false }))
// Page factories are re-registered per load (vi.doMock) so each load counts code fetches and reads a fresh context instance.
// `gates[key]` delays code arrival; `failures[key]` makes the chunk import reject. Router, Suspense, and boundaries are real.
const h = vi.hoisted(() => {
  const gates: Record<string, Promise<void> | undefined> = {}
  const failures: Record<string, Error | undefined> = {}
  const calls: Record<string, number> = {}
  const discardLocal = vi.fn()
  const cancelQueued = vi.fn()
  return {
    gates, failures, calls, discardLocal, cancelQueued,
    async load(key: string) {
      calls[key] = (calls[key] ?? 0) + 1
      const failure = failures[key]
      if (failure) throw failure
      await gates[key]
    },
    reset() {
      for (const key of Object.keys(gates)) delete gates[key]
      for (const key of Object.keys(failures)) delete failures[key]
      for (const key of Object.keys(calls)) delete calls[key]
      discardLocal.mockClear()
      cancelQueued.mockClear()
    },
  }
})
vi.mock('../store/useGenerationStore', () => ({ useGenerationStore: (select: (state: { initialize: () => void }) => unknown) => select({ initialize: vi.fn() }) }))

function registerPageMocks() {
  vi.doMock('../pages/GeneratePage', async () => {
    await h.load('Generate')
    return { GeneratePage: () => { if (routeError.shouldThrow) throw new Error('route render failure'); return <div>Generate route</div> } }
  })
  vi.doMock('../pages/LoRAsPage', async () => {
    await h.load('LoRAs')
    return { LoRAsPage: () => <div>LoRAs route</div> }
  })
  vi.doMock('../pages/TagsPage', async () => {
    await h.load('Tags')
    return { TagsPage: () => <div>Tags route</div> }
  })
  vi.doMock('../pages/HistoryPage', async () => {
    await h.load('History')
    return { HistoryPage: () => <div>History route</div> }
  })
  vi.doMock('../pages/DatasetStudioPage', async () => {
    await h.load('Studio')
    return { DatasetStudioPage: () => <div>Studio route</div> }
  })
  vi.doMock('../pages/SettingsPage', async () => {
    await h.load('Settings')
    const { useSettingsDraftRegistration } = await import('../pages/SettingsPage/context/SettingsDraftContext')
    const risk = (over: Partial<Record<'dirty' | 'inFlight', boolean>>) => ({ dirty: false, invalid: false, failed: false, queued: false, inFlight: false, ...over })
    return { SettingsPage: () => {
      const draft = useSettingsDraftRegistration('routing-test', { cancelQueued: h.cancelQueued, discardLocal: h.discardLocal })
      return <div>Settings route
        <button onClick={() => draft.update(risk({ dirty: true }))}>mark dirty</button>
        <button onClick={() => draft.update(risk({ dirty: true, inFlight: true }))}>mark inflight</button>
        <button onClick={() => draft.update(risk({}))}>mark clean</button>
      </div>
    } }
  })
}

let App: typeof import('../App').default
let createAppRoutes: typeof import('../App').createAppRoutes
beforeEach(() => { h.reset(); registerPageMocks() })
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

const ROUTES = [
  { key: 'Generate', path: '/', text: 'Generate route', link: 'Generate' },
  { key: 'Studio', path: '/studio', text: 'Studio route', link: 'Studio' },
  { key: 'LoRAs', path: '/loras', text: 'LoRAs route', link: 'LoRAs' },
  { key: 'Tags', path: '/tags', text: 'Tags route', link: 'Tags' },
  { key: 'History', path: '/history', text: 'History route', link: 'History' },
  { key: 'Settings', path: '/settings', text: 'Settings route', link: 'Settings' },
] as const
const OTHER = (key: string) => ROUTES.filter((r) => r.key !== key).map((r) => r.key)
const DIRTY_PROMPT = '設定に未保存の変更があります'

function tag(task: { meta: Record<string, unknown> }, acIds: string[], caseId: string, layer = 'integration') {
  Object.assign(task.meta, { acIds, layer, caseId })
}

// Each load re-evaluates the App module so React.lazy and the browser router start from a clean state.
async function loadApp(path: string) {
  window.history.replaceState({}, '', path)
  vi.resetModules()
  const mod = await import('../App')
  App = mod.default
  createAppRoutes = mod.createAppRoutes
  return mod
}

function expectOnly(key: string) {
  expect(h.calls[key] ?? 0).toBe(1)
  for (const other of OTHER(key)) expect(h.calls[other] ?? 0).toBe(0)
}

describe('[REQ-309] App route lazy loading', () => {
  it('[REQ-309/AC-1] initial-route-loads-only-generate', async ({ task }) => {
    tag(task, ['AC-1'], 'initial-route-loads-only-generate')
    await loadApp('/')
    render(<App />)
    expect(await screen.findByText('Generate route')).toBeTruthy()
    expectOnly('Generate')
  })

  for (const route of ROUTES) it(`[REQ-309/AC-5] direct-entry-${route.key}`, async ({ task }) => {
    tag(task, ['AC-1', 'AC-5', 'AC-6'], `direct-entry-${route.key}`)
    await loadApp(route.path)
    render(<App />)
    expect(await screen.findByText(route.text)).toBeTruthy()
    expectOnly(route.key)
  })

  for (const route of ROUTES) it(`[REQ-309/AC-5] route-preserved-${route.key}`, async ({ task }) => {
    tag(task, route.key === 'Settings' ? ['AC-5', 'AC-6'] : ['AC-5'], `route-preserved-${route.key}`)
    await loadApp('/')
    render(<App />)
    await screen.findByText('Generate route')
    fireEvent.click(screen.getByRole('link', { name: route.link }))
    expect(await screen.findByText(route.text)).toBeTruthy()
    expect(screen.getByRole('link', { name: route.link }).getAttribute('aria-current')).toBe('page')
  })

  it('[REQ-309/AC-5] history-route-lazy-visible', async ({ task }) => {
    tag(task, ['AC-5'], 'history-route-lazy-visible')
    await loadApp('/')
    render(<App />)
    await screen.findByText('Generate route')
    expect(h.calls.History ?? 0).toBe(0)
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByText('History route')).toBeTruthy()
    expect(h.calls.History).toBe(1)
  })

  it('[REQ-309/AC-6] settings-route-lazy-visible', async ({ task }) => {
    tag(task, ['AC-6'], 'settings-route-lazy-visible')
    await loadApp('/')
    render(<App />)
    await screen.findByText('Generate route')
    expect(h.calls.Settings ?? 0).toBe(0)
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(await screen.findByText('Settings route')).toBeTruthy()
    expect(h.calls.Settings).toBe(1)
  })

  it('[REQ-309/AC-3] initial-route-shows-fallback-then-content', async ({ task }) => {
    tag(task, ['AC-3'], 'initial-route-shows-fallback-then-content')
    let release!: () => void
    h.gates.Generate = new Promise<void>((resolve) => { release = resolve })
    await loadApp('/')
    render(<App />)
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy()
    release()
    expect(await screen.findByText('Generate route')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  for (const route of ROUTES) it(`[REQ-309/AC-5] chunk-load-failure-${route.key}`, async ({ task }) => {
    tag(task, ['AC-5'], `chunk-load-failure-${route.key}`)
    h.failures[route.key] = new TypeError('Failed to fetch dynamically imported module')
    await loadApp(route.path)
    render(<GlobalErrorBoundary><App /></GlobalErrorBoundary>)
    expect(await screen.findByText('ページを再読み込み')).toBeTruthy()
    expect(document.body.textContent?.trim()).not.toBe('')
  })

  it('[REQ-309/AC-5] navigate-during-lazy-load', async ({ task }) => {
    tag(task, ['AC-5'], 'navigate-during-lazy-load')
    let release!: () => void
    h.gates.History = new Promise<void>((resolve) => { release = resolve })
    await loadApp('/')
    render(<App />)
    await screen.findByText('Generate route')
    const historyLink = screen.getByRole('link', { name: 'History' })
    fireEvent.click(historyLink)
    fireEvent.click(historyLink)
    fireEvent.click(screen.getByRole('link', { name: 'LoRAs' }))
    expect(await screen.findByText('LoRAs route')).toBeTruthy()
    release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('History route')).toBeNull()
    expect(screen.getByText('LoRAs route')).toBeTruthy()
    expect(h.calls.History).toBe(1)
  })

  it('[REQ-309/AC-6] leave-guard-blocks-before-lazy-fetch', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-blocks-before-lazy-fetch')
    await loadApp('/settings')
    render(<App />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByText(DIRTY_PROMPT)).toBeTruthy()
    expect(h.calls.History ?? 0).toBe(0)
  })

  it('[REQ-309/AC-6] leave-guard-cancel-keeps-draft', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-cancel-keeps-draft')
    await loadApp('/settings')
    render(<App />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByText(DIRTY_PROMPT)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByText(DIRTY_PROMPT)).toBeNull()
    expect(screen.getByText('Settings route')).toBeTruthy()
    expect(h.calls.History ?? 0).toBe(0)
    expect(h.discardLocal).not.toHaveBeenCalled()
  })

  it('[REQ-309/AC-6] leave-guard-discard-then-lazy-load', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-discard-then-lazy-load')
    await loadApp('/settings')
    render(<App />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    fireEvent.click(await screen.findByRole('button', { name: '変更を破棄して移動' }))
    expect(h.discardLocal).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('History route')).toBeTruthy()
    expect(h.calls.History).toBe(1)
  })

  it('[REQ-309/AC-6] leave-guard-inflight-disables-discard', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-inflight-disables-discard')
    await loadApp('/settings')
    render(<App />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark inflight'))
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    const discard = await screen.findByRole('button', { name: '変更を破棄して移動' }) as HTMLButtonElement
    expect(discard.disabled).toBe(true)
    expect(h.calls.History ?? 0).toBe(0)
  })

  it('[REQ-309/AC-6] leave-guard-pop', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-pop')
    const mod = await loadApp('/')
    const router = createMemoryRouter(mod.createAppRoutes(), { initialEntries: ['/', '/settings'], initialIndex: 1 })
    render(<RouterProvider router={router} />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    await router.navigate(-1)
    expect(await screen.findByText(DIRTY_PROMPT)).toBeTruthy()
    expect(router.state.location.pathname).toBe('/settings')
    router.dispose()
  })

  it('[REQ-309/AC-6] leave-guard-beforeunload', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-beforeunload')
    await loadApp('/settings')
    render(<App />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByText('mark clean'))
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })

  it('[REQ-309/AC-6] leave-guard-same-settings-allowed', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-same-settings-allowed')
    const mod = await loadApp('/settings')
    const router = createMemoryRouter(mod.createAppRoutes(), { initialEntries: ['/settings'] })
    render(<RouterProvider router={router} />)
    await screen.findByText('Settings route')
    fireEvent.click(screen.getByText('mark dirty'))
    await router.navigate('/settings?tab=a#b')
    expect(router.state.location.search).toBe('?tab=a')
    expect(screen.queryByText(DIRTY_PROMPT)).toBeNull()
    router.dispose()
  })

  it('[REQ-309/AC-6] leave-guard-direct-entry', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-direct-entry')
    await loadApp('/settings')
    render(<App />)
    expect(await screen.findByText('Settings route')).toBeTruthy()
    fireEvent.click(screen.getByText('mark dirty'))
    fireEvent.click(screen.getByRole('link', { name: 'Tags' }))
    expect(await screen.findByText(DIRTY_PROMPT)).toBeTruthy()
    expect(h.calls.Tags ?? 0).toBe(0)
  })

  it('[REQ-309/AC-6] leave-guard-not-armed-while-chunk-pending', async ({ task }) => {
    tag(task, ['AC-6'], 'leave-guard-not-armed-while-chunk-pending')
    h.gates.Settings = new Promise<void>(() => {})
    await loadApp('/')
    render(<App />)
    await screen.findByText('Generate route')
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByText('History route')).toBeTruthy()
    expect(screen.queryByText(DIRTY_PROMPT)).toBeNull()
  })
})
