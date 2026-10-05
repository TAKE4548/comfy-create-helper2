import { LS_KEYS } from './localStorageKeys'

export const LOCAL_METADATA_CACHE_LIMIT = 30

type MetadataCandidate = {
  key: string
  timestamp: number
}

export function prunePromptMetadataCache(incomingPromptId: string, storage?: Storage): void {
  const target = storage ?? window.localStorage
  const keys: string[] = []

  // Snapshot candidate keys before any removal so storage enumeration stays stable.
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key?.startsWith(LS_KEYS.METADATA_PREFIX)) keys.push(key)
  }

  const invalidKeys: string[] = []
  const candidates: MetadataCandidate[] = []

  for (const key of keys) {
    const promptId = key.slice(LS_KEYS.METADATA_PREFIX.length)
    if (promptId === incomingPromptId) continue

    const raw = target.getItem(key)
    if (raw === null) {
      invalidKeys.push(key)
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      invalidKeys.push(key)
      continue
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      invalidKeys.push(key)
      continue
    }

    const timestamp = (parsed as { timestamp?: unknown }).timestamp
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      invalidKeys.push(key)
      continue
    }

    candidates.push({ key, timestamp })
  }

  candidates.sort((left, right) => right.timestamp - left.timestamp || left.key.localeCompare(right.key))
  const retainedKeys = new Set(candidates.slice(0, LOCAL_METADATA_CACHE_LIMIT - 1).map(({ key }) => key))

  for (const key of invalidKeys) target.removeItem(key)
  for (const { key } of candidates) {
    if (!retainedKeys.has(key)) target.removeItem(key)
  }
}
