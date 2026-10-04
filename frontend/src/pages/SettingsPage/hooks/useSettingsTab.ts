import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LS_KEYS } from '../../../utils/localStorageKeys'

export type SettingsTabId = 'workflows' | 'prompt' | 'dialogue' | 'translation' | 'system'

const SETTINGS_TABS: readonly SettingsTabId[] = [
  'workflows',
  'prompt',
  'dialogue',
  'translation',
  'system',
]

function parseTab(value: string | null | undefined): SettingsTabId | null {
  const tab = value?.replace(/^#/, '')
  return SETTINGS_TABS.includes(tab as SettingsTabId) ? (tab as SettingsTabId) : null
}

function readSavedTab(): SettingsTabId | null {
  try {
    return parseTab(window.localStorage.getItem(LS_KEYS.SETTINGS_ACTIVE_TAB))
  } catch {
    return null
  }
}

function saveTab(tab: SettingsTabId): void {
  try {
    window.localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, tab)
  } catch {
    // URL navigation remains the source of truth when storage is unavailable.
  }
}

export function useSettingsTab(): { activeTab: SettingsTabId; selectTab: (id: SettingsTabId) => void } {
  const location = useLocation()
  const navigate = useNavigate()
  const initialized = useRef(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() =>
    parseTab(location.hash) ?? readSavedTab() ?? 'workflows',
  )

  useEffect(() => {
    const urlTab = parseTab(location.hash)
    if (!initialized.current) {
      initialized.current = true
      const initialTab = urlTab ?? readSavedTab() ?? 'workflows'
      setActiveTab(initialTab)
      saveTab(initialTab)
      if (urlTab !== initialTab) {
        navigate({ pathname: location.pathname, search: location.search, hash: `#${initialTab}` }, { replace: true })
      }
      return
    }

    const nextTab = urlTab ?? 'workflows'
    setActiveTab(nextTab)
    saveTab(nextTab)
    if (!urlTab) {
      navigate({ pathname: location.pathname, search: location.search, hash: '#workflows' }, { replace: true })
    }
  }, [location.hash, location.pathname, location.search, navigate])

  const selectTab = useCallback((id: SettingsTabId) => {
    if (id === activeTab) return
    navigate({ pathname: location.pathname, search: location.search, hash: `#${id}` })
  }, [activeTab, location.pathname, location.search, navigate])

  return { activeTab, selectTab }
}
