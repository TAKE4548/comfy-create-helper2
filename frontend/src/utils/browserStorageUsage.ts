export type StorageUsage =
  | { status: 'ok'; bytes: number }
  | { status: 'unavailable' }

export interface BrowserStorageUsage {
  localStorage: StorageUsage
  sessionStorage: StorageUsage
}

const unavailable = (): StorageUsage => ({ status: 'unavailable' })

export function measureStorageUsage(getStorage: () => Storage): StorageUsage {
  try {
    const storage = getStorage()
    const initialLength = storage.length
    if (!Number.isSafeInteger(initialLength) || initialLength < 0) return unavailable()

    let bytes = 0
    for (let index = 0; index < initialLength; index += 1) {
      const key = storage.key(index)
      if (key === null || storage.length !== initialLength) return unavailable()

      const value = storage.getItem(key)
      if (value === null || storage.length !== initialLength) return unavailable()

      bytes += (key.length + value.length) * 2
      if (!Number.isSafeInteger(bytes)) return unavailable()
    }

    if (storage.length !== initialLength) return unavailable()
    return { status: 'ok', bytes }
  } catch {
    return unavailable()
  }
}

export function measureBrowserStorageUsage(): BrowserStorageUsage {
  return {
    localStorage: measureStorageUsage(() => window.localStorage),
    sessionStorage: measureStorageUsage(() => window.sessionStorage),
  }
}

export function formatStorageUsage(usage: StorageUsage): string {
  if (usage.status === 'unavailable') return '取得不可'
  if (!Number.isSafeInteger(usage.bytes) || usage.bytes < 0) return '取得不可'

  if (usage.bytes < 1048576) return `${(usage.bytes / 1024).toFixed(1)} KiB`
  return `${(usage.bytes / 1048576).toFixed(1)} MiB`
}
