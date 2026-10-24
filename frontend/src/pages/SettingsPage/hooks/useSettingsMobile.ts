import { useEffect, useState } from 'react'

const SETTINGS_MOBILE_QUERY = '(max-width: 767px)'

function readMobileMatch(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(SETTINGS_MOBILE_QUERY).matches
}

export function useSettingsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(readMobileMatch)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(SETTINGS_MOBILE_QUERY)
    const update = (event: MediaQueryListEvent) => setIsMobile(event.matches)

    setIsMobile(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return isMobile
}
