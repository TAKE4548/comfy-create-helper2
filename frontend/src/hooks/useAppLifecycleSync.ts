import { useEffect, useRef } from 'react'
import { systemWsService } from '../store/services/systemWsService'
import { generationApi } from '../api/domains/generation'
import { useGenerationStore } from '../store/useGenerationStore'

export interface UseAppLifecycleSyncOptions {
  onSyncSuccess?: () => void
  onSyncError?: (error: unknown) => void
  debounceMs?: number
}

type SyncSubscriber = {
  getCallbacks: () => {
    onSyncSuccess?: () => void
    onSyncError?: (error: unknown) => void
  }
}

const DEFAULT_DEBOUNCE_MS = 500

let globalSyncInFlight: Promise<void> | null = null
let globalDebounceTimer: ReturnType<typeof setTimeout> | null = null
const activeSubscribers = new Set<SyncSubscriber>()

async function performSync(): Promise<void> {
  if (globalSyncInFlight) {
    return globalSyncInFlight
  }

  const syncPromise = (async () => {
    try {
      systemWsService.resume()
      const snapshot = await generationApi.getState()
      const store = useGenerationStore.getState()
      if (typeof store.applyGenerationSnapshot === 'function') {
        store.applyGenerationSnapshot(snapshot)
      } else if (typeof store.fetchQueue === 'function') {
        await store.fetchQueue()
      }

      activeSubscribers.forEach((subscriber) => {
        try {
          subscriber.getCallbacks().onSyncSuccess?.()
        } catch {
          // Prevent a single subscriber callback error from breaking notifications
        }
      })
    } catch (error) {
      activeSubscribers.forEach((subscriber) => {
        try {
          subscriber.getCallbacks().onSyncError?.(error)
        } catch {
          // Prevent a single subscriber callback error from breaking notifications
        }
      })
    } finally {
      globalSyncInFlight = null
    }
  })()

  globalSyncInFlight = syncPromise
  return syncPromise
}

function scheduleSync(debounceMs: number): void {
  if (globalSyncInFlight !== null) {
    return
  }

  if (globalDebounceTimer !== null) {
    clearTimeout(globalDebounceTimer)
  }

  if (debounceMs <= 0) {
    globalDebounceTimer = null
    void performSync()
    return
  }

  globalDebounceTimer = setTimeout(() => {
    globalDebounceTimer = null
    void performSync()
  }, debounceMs)
}

export function resetLifecycleSyncStateForTesting(): void {
  if (globalDebounceTimer !== null) {
    clearTimeout(globalDebounceTimer)
    globalDebounceTimer = null
  }
  globalSyncInFlight = null
  activeSubscribers.clear()
}

export function useAppLifecycleSync(options?: UseAppLifecycleSyncOptions): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const subscriber: SyncSubscriber = {
      getCallbacks: () => ({
        onSyncSuccess: optionsRef.current?.onSyncSuccess,
        onSyncError: optionsRef.current?.onSyncError,
      }),
    }
    activeSubscribers.add(subscriber)

    const handleEvent = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      scheduleSync(debounceMs)
    }

    document.addEventListener('visibilitychange', handleEvent)
    window.addEventListener('focus', handleEvent)

    return () => {
      activeSubscribers.delete(subscriber)
      document.removeEventListener('visibilitychange', handleEvent)
      window.removeEventListener('focus', handleEvent)

      if (activeSubscribers.size === 0 && globalDebounceTimer !== null) {
        clearTimeout(globalDebounceTimer)
        globalDebounceTimer = null
      }
    }
  }, [debounceMs])
}
