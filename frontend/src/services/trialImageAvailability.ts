import type { ImageAvailability, ImageIdentity } from '../api/domains/generation'

export type TrialAvailability = 'checking' | 'present' | 'missing' | 'unknown'

export interface TrialIdentity {
  key: string
  request: ImageIdentity
}

export interface TrialAvailabilityController {
  getIdentity(url: string): TrialIdentity | null
  getStatus(url: string): TrialAvailability | undefined
  observe(url: string, owner: object): void
  retainOwnerImages(owner: object, urls: readonly string[]): void
  releaseOwner(owner: object): void
  adopt(url: string, availability: ImageAvailability['availability']): void
  check(url: string, options?: { retry?: boolean }): Promise<TrialAvailability>
  refreshVisible(): void
  subscribe(listener: (url: string, status: TrialAvailability) => void): () => void
  dispose(): void
}

type Entry = {
  identity: TrialIdentity
  status?: TrialAvailability
  adopted?: 'present' | 'missing'
  owners: Set<object>
  urls: Set<string>
  pending?: Promise<TrialAvailability>
  resolvePending?: (status: TrialAvailability) => void
}

const MAX_ACTIVE = 2

export function createTrialAvailabilityController(
  probe: (identity: ImageIdentity) => Promise<ImageAvailability>,
): TrialAvailabilityController {
  const entries = new Map<string, Entry>()
  const ownerEntries = new Map<object, Set<string>>()
  const listeners = new Set<(url: string, status: TrialAvailability) => void>()
  const queue: Entry[] = []
  let active = 0
  let disposed = false

  const getIdentity = (url: string): TrialIdentity | null => {
    try {
      const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
      const parsed = new URL(url, origin)
      if (parsed.origin !== origin || !['/view', '/api/comfy/view'].includes(parsed.pathname)) return null
      const filename = parsed.searchParams.get('filename')
      if (!filename?.trim()) return null
      const request = {
        filename,
        subfolder: parsed.searchParams.get('subfolder') || '',
        type: parsed.searchParams.get('type') || 'output',
      }
      return { key: JSON.stringify([request.filename, request.subfolder, request.type]), request }
    } catch {
      return null
    }
  }

  const notify = (entry: Entry, status: TrialAvailability) => {
    for (const url of entry.urls) {
      for (const listener of listeners) listener(url, status)
    }
  }

  const getEntry = (identity: TrialIdentity): Entry => {
    let entry = entries.get(identity.key)
    if (!entry) {
      entry = { identity, owners: new Set(), urls: new Set() }
      entries.set(identity.key, entry)
    }
    return entry
  }

  const settle = (entry: Entry, result: TrialAvailability) => {
    if (disposed) result = 'unknown'
    if (entry.adopted === 'missing') result = 'missing'
    entry.status = result === 'checking' ? 'unknown' : result
    entry.resolvePending?.(entry.status)
    entry.resolvePending = undefined
    entry.pending = undefined
    notify(entry, entry.status)
  }

  const pump = () => {
    while (!disposed && active < MAX_ACTIVE && queue.length) {
      const entry = queue.shift()!
      if (!entry.pending) continue
      active++
      void (async () => {
        let result: TrialAvailability = 'unknown'
        try {
          const response = await probe(entry.identity.request)
          if (response && (response.availability === 'present' || response.availability === 'missing' || response.availability === 'unknown')) {
            result = response.availability
          }
        } catch {
          result = 'unknown'
        }
        active--
        settle(entry, result)
        pump()
      })()
    }
  }

  const check = (url: string, options?: { retry?: boolean }): Promise<TrialAvailability> => {
    const identity = getIdentity(url)
    if (!identity) return Promise.resolve('unknown')
    const entry = getEntry(identity)
    entry.urls.add(url)
    if (disposed) return Promise.resolve('unknown')
    if (entry.pending) return entry.pending
    if (entry.adopted === 'missing' || entry.status === 'missing' || (entry.status === 'present' && !options?.retry)) return Promise.resolve(entry.status ?? 'missing')
    if (entry.status === 'unknown' && !options?.retry) return Promise.resolve('unknown')

    entry.status = 'checking'
    notify(entry, 'checking')
    entry.pending = new Promise(resolve => { entry.resolvePending = resolve })
    queue.push(entry)
    pump()
    return entry.pending
  }

  const realCheck = check

  return {
    getIdentity,
    getStatus(url) {
      const identity = getIdentity(url)
      if (!identity) return undefined
      const entry = entries.get(identity.key)
      return entry?.pending ? 'checking' : entry?.status
    },
    observe(url, owner) {
      const identity = getIdentity(url)
      if (!identity) return
      const entry = getEntry(identity)
      entry.urls.add(url)
      entry.owners.add(owner)
      let owned = ownerEntries.get(owner)
      if (!owned) ownerEntries.set(owner, owned = new Set())
      owned.add(identity.key)
      void realCheck(url)
    },
    retainOwnerImages(owner, urls) {
      const next = new Set<string>()
      for (const url of urls) {
        const identity = getIdentity(url)
        if (!identity) continue
        const entry = getEntry(identity)
        next.add(identity.key)
        entry.urls.add(url)
        entry.owners.add(owner)
        void realCheck(url)
      }
      const previous = ownerEntries.get(owner) ?? new Set()
      for (const key of previous) {
        if (next.has(key)) continue
        const entry = entries.get(key)
        entry?.owners.delete(owner)
      }
      ownerEntries.set(owner, next)
    },
    releaseOwner(owner) {
      const owned = ownerEntries.get(owner)
      if (!owned) return
      for (const key of owned) entries.get(key)?.owners.delete(owner)
      ownerEntries.delete(owner)
    },
    adopt(url, availability) {
      const identity = getIdentity(url)
      if (!identity || (availability !== 'present' && availability !== 'missing' && availability !== 'unknown')) return
      const entry = getEntry(identity)
      entry.urls.add(url)
      if (availability === 'missing') {
        entry.adopted = 'missing'
        entry.status = 'missing'
        notify(entry, 'missing')
      } else if (availability === 'present' && entry.adopted !== 'missing' && !entry.pending) {
        entry.adopted = 'present'
        entry.status = 'present'
        notify(entry, 'present')
      }
    },
    check: realCheck,
    refreshVisible() {
      if (disposed) return
      for (const entry of entries.values()) {
        if (entry.owners.size && entry.status === 'present') void realCheck(entry.urls.values().next().value!, { retry: true })
      }
    },
    subscribe(listener) {
      if (disposed) return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      queue.length = 0
      for (const entry of entries.values()) {
        if (entry.pending) {
          entry.status = 'unknown'
          entry.resolvePending?.('unknown')
          entry.resolvePending = undefined
          entry.pending = undefined
        }
      }
      listeners.clear()
      ownerEntries.clear()
    },
  }
}
