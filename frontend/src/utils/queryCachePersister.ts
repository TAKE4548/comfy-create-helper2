import { hashKey } from '@tanstack/query-core'
import type { PersistedClient } from '@tanstack/react-query-persist-client'
import type { Persister } from '@tanstack/react-query-persist-client'

export const API_CACHE_BUSTER = 'prompt-surgeon-api-cache-v1'
export const API_CACHE_MAX_AGE = 600_000
const DB_NAME = 'prompt-surgeon-api-cache-v1'
const STORE = 'client'
const KEY = 'prompt-surgeon-rq-cache'
const LEGACY_KEY = 'prompt-surgeon-rq-cache'
const SCHEMA = 1

export interface QueryCachePersisterOptions {
  indexedDB?: IDBFactory
  storage?: Pick<Storage, 'removeItem'>
  now?: () => number
  timeoutMs?: number
}
interface QueryCacheStore {
  read(): Promise<PersistedClient | undefined>
  write(client: PersistedClient): Promise<void>
  remove(): Promise<void>
}
type Envelope = { schemaVersion: number; client: PersistedClient }

export function cloneClient(client: PersistedClient): PersistedClient | undefined {
  try { return globalThis.structuredClone(client) } catch { return undefined }
}

function valid(client: unknown, now: number): client is PersistedClient {
  if (!client || typeof client !== 'object') return false
  const c = client as PersistedClient
  if (c.buster !== API_CACHE_BUSTER || !Number.isFinite(c.timestamp) || c.timestamp < 0 || c.timestamp > now || now - c.timestamp > API_CACHE_MAX_AGE) return false
  if (!c.clientState || !Array.isArray(c.clientState.queries) || !Array.isArray(c.clientState.mutations)) return false
  return c.clientState.queries.every(q => {
    if (!q || !Array.isArray(q.queryKey) || typeof q.queryHash !== 'string' || q.queryHash !== hashKey(q.queryKey)) return false
    const s = q.state
    return typeof s?.status === 'string' && Number.isFinite(s.dataUpdatedAt) && s.dataUpdatedAt >= 0 && s.dataUpdatedAt <= now
  })
}

function eligible(client: PersistedClient): PersistedClient {
  const excluded = new Set(['comfy-object-info', 'snapshots', 'workflow-presets', 'prompt-metadata'])
  return { ...client, clientState: { ...client.clientState, mutations: [], queries: client.clientState.queries.filter(q => q.state.status === 'success' && !excluded.has(String(q.queryKey[0]))) } }
}

export function mergeClients(stored: PersistedClient | undefined, incoming: PersistedClient, now: number): PersistedClient | undefined {
  if (!valid(incoming, now)) return undefined
  const old = stored && valid(stored, now) ? eligible(stored) : undefined
  const next = eligible(incoming)
  const map = new Map((old?.clientState.queries ?? []).map(q => [q.queryHash, q]))
  for (const q of next.clientState.queries) {
    const prior = map.get(q.queryHash)
    if (!prior || q.state.dataUpdatedAt >= prior.state.dataUpdatedAt) map.set(q.queryHash, q)
  }
  return { ...next, timestamp: Math.max(next.timestamp, old?.timestamp ?? 0), clientState: { ...next.clientState, queries: [...map.values()], mutations: [] } }
}

export function pruneLegacyCache(storage?: Pick<Storage, 'removeItem'>): void {
  try { (storage ?? globalThis.window?.localStorage)?.removeItem(LEGACY_KEY) } catch { /* storage may be unavailable */ }
}

function createQueryCacheStore(options: QueryCachePersisterOptions): QueryCacheStore {
  let timeoutMs = 1500
  try { timeoutMs = options.timeoutMs ?? 1500 } catch { /* keep default */ }
  const currentTime = () => { try { return (options.now ?? Date.now)() } catch { return Number.NaN } }
  let db: IDBDatabase | undefined
  let opening: Promise<IDBDatabase> | undefined
  const open = (): Promise<IDBDatabase> => {
    if (db) return Promise.resolve(db)
    if (opening) return opening
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const factory = options.indexedDB ?? globalThis.indexedDB
        const req = factory.open(DB_NAME, 1)
        req.onupgradeneeded = () => { try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) } catch { /* abort handled by error */ } }
        req.onsuccess = () => {
          const value = req.result
          value.onversionchange = () => { value.close(); if (db === value) db = undefined }
          if (!db) db = value
          else value.close()
          resolve(db ?? value)
        }
        req.onerror = () => reject(req.error)
        req.onblocked = () => reject(new Error('IndexedDB blocked'))
      } catch (e) { reject(e) }
    }).finally(() => { opening = undefined })
    return opening!
  }
  const run = async <T>(kind: 'read' | 'write' | 'remove', client?: PersistedClient): Promise<T | undefined> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let active: IDBTransaction | undefined
    let settled = false
    return new Promise(resolve => {
      const finish = (value?: T) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve(value) }
      timer = setTimeout(() => { try { active?.abort() } catch { /* settled */ } finish() }, timeoutMs)
      void open().then(database => {
        if (settled) { database.close(); return }
        try {
          active = database.transaction(STORE, 'readwrite')
          const store = active.objectStore(STORE)
          let result: T | undefined
          if (kind === 'read') {
            const req = store.get(KEY)
            req.onsuccess = () => {
              const envelope = req.result as Envelope | undefined
              const c = envelope?.schemaVersion === SCHEMA && valid(envelope.client, currentTime()) ? envelope.client : undefined
              result = c ? eligible(c) as T : undefined
              if (!c && envelope !== undefined) store.delete(KEY)
            }
          } else if (kind === 'write') {
            const req = store.get(KEY)
            req.onsuccess = () => {
              const envelope = req.result as Envelope | undefined
              const now = currentTime()
              const old = envelope?.schemaVersion === SCHEMA && valid(envelope.client, now) ? envelope.client : undefined
              const merged = mergeClients(old, client!, now)
              if (merged) store.put({ schemaVersion: SCHEMA, client: merged } satisfies Envelope, KEY)
            }
          } else store.delete(KEY)
          active.oncomplete = () => finish(result)
          active.onerror = () => finish()
          active.onabort = () => finish()
        } catch { finish() }
      }).catch(() => finish())
    })
  }
  return {
    read: async () => await run<PersistedClient>('read'),
    write: async client => { await run<void>('write', client) },
    remove: async () => { await run<void>('remove') },
  }
}

export function createIndexedDBPersister(options: QueryCachePersisterOptions = {}): Persister {
  try { pruneLegacyCache(options.storage) } catch { /* injected storage option may reject access */ }
  const store = createQueryCacheStore(options)
  const now = () => { try { return (options.now ?? Date.now)() } catch { return Number.NaN } }
  let queue: Promise<void> = Promise.resolve()
  let pending: { client: PersistedClient; waiters: Array<() => void>; timer: ReturnType<typeof setTimeout> } | undefined
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
  const flush = (): Promise<void> => {
    if (!pending) return queue
    const batch = pending
    pending = undefined
    clearTimeout(batch.timer)
    return enqueue(async () => {
      try { await store.write(batch.client) } finally { batch.waiters.forEach(resolve => resolve()) }
    })
  }
  const persist = (client: PersistedClient): Promise<void> => {
    const copy = cloneClient(client)
    if (!copy) return Promise.resolve()
    if (!pending) {
      let resolve!: () => void
      const waiter = new Promise<void>(r => { resolve = r })
      const batch = { client: copy, waiters: [resolve], timer: undefined as unknown as ReturnType<typeof setTimeout> }
      batch.timer = setTimeout(() => { void flush() }, 1000)
      pending = batch
      return waiter
    }
    const merged = mergeClients(pending.client, copy, now())
    if (merged) pending.client = merged
    return new Promise<void>(resolve => pending!.waiters.push(resolve))
  }
  return {
    persistClient: persist,
    restoreClient: () => { void flush(); return enqueue(() => store.read()) },
    removeClient: () => { void flush(); return enqueue(() => store.remove()) },
  }
}
