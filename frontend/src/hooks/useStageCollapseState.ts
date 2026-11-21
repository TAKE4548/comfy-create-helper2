import { useCallback, useEffect, useState } from 'react'
import { LS_KEYS } from '../utils/localStorageKeys'

export type StageCollapsePane = 'prompt' | 'parameters'

export interface StageCollapseStorageV1 {
  version: 1
  collapsed: Record<string, string[]> // key: `${workflowId}:${pane}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

function toScopeKey(workflowId: number | null | undefined, pane: StageCollapsePane): string | null {
  if (workflowId === null || workflowId === undefined || !Number.isFinite(workflowId)) {
    return null
  }
  return `${workflowId}:${pane}`
}

function computeToggledSet(
  current: Set<string>,
  groupKey: string,
  validGroupKeys?: readonly string[],
): Set<string> {
  const next = new Set(current)
  if (next.has(groupKey)) {
    next.delete(groupKey)
  } else {
    next.add(groupKey)
  }
  if (validGroupKeys !== undefined) {
    const validSet = new Set(validGroupKeys)
    for (const key of next) {
      if (!validSet.has(key)) {
        next.delete(key)
      }
    }
  }
  return next
}

export function readStageCollapseMap(storage?: Storage): Record<string, string[]> {
  const target = resolveStorage(storage)
  if (!target) return {}
  try {
    const raw = target.getItem(LS_KEYS.STAGE_COLLAPSED_STATE)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isPlainObject(parsed) || parsed.version !== 1 || !isPlainObject(parsed.collapsed)) {
      return {}
    }
    const normalized: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(parsed.collapsed)) {
      if (!Array.isArray(value)) continue
      const items = Array.from(new Set(value.filter((item): item is string => typeof item === 'string')))
      if (items.length > 0) {
        normalized[key] = items
      }
    }
    return normalized
  } catch {
    return {}
  }
}

export function getCollapsedStageKeys(
  workflowId: number | null | undefined,
  pane: StageCollapsePane,
  storage?: Storage,
): Set<string> {
  const scopeKey = toScopeKey(workflowId, pane)
  if (!scopeKey) return new Set()
  const map = readStageCollapseMap(storage)
  return new Set(map[scopeKey] ?? [])
}

export function toggleCollapsedStageKey(
  workflowId: number | null | undefined,
  pane: StageCollapsePane,
  groupKey: string,
  validGroupKeys?: readonly string[],
  storage?: Storage,
): Set<string> {
  const scopeKey = toScopeKey(workflowId, pane)
  if (!scopeKey) return new Set()
  const map = readStageCollapseMap(storage)
  const nextSet = computeToggledSet(new Set(map[scopeKey] ?? []), groupKey, validGroupKeys)
  const nextMap: Record<string, string[]> = { ...map }
  if (nextSet.size > 0) {
    nextMap[scopeKey] = Array.from(nextSet)
  } else {
    delete nextMap[scopeKey]
  }
  const target = resolveStorage(storage)
  if (target) {
    try {
      const payload: StageCollapseStorageV1 = {
        version: 1,
        collapsed: nextMap,
      }
      target.setItem(LS_KEYS.STAGE_COLLAPSED_STATE, JSON.stringify(payload))
    } catch {
      // Ignore QuotaExceededError / storage restriction while keeping UI state responsive
    }
  }
  return nextSet
}

export function useStageCollapseState(
  workflowId: number | null | undefined,
  pane: StageCollapsePane,
): {
  isStageCollapsed: (groupKey: string) => boolean
  toggleStageCollapsed: (groupKey: string, validGroupKeys?: readonly string[]) => void
} {
  const scopeKey = toScopeKey(workflowId, pane)
  const [state, setState] = useState<{ scopeKey: string | null; keys: Set<string> }>(() => ({
    scopeKey,
    keys: getCollapsedStageKeys(workflowId, pane),
  }))

  const currentKeys = state.scopeKey === scopeKey ? state.keys : getCollapsedStageKeys(workflowId, pane)

  useEffect(() => {
    setState({
      scopeKey,
      keys: getCollapsedStageKeys(workflowId, pane),
    })
  }, [scopeKey, workflowId, pane])

  const isStageCollapsed = useCallback(
    (groupKey: string) => currentKeys.has(groupKey),
    [currentKeys],
  )

  const toggleStageCollapsed = useCallback(
    (groupKey: string, validGroupKeys?: readonly string[]) => {
      if (!scopeKey) {
        setState((prev) => ({
          scopeKey: null,
          keys: computeToggledSet(prev.scopeKey === null ? prev.keys : new Set(), groupKey, validGroupKeys),
        }))
        return
      }
      const nextKeys = toggleCollapsedStageKey(workflowId, pane, groupKey, validGroupKeys)
      setState({ scopeKey, keys: nextKeys })
    },
    [scopeKey, workflowId, pane],
  )

  return { isStageCollapsed, toggleStageCollapsed }
}