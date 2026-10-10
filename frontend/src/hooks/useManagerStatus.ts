import { useSyncExternalStore } from 'react'
import { systemManagerApi } from '../api/domains/systemManager'
import type { ManagerStatus } from '../api/domains/systemManager'

const STATUS_CACHE_MS = 2000

interface ManagerStatusSnapshot {
  status: ManagerStatus | null
  available: boolean
}

let snapshot: ManagerStatusSnapshot = { status: null, available: false }
let lastFetchedAt = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let requestInFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function refetchStatus(): Promise<void> {
  if (requestInFlight) return requestInFlight
  requestInFlight = systemManagerApi.status()
    .then((status) => {
      snapshot = { status, available: true }
      lastFetchedAt = Date.now()
      notify()
    })
    .catch(() => {
      snapshot = { ...snapshot, available: false }
      lastFetchedAt = Date.now()
      notify()
    })
    .finally(() => { requestInFlight = null })
  return requestInFlight
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    if (Date.now() - lastFetchedAt >= STATUS_CACHE_MS) void refetchStatus()
    pollTimer = setInterval(() => { void refetchStatus() }, STATUS_CACHE_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

function getSnapshot(): ManagerStatusSnapshot {
  return snapshot
}

export function useManagerStatus(): {
  status: ManagerStatus | null
  available: boolean
  refetch: () => Promise<void>
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...current, refetch: refetchStatus }
}
