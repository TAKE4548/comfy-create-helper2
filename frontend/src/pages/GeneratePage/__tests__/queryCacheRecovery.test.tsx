import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider, dehydrate, useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { generationApi, GenerationApiError } from '../../../api/domains/generation'
import { API_CACHE_BUSTER, createIndexedDBPersister } from '../../../utils/queryCachePersister'
import { PROMPT_RECORD_KEY } from '../../../utils/generationRecord'
import { buildGenerationRecord } from '../../../utils/generationRecord'
import type { Workflow } from '../../../api/types'
import { useGenerationStore } from '../../../store/useGenerationStore'
import { workflowsApi } from '../../../api/client'
import { readLocalRecordedMetadata } from '../../../utils/promptRecord'
import { cleanupAllTestState } from '../../../test/utils'

const metadata = () => ({
  paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify({ version: 1, prompt: 'submitted', seed: 42, steps: 20 }) },
  appliedAssets: {}, workflowId: 7,
})
const persisted = (client: QueryClient) => ({
  timestamp: 1_800_000_000_000, buster: API_CACHE_BUSTER, clientState: dehydrate(client),
})
const makePersister = (indexedDB: IDBFactory) => createIndexedDBPersister({
  indexedDB, storage: localStorage, now: () => 1_800_000_000_000,
})
const values = (storage: Storage) => Object.fromEntries(
  Array.from({ length: storage.length }, (_, i) => storage.key(i)!).sort().map(key => [key, storage.getItem(key)]),
)
const makeLegacyValue = () => JSON.stringify({ payload: 'x'.repeat(2_097_152 - JSON.stringify({ payload: '' }).length) })
const seedLegacyCache = () => {
  const value = makeLegacyValue()
  expect(value.length).toBe(2_097_152)
  localStorage.setItem('prompt-surgeon-rq-cache', value)
  createIndexedDBPersister({ indexedDB: new IDBFactory(), storage: localStorage, now: () => 1_800_000_000_000 })
}
let queueIndex = 0
const jobIdFor = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const installBatchApi = () => {
  vi.spyOn(generationApi, 'submitBatch').mockImplementation(async () => {
    const index = ++queueIndex
    return { batch_id: jobIdFor(index + 1000), job_ids: [jobIdFor(index)], epoch: 'test-epoch', revision: index }
  })
}
const seedPriorRecords = (base: number) => Array.from({ length: 30 }, (_, i) => {
  const id = `prior-${i + 1}`
  localStorage.setItem(`prompt-surgeon-meta-${id}`, JSON.stringify({
    timestamp: base + i, workflowId: 7, appliedAssets: {},
    paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify({ ...makeRecord(id, i, 20), prompt_id: id }) },
  }))
  return id
})
const makeRecord = (prompt: string, seed: number, steps: number) => {
  const workflow: Workflow = { id: 7, name: 'Recorded', created_at: '', json_body: {}, mappings: [
    { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
    { id: 2, master_id: 2, node_id: '2', role: 'Sampler_Seed', param_name: 'seed', input_type: 'number', display_name: 'Seed' },
    { id: 3, master_id: 3, node_id: '3', role: 'Sampler_Steps', param_name: 'steps', input_type: 'number', display_name: 'Steps' },
  ] }
  const graph = { '1': { inputs: { text: prompt } }, '2': { inputs: { seed } }, '3': { inputs: { steps } } }
  return buildGenerationRecord(workflow, graph, graph, {})
}
const submit31 = async (base: number) => {
  vi.useFakeTimers()
  const ids: string[] = []
  for (let i = 1; i <= 31; i++) {
    vi.setSystemTime(base + i * 1000)
    ids.push(await useGenerationStore.getState().queuePrompt({}, {
      workflowId: 7, appliedAssets: {},
      paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify(makeRecord(`prompt-${i}`, 1000 + i, 19 + i)) },
    }, { skipQueueFetch: true }) as string)
  }
  return ids
}

describe('REQ-332 cache recovery integration', () => {
  let originalErrorSetter: ReturnType<typeof useGenerationStore.getState>['setErrorToast']
  const errorToast = vi.fn()

  beforeEach(() => {
    cleanupAllTestState()
    queueIndex = 0
    originalErrorSetter = useGenerationStore.getState().setErrorToast
    useGenerationStore.setState({ setErrorToast: errorToast } as never)
    errorToast.mockClear()
    installBatchApi()
    useGenerationStore.setState({ errorToast: null } as never)
  })

  afterEach(() => {
    cleanupAllTestState()
    useGenerationStore.setState({ setErrorToast: originalErrorSetter } as never)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('AC3/4: accepts 31 unique prompts and keeps only the newest 30 metadata records', async () => {
    for (let i = 1; i <= 30; i++) {
      localStorage.setItem(`prompt-surgeon-meta-existing-${i}`, JSON.stringify({ timestamp: i }))
    }
    vi.useFakeTimers()
    const base = new Date('2026-10-08T00:00:00.000Z').getTime()
    for (let i = 1; i <= 31; i++) {
      vi.setSystemTime(base + i * 1000)
      const queued = await useGenerationStore.getState().queuePrompt({}, {
        workflowId: 7, appliedAssets: {},
        paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify({ version: 1, prompt: `prompt-${i}`, seed: i, steps: 20 }) },
      }, { skipQueueFetch: true })
      expect(queued).toBe(jobIdFor(i))
    }
    const keys = Object.keys(localStorage).filter(key => key.startsWith('prompt-surgeon-meta-')).sort()
    expect(keys).toHaveLength(30)
    expect(keys).not.toContain(`prompt-surgeon-meta-${jobIdFor(1)}`)
    for (let i = 2; i <= 31; i++) {
      const value = JSON.parse(localStorage.getItem(`prompt-surgeon-meta-${jobIdFor(i)}`)!)
      const record = JSON.parse(value.paramValues[PROMPT_RECORD_KEY])
      expect(record).toMatchObject({ prompt: `prompt-${i}`, seed: i, steps: 20 })
      expect(value.timestamp).toBe(base + i * 1000)
    }
    expect(new Set(keys).size).toBe(30)
    expect(errorToast).not.toHaveBeenCalled()
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(31)
  })

  it('[REQ-332/AC-3] 31 submissions succeed without a metadata-prune notification', async () => {
    const warning = vi.spyOn(console, 'warn')
    seedLegacyCache()
    seedPriorRecords(Date.parse('2026-10-08T00:00:00Z'))
    const ids = await submit31(Date.parse('2026-10-08T00:00:00Z'))
    expect(new Set(ids).size).toBe(31)
    expect(errorToast).not.toHaveBeenCalled()
    expect(warning).not.toHaveBeenCalled()
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(31)
  })

  it('[REQ-332/AC-4] every one of the newest 30 IDs retains its distinct record fields', async () => {
    seedLegacyCache()
    seedPriorRecords(Date.parse('2026-10-08T00:00:00Z'))
    const ids = await submit31(Date.parse('2026-10-08T00:00:00Z'))
    const saved = ids.filter(id => localStorage.getItem(`prompt-surgeon-meta-${id}`) !== null)
    expect(ids).toEqual(Array.from({ length: 31 }, (_, i) => jobIdFor(i + 1)))
    expect(saved).toHaveLength(30)
    expect(saved).not.toContain(jobIdFor(1))
    for (let i = 2; i <= 31; i++) {
      const record = readLocalRecordedMetadata(jobIdFor(i))
      expect(record).not.toBeNull()
      const generation = JSON.parse(record!.paramValues[PROMPT_RECORD_KEY])
      expect(generation.fields.find((field: { role: string }) => field.role === 'positive').value).toBe(`prompt-${i}`)
      expect(generation.parameters.find((field: { role: string }) => field.role === 'Sampler_Seed').value).toBe(1000 + i)
      expect(generation.parameters.find((field: { role: string }) => field.role === 'Sampler_Steps').value).toBe(19 + i)
      expect(record!.queuedAt).toBe(new Date(Date.parse('2026-10-08T00:00:00Z') + i * 1000).toISOString())
    }
  })

  it('AC11: queues once when IDB read rejects after the server query succeeds', async () => {
    const idb = new IDBFactory()
    const persister = createIndexedDBPersister({
      indexedDB: idb, storage: localStorage, now: () => 1_800_000_000_000,
    })
    const client = new QueryClient()
    client.setQueryData(['workflows'], [{ id: 7 }])
    await persister.persistClient(persisted(client))
    await persister.restoreClient()
    const query = new QueryClient()
    query.setQueryData(['workflows'], [{ id: 7 }])
    expect(query.getQueryData(['workflows'])).toEqual([{ id: 7 }])

    const readFailure = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('IDB read rejected', 'UnknownError')
    })
    const unavailable = createIndexedDBPersister({ indexedDB: idb, storage: localStorage })
    const restored = await unavailable.restoreClient()
    expect(restored).toBeUndefined()
    readFailure.mockRestore()
    const queued = await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })

    expect(queued).toBe(jobIdFor(1))
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
  })

  it('[REQ-332/AC-11] read rejection server fallback', async () => {
    const idb = new IDBFactory()
    localStorage.setItem('prompt-surgeon-settings', '{"keep":true}')
    sessionStorage.setItem('studio-draft-10', '{"keep":true}')
    const settingsBefore = localStorage.getItem('prompt-surgeon-settings')
    const sessionBefore = values(sessionStorage)
    const cache = makePersister(idb)
    const seeded = new QueryClient()
    seeded.setQueryData(['workflows'], [{ id: 7, name: 'cached' }])
    await cache.persistClient(persisted(seeded))
    await cache.restoreClient()
    const readFailure = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('IDB read rejected', 'UnknownError')
    })
    expect(await makePersister(idb).restoreClient()).toBeUndefined()
    readFailure.mockRestore()

    let resolveServer!: (value: unknown[]) => void
    const deferred = new Promise<unknown[]>(resolve => { resolveServer = resolve })
    vi.spyOn(workflowsApi, 'list').mockReturnValue(deferred as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => useQuery({ queryKey: ['workflows'], queryFn: () => workflowsApi.list() }), { wrapper })
    try {
      await waitFor(() => expect(workflowsApi.list).toHaveBeenCalledTimes(1))
      expect(result.current.data).toBeUndefined()
      expect(generationApi.submitBatch).not.toHaveBeenCalled()
      resolveServer([{ id: 7, name: 'server workflow' }])
      await waitFor(() => expect(result.current.data).toEqual([{ id: 7, name: 'server workflow' }]))
      expect(workflowsApi.list.mock.calls[0]).toEqual([])
      expect(result.current.data?.[0].id).toBe(7)
      expect(await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })).toBe(jobIdFor(1))
      expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('prompt-surgeon-settings')).toBe(settingsBefore)
      expect(values(sessionStorage)).toEqual(sessionBefore)
    } finally {
      resolveServer([{ id: 7, name: 'settled' }])
      unmount()
      client.clear()
    }
  })

  it('AC11: accepts one job when the API cache write hits quota', async () => {
    const idb = new IDBFactory()
    const cache = makePersister(idb)
    const client = new QueryClient()
    client.setQueryData(['workflows'], [{ id: 7 }])
    const failedWrite = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await cache.persistClient(persisted(client))
    const queued = await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })
    failedWrite.mockRestore()

    expect(queued).toBe(jobIdFor(1))
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
  })

  it('AC14: local metadata-cache quota failure does not affect BE acceptance or frozen request metadata', async () => {
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === `prompt-surgeon-meta-${jobIdFor(1)}`) throw new DOMException('quota', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    const submitted = metadata()
    const queued = await useGenerationStore.getState().queuePrompt({}, submitted, { skipQueueFetch: true })

    expect(queued).toBe(jobIdFor(1))
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
    const request = vi.mocked(generationApi.submitBatch).mock.calls[0][0]
    expect(request.items[0]).toMatchObject({ workflow_id: 7, param_values: submitted.paramValues, applied_assets: {} })
    const record = JSON.parse(request.items[0].param_values[PROMPT_RECORD_KEY] as string)
    expect(record).toMatchObject({ version: 1, prompt: 'submitted', seed: 42, steps: 20 })
    expect(localStorage.getItem(`prompt-surgeon-meta-${jobIdFor(1)}`)).toBeNull()
  })

  it('uses one request lookup after an ambiguous 202 response without resubmitting the batch', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new GenerationApiError(503, {
      code: 'generation_submit_unconfirmed', message: 'acceptance unknown', outcome: 'unconfirmed',
      request_id: null, job_id: null,
    }))
    vi.spyOn(generationApi, 'getRequest').mockResolvedValue({
      batch_id: jobIdFor(1001), job_ids: [jobIdFor(1)],
    })

    const queued = await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })
    const submittedRequest = vi.mocked(generationApi.submitBatch).mock.calls[0][0]

    expect(queued).toBe(jobIdFor(1))
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
    expect(generationApi.getRequest).toHaveBeenCalledTimes(1)
    expect(generationApi.getRequest).toHaveBeenCalledWith(submittedRequest.request_id)
    expect(submittedRequest.items[0].param_values).toEqual(metadata().paramValues)
  })

  it('AC16/17: clears only the IDB cache and fetches the current workflow after restart', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const idb = new IDBFactory()
    const old = makePersister(idb)
    const client = new QueryClient()
    client.setQueryData(['workflows'], [{ id: 7, name: 'old' }])
    const write1 = old.persistClient(persisted(client))
    await vi.advanceTimersByTimeAsync(1000)
    await write1
    await old.restoreClient()
    const localBefore = localStorage.getItem('prompt-surgeon-settings')
    localStorage.setItem('prompt-surgeon-settings', '{"keep":true}')
    sessionStorage.setItem('studio-draft', '{"keep":true}')
    await old.removeClient()

    const restartedIdb = new IDBFactory()
    const restarted = makePersister(restartedIdb)
    expect(await restarted.restoreClient()).toBeUndefined()
    const server = new QueryClient()
    server.setQueryData(['workflows'], [{ id: 7, name: 'latest' }])
    const write2 = restarted.persistClient(persisted(server))
    await vi.advanceTimersByTimeAsync(1000)
    await write2
    const saved = await makePersister(restartedIdb).restoreClient()
    const queued = await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })

    expect(saved?.clientState.queries[0].state.data).toEqual([{ id: 7, name: 'latest' }])
    expect(queued).toBe(jobIdFor(1))
    expect(localStorage.getItem('prompt-surgeon-settings')).toBe('{"keep":true}')
    expect(sessionStorage.getItem('studio-draft')).toBe('{"keep":true}')
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
  })

  it('[REQ-332/AC-16] interrupted first migration leaves no snapshot and retry queues once', async () => {
    const idb = new IDBFactory()
    const settings = '{"theme":"keep"}'
    const metadataValue = JSON.stringify({ paramValues: {}, appliedAssets: {}, timestamp: Date.now() })
    const sessionValue = '{"draft":"keep"}'
    localStorage.setItem('prompt-surgeon-settings', settings)
    localStorage.setItem('prompt-surgeon-meta-keep', metadataValue)
    sessionStorage.setItem('studio-draft-10', sessionValue)
    localStorage.setItem('prompt-surgeon-rq-cache', '{"legacy":true}')
    const expectedLocal = { settings, metadataValue }
    const expectedSession = sessionStorage.getItem('studio-draft-10')
    const first = createIndexedDBPersister({ indexedDB: idb, storage: localStorage, timeoutMs: 60_000 })
    expect(localStorage.getItem('prompt-surgeon-rq-cache')).toBeNull()

    const realTransaction = IDBDatabase.prototype.transaction
    let releaseCompletion: (() => void) | undefined
    let holdGet = true
    let markTransactionStarted!: () => void
    const transactionStarted = new Promise<void>(resolve => { markTransactionStarted = resolve })
    let markCompletionHook!: () => void
    const completionHookSet = new Promise<void>(resolve => { markCompletionHook = resolve })
    const transactionSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args: never[]) {
      const tx = realTransaction.apply(this, args as never)
      markTransactionStarted()
      let complete: IDBTransaction['oncomplete'] = null
      Object.defineProperty(tx, 'oncomplete', {
        configurable: true,
        get: () => complete,
        set: (handler: IDBTransaction['oncomplete']) => { complete = handler; releaseCompletion = () => complete?.call(tx, new Event('complete') as IDBTransactionEvent); markCompletionHook() },
      })
      return tx
    } as never)
    const realGet = IDBObjectStore.prototype.get
    const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (...args: never[]) {
      const request = realGet.apply(this, args as never)
      if (holdGet) {
        holdGet = false
        Object.defineProperty(request, 'onsuccess', { configurable: true, get: () => null, set: () => undefined })
      }
      return request
    } as never)
    let write: Promise<void> | undefined
    try {
      const client = new QueryClient()
      client.setQueryData(['workflow', 7], { id: 7, name: 'partial must not restore' })
      write = first.persistClient(persisted(client))
      await transactionStarted
      await completionHookSet
      expect(releaseCompletion).toBeTypeOf('function')
      expect(localStorage.getItem('prompt-surgeon-settings')).toBe(expectedLocal.settings)
      expect(localStorage.getItem('prompt-surgeon-meta-keep')).toBe(expectedLocal.metadataValue)
      expect(sessionStorage.getItem('studio-draft-10')).toBe(expectedSession)

      transactionSpy.mockRestore()
      getSpy.mockRestore()
      const restartedClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const restarted = makePersister(idb)
      expect(await restarted.restoreClient()).toBeUndefined()
      vi.spyOn(workflowsApi, 'get').mockResolvedValue({ id: 7, name: 'server workflow' } as never)
      await restartedClient.fetchQuery({ queryKey: ['workflow', 7], queryFn: () => workflowsApi.get(7) })
      expect(restartedClient.getQueryData(['workflow', 7])).toMatchObject({ name: 'server workflow' })
      const queued = await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })
      expect(queued).toBe(jobIdFor(1))
      expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('prompt-surgeon-settings')).toBe(expectedLocal.settings)
      expect(localStorage.getItem('prompt-surgeon-meta-keep')).toBe(expectedLocal.metadataValue)
      expect(sessionStorage.getItem('studio-draft-10')).toBe(expectedSession)
    } finally {
      transactionSpy.mockRestore()
      getSpy.mockRestore()
      releaseCompletion?.()
      await write
    }
  })

  it('[REQ-332/AC-17] deleting only the IDB database preserves browser storage and allows a server retry', async () => {
    const idb = new IDBFactory()
    localStorage.setItem('prompt-surgeon-settings', '{"keep":true}')
    const retainedMetadata = JSON.stringify({ timestamp: Date.now(), workflowId: 7, appliedAssets: {}, paramValues: {} })
    localStorage.setItem('prompt-surgeon-meta-keep', retainedMetadata)
    sessionStorage.setItem('studio-draft-10', '{"name":"keep"}')
    const localBefore = values(localStorage)
    const sessionBefore = values(sessionStorage)
    const client = new QueryClient()
    client.setQueryData(['workflows'], [{ id: 7, name: 'cached' }])
    let database!: IDBDatabase
    const transaction = IDBDatabase.prototype.transaction
    const transactionSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args: never[]) {
      const tx = transaction.apply(this, args as never)
      database = tx.db
      return tx
    } as never)
    await makePersister(idb).persistClient(persisted(client))
    transactionSpy.mockRestore()
    database.close()
    const request = idb.deleteDatabase('prompt-surgeon-api-cache-v1')
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
    expect(await makePersister(idb).restoreClient()).toBeUndefined()
    const next = new QueryClient()
    const serverFetch = vi.fn().mockResolvedValue([{ id: 7, name: 'latest' }])
    expect(await next.fetchQuery({ queryKey: ['workflows'], queryFn: serverFetch })).toEqual([{ id: 7, name: 'latest' }])
    expect(await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })).toBe(jobIdFor(1))
    expect(localStorage.getItem('prompt-surgeon-settings')).toBe(localBefore['prompt-surgeon-settings'])
    expect(localStorage.getItem('prompt-surgeon-meta-keep')).toBe(localBefore['prompt-surgeon-meta-keep'])
    expect(values(sessionStorage)).toEqual(sessionBefore)
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
  })
})
