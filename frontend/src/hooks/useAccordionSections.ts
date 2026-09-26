import { useState, useEffect, useCallback } from 'react'

export interface AccordionSectionsHook {
  isExpanded: (sectionKey: string | number) => boolean
  toggleSection: (sectionKey: string | number) => void
  expandAll: (keys: (string | number)[]) => void
  collapseAll: (keys: (string | number)[]) => void
}

export function useAccordionSections(storageKey: string, defaultOpen: boolean = true): AccordionSectionsHook {
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(expandedMap))
    } catch {
      // ignore localStorage quota errors
    }
  }, [storageKey, expandedMap])

  const isExpanded = useCallback((key: string | number): boolean => {
    const strKey = String(key)
    return expandedMap[strKey] ?? defaultOpen
  }, [expandedMap, defaultOpen])

  const toggleSection = useCallback((key: string | number) => {
    const strKey = String(key)
    setExpandedMap((prev) => ({
      ...prev,
      [strKey]: !(prev[strKey] ?? defaultOpen),
    }))
  }, [defaultOpen])

  const expandAll = useCallback((keys: (string | number)[]) => {
    setExpandedMap((prev) => {
      const next = { ...prev }
      keys.forEach((k) => { next[String(k)] = true })
      return next
    })
  }, [])

  const collapseAll = useCallback((keys: (string | number)[]) => {
    setExpandedMap((prev) => {
      const next = { ...prev }
      keys.forEach((k) => { next[String(k)] = false })
      return next
    })
  }, [])

  return { isExpanded, toggleSection, expandAll, collapseAll }
}
