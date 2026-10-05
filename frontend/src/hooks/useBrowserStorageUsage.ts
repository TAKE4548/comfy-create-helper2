import { useEffect, useState } from 'react'
import {
  measureBrowserStorageUsage,
  type BrowserStorageUsage,
} from '../utils/browserStorageUsage'

const unavailable: BrowserStorageUsage = {
  localStorage: { status: 'unavailable' },
  sessionStorage: { status: 'unavailable' },
}

export function useBrowserStorageUsage(): BrowserStorageUsage {
  const [usage, setUsage] = useState<BrowserStorageUsage>(unavailable)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    const measure = () => setUsage(measureBrowserStorageUsage())
    const stop = () => {
      if (interval !== undefined) {
        clearInterval(interval)
        interval = undefined
      }
    }
    const start = () => {
      stop()
      measure()
      interval = setInterval(measure, 2500)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [])

  return usage
}
