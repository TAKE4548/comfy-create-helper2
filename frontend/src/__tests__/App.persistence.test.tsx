import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { QueryClient, hashKey, useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import 'fake-indexeddb/auto'
import { API_CACHE_BUSTER, API_CACHE_MAX_AGE, createIndexedDBPersister } from '../utils/queryCachePersister'

const api = vi.hoisted(() => ({
  name: 'before',
  list: vi.fn(async () => [{ id: 7, name: api.name }]),
  update: vi.fn(async (_id: number, value: { name: string }) => { api.name = value.name }),
}))

const lazyGate = vi.hoisted(() => ({ generate: undefined as Promise<void> | undefined }))
vi.mock('../api/client', () => ({ workflowsApi: { list: api.list, update: api.update } }))
vi.mock('../components/layout/AppShell', async () => {
  const { Outlet, Link } = await import('react-router-dom')
  return { AppShell: () => <><Link to="/loras">LoRAs</Link><Outlet /></> }
})
vi.mock('../pages/GeneratePage', async () => {
  // Resolves immediately unless a case holds the gate to keep this lazy chunk pending.
  await lazyGate.generate
  const { useMutation, useQuery, useQueryClient } = await import('@tanstack/react-query')
  const { workflowsApi } = await import('../api/client')
  const { useIsRestoring } = await import('@tanstack/react-query')
  return { GeneratePage: () => {
    const queryClient = useQueryClient()
    const query = useQuery({ queryKey: ['workflows'], queryFn: workflowsApi.list })
    const restoring = useIsRestoring()
    const update = useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) => workflowsApi.update(id, { name }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
    })
    return <>
      <span data-testid="restoring">{String(restoring)}</span>
      <span data-testid="workflow">{query.data?.[0]?.name}</span>
      <button onClick={() => update.mutate({ id: 7, name: 'after' })}>update</button>
      <ExcludedQueries />
    </>
  } }
})
vi.mock('../pages/LoRAsPage', () => ({ LoRAsPage: () => <RestoredWorkflow /> }))
vi.mock('../pages/TagsPage', () => ({ TagsPage: () => null }))
vi.mock('../pages/HistoryPage', () => ({ HistoryPage: () => null }))
vi.mock('../pages/SettingsPage', () => ({ SettingsPage: () => null }))
vi.mock('../pages/DatasetStudioPage', () => ({ DatasetStudioPage: () => null }))
vi.mock('../store/useGenerationStore', () => ({ useGenerationStore: (select: (state: { initialize: () => void }) => unknown) => select({ initialize: vi.fn() }) }))

function ExcludedQueries() {
  const client = useQueryClient()
  useEffect(() => {
    for (const key of ['comfy-object-info', 'snapshots', 'workflow-presets', 'prompt-metadata']) {
      client.setQueryData([key], `private-${key}`)
    }
  }, [client])
  useQuery({ queryKey: ['failed'], queryFn: async () => { throw new Error('offline') }, retry: false })
  return null
}

let App: typeof import('../App').default
beforeAll(async () => {
  localStorage.setItem('prompt-surgeon-rq-cache', 'legacy')
  localStorage.setItem('session-token', 'keep')
  App = (await import('../App')).default
})
afterEach(async () => {
  cleanup()
  // Isolate cases from each other: each case seeds or creates its own persisted state.
  window.history.replaceState({}, '', '/')
  await createIndexedDBPersister().removeClient()
})

describe('App IndexedDB query persistence', () => {
  it('updates, persists, and restores eligible queries while excluding private and failed queries', async () => {
    expect(localStorage.getItem('prompt-surgeon-rq-cache')).toBeNull()
    expect(localStorage.getItem('session-token')).toBe('keep')
    const app = render(<App />)
    await waitFor(() => expect(screen.getByTestId('restoring').textContent).toBe('false'))
    await waitFor(() => expect(screen.getByTestId('workflow').textContent).toBe('before'))
    fireEvent.click(screen.getByText('update'))
    await waitFor(() => expect(screen.getByTestId('workflow').textContent).toBe('after'))

    const persister = createIndexedDBPersister()
    await waitFor(async () => {
      const saved = await persister.restoreClient()
      expect(saved?.clientState.queries.find(q => q.queryKey[0] === 'workflows')?.state.data).toEqual([{ id: 7, name: 'after' }])
    }, { timeout: 5000 })
    const snapshot = await persister.restoreClient()
    expect(snapshot?.buster).toBe(API_CACHE_BUSTER)
    expect(API_CACHE_MAX_AGE).toBe(600_000)
    expect(snapshot?.clientState.mutations).toEqual([])
    expect(snapshot?.clientState.queries.map(q => q.queryKey[0])).not.toEqual(expect.arrayContaining([
      'comfy-object-info', 'snapshots', 'workflow-presets', 'prompt-metadata', 'failed',
    ]))

    app.unmount()
    const restoredClient = new QueryClient()
    render(<PersistQueryClientProvider client={restoredClient} persistOptions={{ persister, maxAge: API_CACHE_MAX_AGE, buster: API_CACHE_BUSTER }}>
      <RestoredWorkflow />
    </PersistQueryClientProvider>)
    await waitFor(() => expect(screen.getByTestId('restored').textContent).toBe('after'))
  })

  it('[REQ-309/AC-5] restore-completes-while-lazy-chunk-pending', async ({ task }) => {
    Object.assign(task.meta, { acIds: ['AC-5'], layer: 'integration', caseId: 'restore-completes-while-lazy-chunk-pending' })
    // Self-contained seed: this case must not rely on the preceding case's IndexedDB writes.
    const RESTORED_NAME = 'restored-while-chunk-pending'
    const persister = createIndexedDBPersister()
    await persister.removeClient()
    const now = Date.now()
    const seeded = persister.persistClient({
      buster: API_CACHE_BUSTER,
      timestamp: now,
      clientState: {
        mutations: [],
        queries: [{
          queryKey: ['workflows'],
          queryHash: hashKey(['workflows']),
          state: {
            data: [{ id: 7, name: RESTORED_NAME }], dataUpdateCount: 1, dataUpdatedAt: now,
            error: null, errorUpdateCount: 0, errorUpdatedAt: 0, fetchFailureCount: 0, fetchFailureReason: null,
            fetchMeta: null, isInvalidated: false, status: 'success', fetchStatus: 'idle',
          },
        }],
      },
    })
    await persister.restoreClient() // flushes the pending seed write immediately
    await seeded

    let release!: () => void
    lazyGate.generate = new Promise<void>((resolve) => { release = resolve })
    try {
      window.history.replaceState({}, '', '/')
      vi.resetModules()
      const FreshApp = (await import('../App')).default
      render(<FreshApp />)
      expect(await screen.findByRole('status')).toBeTruthy()
      fireEvent.click(screen.getByRole('link', { name: 'LoRAs' }))
      await waitFor(() => expect(screen.getByTestId('restored').textContent).toBe(RESTORED_NAME), { timeout: 3000 })
    } finally {
      release()
      lazyGate.generate = undefined
    }
  }, 15000)
})

function RestoredWorkflow() {
  const client = useQueryClient()
  const restoring = useIsRestoring()
  return <span data-testid="restored">{restoring ? 'restoring' : client.getQueryData<{ name: string }[]>(['workflows'])?.[0]?.name}</span>
}
