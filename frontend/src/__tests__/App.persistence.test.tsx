import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { QueryClient, useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import 'fake-indexeddb/auto'
import { API_CACHE_BUSTER, API_CACHE_MAX_AGE, createIndexedDBPersister } from '../utils/queryCachePersister'

const api = vi.hoisted(() => ({
  name: 'before',
  list: vi.fn(async () => [{ id: 7, name: api.name }]),
  update: vi.fn(async (_id: number, value: { name: string }) => { api.name = value.name }),
}))

vi.mock('../api/client', () => ({ workflowsApi: { list: api.list, update: api.update } }))
vi.mock('../components/layout/AppShell', async () => {
  const { Outlet } = await import('react-router-dom')
  return { AppShell: () => <Outlet /> }
})
vi.mock('../pages/GeneratePage', async () => {
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
vi.mock('../pages/LoRAsPage', () => ({ LoRAsPage: () => null }))
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
afterEach(cleanup)

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
})

function RestoredWorkflow() {
  const client = useQueryClient()
  const restoring = useIsRestoring()
  return <span data-testid="restored">{restoring ? 'restoring' : client.getQueryData<{ name: string }[]>(['workflows'])?.[0]?.name}</span>
}
