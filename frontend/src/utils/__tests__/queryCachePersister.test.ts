// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashKey } from '@tanstack/query-core'
import 'fake-indexeddb/auto'
import { createIndexedDBPersister, API_CACHE_BUSTER } from '../queryCachePersister'

describe('REQ-332-T2 storage transactions', () => {
  const client = (timestamp = Date.now()) => ({
    timestamp,
    buster: API_CACHE_BUSTER,
    clientState: {
      queries: [{ queryHash: hashKey(['q']), queryKey: ['q'], state: { status: 'success', dataUpdatedAt: timestamp, data: 1 } }],
      mutations: [],
    },
  })
  afterEach(() => vi.useRealTimers())

  it('round trips only after transaction completion and merges by newest query', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const factory = new IDBFactory()
    const time = Date.now()
    const persister = createIndexedDBPersister({ indexedDB: factory, now: () => time + 2 })
    const first = client(time)
    const w1 = persister.persistClient(first as never)
    await vi.advanceTimersByTimeAsync(1000)
    await w1
    expect(await persister.restoreClient()).toEqual(first)
    const newer = { ...client(time), clientState: { ...first.clientState, queries: [{ ...first.clientState.queries[0], state: { ...first.clientState.queries[0].state, dataUpdatedAt: time + 1, data: 2 } }] } }
    const w2 = persister.persistClient(newer as never)
    await vi.advanceTimersByTimeAsync(1000)
    await w2
    expect((await persister.restoreClient())?.clientState.queries[0].state.data).toBe(2)
    await persister.removeClient()
    expect(await persister.restoreClient()).toBeUndefined()
  })

  it('rejects expired clients and invalid busters, hashes, and future query clocks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const now = Date.now()
    const badHash = { ...client(now), clientState: { ...client(now).clientState, queries: [{ ...client(now).clientState.queries[0], queryHash: 'wrong' }] } }
    const futureQuery = { ...client(now), clientState: { ...client(now).clientState, queries: [{ ...client(now).clientState.queries[0], state: { ...client(now).clientState.queries[0].state, dataUpdatedAt: now + 10 } }] } }
    const cases = [client(now - 600_001), { ...client(now), buster: 'old' }, badHash, futureQuery]
    for (const [i, value] of cases.entries()) {
      const p = createIndexedDBPersister({ indexedDB: new IDBFactory(), now: () => now })
      const write = p.persistClient(value as never)
      await vi.advanceTimersByTimeAsync(1000)
      await write
      expect(await p.restoreClient(), `invalid case ${i}`).toBeUndefined()
    }
  })

  it('serializes writes across two connections and filters API-only keys', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const factory = new IDBFactory()
    const time = Date.now()
    const a = createIndexedDBPersister({ indexedDB: factory, now: () => time + 5 })
    const b = createIndexedDBPersister({ indexedDB: factory, now: () => time + 5 })
    const c = client(time)
    const filtered = { ...c, clientState: { queries: [...c.clientState.queries, {
      queryHash: hashKey(['snapshots']), queryKey: ['snapshots'], state: { status: 'success', dataUpdatedAt: time, data: 'private' },
    }, { queryHash: hashKey(['pending']), queryKey: ['pending'], state: { status: 'pending', dataUpdatedAt: 0 } }], mutations: [{ state: {} }] } }
    const writes = Promise.all([a.persistClient(c as never), b.persistClient(filtered as never)])
    await vi.advanceTimersByTimeAsync(1000)
    await writes
    const restored = await a.restoreClient()
    expect(restored?.clientState.queries.map(q => q.queryHash)).toContain(hashKey(['q']))
    expect(restored?.clientState.queries.map(q => q.queryHash)).not.toContain(hashKey(['snapshots']))
    expect(restored?.clientState.mutations).toEqual([])
  })

  it('skips data that structuredClone cannot copy', async () => {
    const p = createIndexedDBPersister({ indexedDB: new IDBFactory() })
    const uncloneable = { ...client(), clientState: { queries: [], mutations: [], callback: () => undefined } }
    await p.persistClient(uncloneable as never)
    expect(await p.restoreClient()).toBeUndefined()
  })

  it('synchronously prunes only the API cache key at construction', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const values = new Map([['prompt-surgeon-rq-cache', 'legacy'], ['metadata', 'keep'], ['session', 'keep'], ['unrelated', 'keep']])
    const removed: string[] = []
    const p = createIndexedDBPersister({ indexedDB: new IDBFactory(), storage: { removeItem: k => { removed.push(k); values.delete(k) } } })
    expect(removed).toEqual(['prompt-surgeon-rq-cache'])
    expect([...values]).toEqual([['metadata', 'keep'], ['session', 'keep'], ['unrelated', 'keep']])
    const write = p.persistClient(client() as never)
    await vi.advanceTimersByTimeAsync(1000)
    await write
    expect(removed).toEqual(['prompt-surgeon-rq-cache'])
    expect([...values]).toEqual([['metadata', 'keep'], ['session', 'keep'], ['unrelated', 'keep']])
  })

  it('catches a rejected injected storage getter during construction', () => {
    const options = { indexedDB: new IDBFactory(), get storage(): never { throw new Error('storage unavailable') } }
    expect(() => createIndexedDBPersister(options)).not.toThrow()
  })
})

describe('REQ-332-T8 persister control', () => {
  const time = Date.now()
  const item = (key: string, data: number) => ({
    timestamp: time,
    buster: API_CACHE_BUSTER,
    clientState: { queries: [{ queryHash: hashKey([key]), queryKey: [key], state: { status: 'success', dataUpdatedAt: time, data } }], mutations: [] },
  })
  afterEach(() => vi.useRealTimers())

  it('prunes the exact legacy API key before returning the persister', () => {
    const keys = ['prompt-surgeon-rq-cache', 'metadata', 'session', 'unrelated']
    const removed: string[] = []
    createIndexedDBPersister({ indexedDB: new IDBFactory(), storage: { removeItem: key => removed.push(key) } })
    expect(removed).toEqual(['prompt-surgeon-rq-cache'])
    expect(keys.filter(key => !removed.includes(key))).toEqual(['metadata', 'session', 'unrelated'])
  })

  it('coalesces at the first 1000ms boundary, merges queries, and owns call-time snapshots', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = createIndexedDBPersister({ indexedDB: new IDBFactory(), now: () => time + 10 })
    const first = item('first', 1)
    const a = p.persistClient(first as never)
    first.clientState.queries[0].state.data = 99
    await vi.advanceTimersByTimeAsync(999)
    const b = p.persistClient(item('second', 2) as never)
    let settled = false
    void Promise.all([a, b]).then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()
    await Promise.all([a, b])
    expect(settled).toBe(true)
    const restored = await p.restoreClient()
    expect(restored?.clientState.queries.map(q => q.queryKey[0])).toEqual(['first', 'second'])
    expect(restored?.clientState.queries[0].state.data).toBe(1)
  })

  it('orders persist, remove, and later persist without stale timer resurrection', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = createIndexedDBPersister({ indexedDB: new IDBFactory(), now: () => time + 10 })
    const before = p.persistClient(item('before', 1) as never)
    const removed = p.removeClient()
    const after = p.persistClient(item('after', 2) as never)
    await vi.advanceTimersByTimeAsync(1000)
    vi.useRealTimers()
    await Promise.all([before, removed, after])
    expect((await p.restoreClient())?.clientState.queries.map(q => q.queryKey[0])).toEqual(['after'])
  })

  it('queues restore behind pending writes and settles all waiters when storage fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const p = createIndexedDBPersister({ indexedDB: { open: () => { throw new Error('unavailable') } } as never })
    const a = p.persistClient(item('one', 1) as never)
    const b = p.persistClient(item('two', 2) as never)
    let restored = false
    const read = p.restoreClient().then(value => { restored = true; return value })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(Promise.all([a, b, read])).resolves.toEqual([undefined, undefined, undefined])
    expect(restored).toBe(true)
  })
})
