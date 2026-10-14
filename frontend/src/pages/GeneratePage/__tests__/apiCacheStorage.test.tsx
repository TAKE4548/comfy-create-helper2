import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, dehydrate, hydrate, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { API_CACHE_BUSTER, createIndexedDBPersister } from '../../../utils/queryCachePersister'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MatrixGenerationStep } from '../../DatasetStudioPage/components/MatrixGenerationStep'
import { useStudioStore } from '../../DatasetStudioPage/useStudioStore'
import { saveStudioDraft } from '../../DatasetStudioPage/utils/studioDraftStorage'
import { ResourceGaugeChips } from '../../../components/ResourceGauge/ResourceGaugeChips'
import { formatStorageUsage } from '../../../utils/browserStorageUsage'
import { usePresetState } from '../hooks/usePresetState'
import { cleanupAllTestState } from '../../../test/utils'

vi.mock('../../../api/client', () => ({
  datasetApi: { getProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(), calculateMatrix: vi.fn() },
  workflowsApi: { list: vi.fn(), get: vi.fn(), update: vi.fn() },
  workflowPresetsApi: { list: vi.fn() },
  mappingMastersApi: { list: vi.fn() },
  bypassProfilesApi: { list: vi.fn().mockResolvedValue([]) },
  comfyApi: { queuePrompt: vi.fn() },
}))
import { comfyApi, datasetApi, workflowsApi, mappingMastersApi, workflowPresetsApi } from '../../../api/client'
import { DesktopLayout } from '../components/DesktopLayout'

const makePersister = (idb: IDBFactory, now: () => number) =>
  createIndexedDBPersister({ indexedDB: idb, storage: localStorage, now })

const values = (storage: Storage) => Object.fromEntries(
  Array.from({ length: storage.length }, (_, i) => storage.key(i)!)
    .sort().map(key => [key, storage.getItem(key)]),
)
const bytes = (entries: Record<string, string | null>) => Object.entries(entries)
  .reduce((sum, [key, value]) => sum + (key.length + (value?.length ?? 0)) * 2, 0)
const persisted = (client: QueryClient, now: number) => ({
  timestamp: now, buster: API_CACHE_BUSTER, clientState: dehydrate(client),
})
const makeLegacyValue = () => JSON.stringify({ payload: 'x'.repeat(2_097_152 - JSON.stringify({ payload: '' }).length) })

describe('REQ-332 API cache storage integration', () => {
  let idb: IDBFactory
  let now: number

  beforeEach(() => {
    cleanupAllTestState()
    idb = new IDBFactory()
    now = 1_800_000_000_000
    localStorage.setItem('prompt-surgeon-settings', '{"theme":"dark"}')
    localStorage.setItem('prompt-surgeon-meta-keep', '{"seed":9}')
    sessionStorage.setItem('studio-draft-10', '{"name":"draft"}')
  })

  afterEach(() => {
    cleanupAllTestState()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('[REQ-332/AC-1] removes the legacy value and measures remaining localStorage in the visible gauge', async () => {
    localStorage.removeItem('prompt-surgeon-meta-keep')
    localStorage.setItem('workflow-input-7', '{"prompt":"keep"}')
    localStorage.setItem('batch-urls', '["https://batch"]')
    localStorage.setItem('selected-url', 'https://selected')
    const oldValue = makeLegacyValue()
    expect(oldValue.length).toBe(2_097_152)
    localStorage.setItem('prompt-surgeon-rq-cache', oldValue)
    const records = Array.from({ length: 30 }, (_, i) => ({ promptId: `record-${i}`, timestamp: now + i, payload: '' }))
    const fixedLength = records.reduce((total, record) => total + JSON.stringify(record).length, 0)
    records[0].payload = 'x'.repeat(786_432 - fixedLength)
    records.forEach(record => localStorage.setItem(`prompt-surgeon-meta-${record.promptId}`, JSON.stringify(record)))
    expect(records.reduce((total, record) => total + JSON.stringify(record).length, 0)).toBe(786_432)
    const beforeLocal = values(localStorage)
    const beforeSession = values(sessionStorage)
    const persister = makePersister(idb, () => now)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['workflows'], { payload: 'x'.repeat(2_097_152) })

    await persister.persistClient(persisted(queryClient, now))
    const restored = await persister.restoreClient()
    const localAfter = values(localStorage)
    const sessionAfter = values(sessionStorage)

    expect(restored?.clientState.queries.find(q => q.queryKey[0] === 'workflows')?.state.data)
      .toEqual({ payload: 'x'.repeat(2_097_152) })
    expect(localAfter['prompt-surgeon-rq-cache']).toBeUndefined()
    expect(localAfter['prompt-surgeon-settings']).toBe(beforeLocal['prompt-surgeon-settings'])
    expect(localAfter['workflow-input-7']).toBe(beforeLocal['workflow-input-7'])
    expect(localAfter['batch-urls']).toBe(beforeLocal['batch-urls'])
    expect(localAfter['selected-url']).toBe(beforeLocal['selected-url'])
    expect(Object.keys(localAfter).filter(key => key.startsWith('prompt-surgeon-meta-'))).toHaveLength(30)
    for (const record of records) expect(localAfter[`prompt-surgeon-meta-${record.promptId}`]).toBe(beforeLocal[`prompt-surgeon-meta-${record.promptId}`])
    expect(sessionAfter).toEqual(beforeSession)
    const gaugeBytes = bytes(localAfter)
    vi.useFakeTimers()
    render(<ResourceGaugeChips />)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(2500))
    expect(screen.getByText(`localStorage ${formatStorageUsage({ status: 'ok', bytes: gaugeBytes })}`)).toBeInTheDocument()
  })

  it('[REQ-332/AC-15] excludes a stale preset until the server returns its latest value', async () => {
    const idb = new IDBFactory()
    const persister = makePersister(idb, () => now)
    const cached = new QueryClient()
    cached.setQueryData(['workflows'], [{ id: 7, name: 'workflow remains eligible' }])
    cached.setQueryData(['workflow-presets', 7], [{ id: 91, name: 'stale preset', workflow_id: 7, param_values: {} }])
    await persister.persistClient(persisted(cached, now))
    const restored = await persister.restoreClient()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    hydrate(client, restored!.clientState)
    expect(client.getQueryData(['workflows'])).toEqual([{ id: 7, name: 'workflow remains eligible' }])
    expect(client.getQueryData(['workflow-presets', 7])).toBeUndefined()

    let resolvePresets!: (value: unknown[]) => void
    vi.mocked(workflowPresetsApi.list).mockReset()
    vi.mocked(workflowPresetsApi.list).mockReturnValue(new Promise(resolve => { resolvePresets = resolve }) as never)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => usePresetState({ selectedWorkflowId: 7, workflow: undefined }), { wrapper })
    expect(result.current.presets).toBeUndefined()
    const serverPreset = { id: 91, name: 'server latest preset', workflow_id: 7, param_values: {} }
    await act(async () => resolvePresets([serverPreset]))
    await waitFor(() => expect(result.current.presets).toEqual([serverPreset]))
    unmount()
    client.clear()
  })

  it('[REQ-332/AC-18] refreshed list survives restart while next fetch is held', async () => {
    const idb = new IDBFactory()
    const initial = [{ id: 7, name: 'workflow A' }]
    const updated = [{ id: 7, name: 'workflow B' }]
    localStorage.setItem('prompt-surgeon-settings', '{"theme":"keep"}')
    localStorage.setItem('prompt-surgeon-meta-keep', '{"seed":8}')
    sessionStorage.setItem('studio-draft-10', '{"name":"keep"}')
    const localBefore = values(localStorage)
    const sessionBefore = values(sessionStorage)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let responseIndex = 0
    vi.mocked(workflowsApi.list).mockReset().mockImplementation(async () => (++responseIndex === 1 ? initial : updated) as never)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const query = () => useQuery({ queryKey: ['workflows'], queryFn: () => workflowsApi.list() })
    const first = renderHook(query, { wrapper })
    await waitFor(() => expect(first.result.current.data).toEqual(initial))
    const initialUpdatedAt = first.result.current.dataUpdatedAt
    await new Promise(resolve => setTimeout(resolve, 5))
    await act(async () => { await first.result.current.refetch() })
    expect(workflowsApi.list).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      expect(first.result.current.data).toEqual(updated)
      expect(first.result.current.dataUpdatedAt).toBeGreaterThan(initialUpdatedAt)
    })

    const persister = makePersister(idb, () => now)
    await persister.persistClient(persisted(client, now))
    const flushed = await persister.restoreClient()
    expect(flushed?.clientState.queries.find(item => item.queryKey[0] === 'workflows')?.state.data).toEqual(updated)
    first.unmount()
    now += 9 * 60_000
    const restored = await makePersister(idb, () => now).restoreClient()
    const nextClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    hydrate(nextClient, restored!.clientState)
    let resolveRefresh!: (value: unknown[]) => void
    const held = new Promise<unknown[]>(resolve => { resolveRefresh = resolve })
    vi.mocked(workflowsApi.list).mockReset().mockReturnValue(held as never)
    const nextWrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={nextClient}>{children}</QueryClientProvider>
    const second = renderHook(query, { wrapper: nextWrapper })
    try {
      await waitFor(() => expect(workflowsApi.list).toHaveBeenCalledTimes(1))
      expect(second.result.current.data).toEqual(updated)
      expect(second.result.current.isFetching).toBe(true)
      expect(values(localStorage)).toEqual(localBefore)
      expect(values(sessionStorage)).toEqual(sessionBefore)
    } finally {
      resolveRefresh([{ id: 7, name: 'settled' }])
      second.unmount()
      nextClient.clear()
      client.clear()
    }
  })

  it('[REQ-332/AC-2] updates workflows with an exact 4 MiB UTF-16 byte-equivalent payload', async () => {
    const persister = makePersister(idb, () => now)
    const beforeLocal = values(localStorage)
    const beforeSession = values(sessionStorage)
    const first = new QueryClient()
    first.setQueryData(['workflows'], [{ id: 1, json: 'before' }])
    first.setQueryData(['workflow-presets'], [{ id: 4, name: 'stale preset' }])
    await persister.persistClient(persisted(first, now))
    await persister.restoreClient()

    const updated = new QueryClient()
    const json = 'x'.repeat(2 * 1024 * 1024)
    expect(json.length * 2).toBe(4 * 1024 * 1024)
    updated.setQueryData(['workflows'], [{ id: 1, json }])
    updated.setQueryData(['workflow-presets'], [{ id: 4, name: 'server latest preset' }])
    await persister.persistClient(persisted(updated, now))
    const restored = await persister.restoreClient()
    const localAfter = values(localStorage)

    expect(localAfter).toEqual(beforeLocal)
    expect(values(sessionStorage)).toEqual(beforeSession)
    const otherTab = new QueryClient()
    hydrate(otherTab, restored!.clientState)
    expect(otherTab.getQueryData(['workflows'])).toEqual([{ id: 1, json }])
    expect(otherTab.getQueryData(['workflow-presets'])).toBeUndefined()
  })

  it('AC12: reload restore retains fixed settings, metadata and session selections', async () => {
    const keys = {
      settings: 'prompt-surgeon-settings', input: 'workflow-input-7', batch: 'batch-urls',
      selected: 'selected-url', snapshot: 'snapshot-selection',
    }
    for (const [key, value] of Object.entries({
      [keys.settings]: '{"theme":"dark"}', [keys.input]: '{"text":"keep"}',
      [keys.batch]: '["https://a"]', [keys.selected]: 'https://b',
    })) localStorage.setItem(key, value)
    sessionStorage.setItem(keys.snapshot, '{"params":{"seed":42}}')
    localStorage.setItem('prompt-surgeon-rq-cache', '{"old":true}')
    const expectedLocal = values(localStorage)
    const expectedSession = values(sessionStorage)
    const persister = makePersister(idb, () => now)
    const client = new QueryClient()
    client.setQueryData(['workflows'], [{ id: 7 }])
    await persister.persistClient(persisted(client, now))
    const restarted = makePersister(idb, () => now)
    const saved = await restarted.restoreClient()

    expect(values(localStorage)).toEqual(Object.fromEntries(Object.entries(expectedLocal)
      .filter(([key]) => key !== 'prompt-surgeon-rq-cache')))
    expect(values(sessionStorage)).toEqual(expectedSession)
    expect(saved?.clientState.queries[0].state.data).toEqual([{ id: 7 }])
    expect(JSON.parse(sessionStorage.getItem(keys.snapshot)!).params.seed).toBe(42)
  })

  it('[REQ-332/AC-10] desktop generation stays disabled until workflow 7 is fetched', async () => {
    let resolveWorkflow!: (value: unknown) => void
    const deferred = new Promise<unknown>(resolve => { resolveWorkflow = resolve })
    vi.mocked(workflowsApi.get).mockReturnValue(deferred as never)
    const queued = vi.mocked(comfyApi.queuePrompt).mockResolvedValue({ prompt_id: 'mock-job' } as never)
    const arrays = new Set(['sets', 'openPresetIds', 'workflows', 'mappingMasters', 'loras', 'paramTypeMasters', 'tagSets', 'presets', 'displayImages', 'sortedDisplayImages', 'sortedSnapshots', 'invalidMappings', 'textMappings', 'paramMappings', 'baseModels'])
    const action = () => vi.fn()
    const base: Record<string, unknown> = {
      isConnected: true, selectedWorkflowId: 7, workflows: [{ id: 7, name: 'Mock workflow' }],
      sets: [], openPresetIds: [], paramValues: {}, appliedAssets: {}, selectedIds: new Set(), selectedMasters: {},
      handleGenerateSets: () => comfyApi.queuePrompt({}, {} as never),
      promptTranslation: { isOpen: false, activeRole: null, mode: 'prompt', sourceText: '', translatedText: '', meta: null, isTranslating: false, error: null, openTranslation: action(), closeTranslation: action(), setMode: action(), setSourceText: action(), executeTranslate: action(), applyToPrompt: action() },
      updateWorkflowBaseModelMutation: { mutate: action() }, runAudit: { mutate: action() },
    }
    const state = (workflow: unknown) => new Proxy({ ...base, workflow }, { get: (target, key: string) => {
      if (key in target) return target[key]
      if (arrays.has(key)) return []
      if (key === 'selectedIds') return new Set()
      if (key.endsWith('Mutation') || key === 'runAudit') return { mutate: action() }
      if (/^(is|can)[A-Z]/.test(key)) return false
      if (/^(set|handle|toggle|remove|add|select|clear|exit|undo|redo|get|fetch|save|update)/.test(key)) return action()
      return null
    } }) as never
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const DesktopGuard = () => {
      const { data: workflow } = useQuery({ queryKey: ['workflow', 7], queryFn: () => workflowsApi.get(7) })
      return <DesktopLayout state={state(workflow)} />
    }
    try {
      render(<QueryClientProvider client={client}><DesktopGuard /></QueryClientProvider>)
      const button = document.getElementById('generate-btn')!
      await waitFor(() => expect(workflowsApi.get).toHaveBeenCalledWith(7))
      expect(button).toBeDisabled()
      expect(queued).not.toHaveBeenCalled()
      resolveWorkflow({ id: 7, name: 'Mock workflow', json_body: {}, mappings: [] })
      await waitFor(() => expect(button).toBeEnabled())
      expect(client.getQueryData(['workflow', 7])).toMatchObject({ id: 7 })
      button.click()
      await waitFor(() => expect(queued).toHaveBeenCalledTimes(1))
    } finally {
      resolveWorkflow({ id: 7, name: 'settled', json_body: {}, mappings: [] })
      client.clear()
    }
  })

  it('[REQ-332/AC-13] same-tab restart restores every Studio field independently of API cache migration', async () => {
    const draft = {
      projectId: 10, name: 'Saved name', character_trigger: 'saved_char', outfit_trigger: 'saved_outfit',
      workflow_id: 7, prompt_meta: 'saved meta', prompt_physical: 'saved physical',
      prompt_exclusive_outfit: 'saved outfit tags', prompt_negative: 'saved negative',
      selected_alt_outfits: JSON.stringify([{ id: 99, name: 'Saved alt', prompt_tags: 'saved cape' }]),
      updated_at: '2026-02-01T00:00:00.000Z', base_server_updated_at: '2026-01-01T00:00:00.000Z', is_synced: false,
    }
    saveStudioDraft(draft)
    const sessionBefore = values(sessionStorage)
    localStorage.setItem('prompt-surgeon-rq-cache', '{"old":true}')
    localStorage.setItem('prompt-surgeon-settings', '{"theme":"dark"}')
    localStorage.setItem('prompt-surgeon-meta-keep', '{"seed":9}')
    const localKeep = { settings: localStorage.getItem('prompt-surgeon-settings'), meta: localStorage.getItem('prompt-surgeon-meta-keep') }
    const persister = makePersister(new IDBFactory(), () => now)
    expect(localStorage.getItem('prompt-surgeon-rq-cache')).toBeNull()
    expect([localStorage.getItem('prompt-surgeon-settings'), localStorage.getItem('prompt-surgeon-meta-keep')])
      .toEqual([localKeep.settings, localKeep.meta])
    useStudioStore.getState().resetStudio()
    vi.mocked(datasetApi.getProjects).mockResolvedValue([{ id: 10, name: 'Server name', character_trigger: 'server_char', outfit_trigger: 'server_outfit', workflow_id: 1, prompt_meta: 'server meta', prompt_physical: 'server physical', prompt_exclusive_outfit: 'server dress', prompt_negative: 'server negative', selected_alt_outfits: '[]', created_at: '2026-01-01', updated_at: '2026-01-01' }] as never)
    vi.mocked(workflowsApi.list).mockResolvedValue([{ id: 7, name: 'Workflow 7' }] as never)
    vi.mocked(workflowsApi.get).mockResolvedValue({ id: 7, name: 'Workflow 7', json_body: {}, mappings: [] } as never)
    vi.mocked(mappingMastersApi.list).mockResolvedValue([] as never)
    const project = { id: 10, name: 'Server name', character_trigger: 'server_char', outfit_trigger: 'server_outfit', workflow_id: 1, prompt_meta: 'server meta', prompt_physical: 'server physical', prompt_exclusive_outfit: 'server dress', prompt_negative: 'server negative', selected_alt_outfits: '[]', created_at: '2026-01-01', updated_at: '2026-01-01' }
    useStudioStore.getState().setActiveProject({ ...project, updated_at: '2026-01-01T00:00:00.000Z' } as never)
    const { unmount } = render(<MatrixGenerationStep />)
    await waitFor(() => expect(screen.getByTestId('draft-restored-alert')).toBeInTheDocument())
    expect(screen.getByTestId('project-name-input')).toHaveValue(draft.name)
    expect(screen.getByTestId('character-trigger-input')).toHaveValue(draft.character_trigger)
    expect(screen.getByTestId('outfit-trigger-input')).toHaveValue(draft.outfit_trigger)
    expect(screen.getByTestId('workflow-select')).toHaveValue('7')
    expect(screen.getByTestId('meta-tag-editor')).toHaveTextContent(draft.prompt_meta)
    expect(screen.getByTestId('physical-tag-editor')).toHaveTextContent(draft.prompt_physical)
    expect(screen.getByTestId('exclusive-outfit-editor')).toHaveTextContent(draft.prompt_exclusive_outfit)
    expect(screen.getByTestId('negative-tag-editor')).toHaveTextContent(draft.prompt_negative)
    expect(screen.getByTestId('alt-outfit-badges-container')).toHaveTextContent('Saved alt')
    const sessionAfter = values(sessionStorage)
    expect(Object.keys(sessionAfter)).toEqual(Object.keys(sessionBefore))
    expect(sessionAfter['studio-draft-10']).toBe(sessionBefore['studio-draft-10'])
    const { updated_at: _updatedAt, ...draftFields } = draft
    expect(JSON.parse(sessionAfter['dataset_studio_draft_10']!)).toMatchObject(draftFields)
    unmount()
    await persister.removeClient()
  })
})
