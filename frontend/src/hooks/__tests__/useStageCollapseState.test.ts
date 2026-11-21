import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LS_KEYS } from '../../utils/localStorageKeys'
import {
  getCollapsedStageKeys,
  readStageCollapseMap,
  toggleCollapsedStageKey,
  useStageCollapseState,
} from '../useStageCollapseState'

describe('useStageCollapseState', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('[REQ-435/AC-15] expands all stages by default on a first-time workflow and when workflowId is nullish', () => {
    expect(getCollapsedStageKeys(10, 'parameters')).toEqual(new Set())
    expect(getCollapsedStageKeys(null, 'parameters')).toEqual(new Set())
    expect(getCollapsedStageKeys(undefined, 'prompt')).toEqual(new Set())

    const { result } = renderHook(() => useStageCollapseState(10, 'parameters'))
    expect(result.current.isStageCollapsed('main')).toBe(false)
    expect(result.current.isStageCollapsed('rough')).toBe(false)
  })

  it('[REQ-435/AC-16] persists collapsed stage keys per workflow and pane across reloads and workflow switches', () => {
    const first = renderHook(
      ({ workflowId, pane }: { workflowId: number | null; pane: 'prompt' | 'parameters' }) =>
        useStageCollapseState(workflowId, pane),
      { initialProps: { workflowId: 101 as number | null, pane: 'parameters' as const } },
    )

    act(() => {
      first.result.current.toggleStageCollapsed('rough', ['main', 'rough'])
    })

    expect(first.result.current.isStageCollapsed('rough')).toBe(true)
    expect(first.result.current.isStageCollapsed('main')).toBe(false)

    const raw = JSON.parse(localStorage.getItem(LS_KEYS.STAGE_COLLAPSED_STATE) || '{}')
    expect(raw).toEqual({
      version: 1,
      collapsed: {
        '101:parameters': ['rough'],
      },
    })

    // Same workflow, different pane stays independent
    const promptHook = renderHook(() => useStageCollapseState(101, 'prompt'))
    expect(promptHook.result.current.isStageCollapsed('rough')).toBe(false)
    act(() => {
      promptHook.result.current.toggleStageCollapsed('main', ['main', 'rough'])
    })
    expect(promptHook.result.current.isStageCollapsed('main')).toBe(true)
    expect(first.result.current.isStageCollapsed('rough')).toBe(true)

    // Switching workflowId resyncs state immediately
    first.rerender({ workflowId: 202, pane: 'parameters' })
    expect(first.result.current.isStageCollapsed('rough')).toBe(false)

    // Switching back restores persisted state
    first.rerender({ workflowId: 101, pane: 'parameters' })
    expect(first.result.current.isStageCollapsed('rough')).toBe(true)

    // Reload simulation via fresh renderHook
    const reloaded = renderHook(() => useStageCollapseState(101, 'parameters'))
    expect(reloaded.result.current.isStageCollapsed('rough')).toBe(true)
    expect(reloaded.result.current.isStageCollapsed('main')).toBe(false)
  })

  it('[REQ-435/AC-16] ignores and prunes stale stage keys when toggling with validGroupKeys', () => {
    localStorage.setItem(
      LS_KEYS.STAGE_COLLAPSED_STATE,
      JSON.stringify({
        version: 1,
        collapsed: {
          '7:parameters': ['deleted-stage', 'rough'],
        },
      }),
    )

    const keys = getCollapsedStageKeys(7, 'parameters')
    expect(keys.has('deleted-stage')).toBe(true)

    const next = toggleCollapsedStageKey(7, 'parameters', 'main', ['main', 'rough'])
    expect(next).toEqual(new Set(['rough', 'main']))
    expect(next.has('deleted-stage')).toBe(false)

    const persisted = readStageCollapseMap()
    expect(persisted['7:parameters']).toEqual(['rough', 'main'])
  })

  it('[REQ-435/AC-16] falls back safely on corrupted JSON, invalid schema, and QuotaExceededError', () => {
    localStorage.setItem(LS_KEYS.STAGE_COLLAPSED_STATE, '{not-valid-json')
    expect(readStageCollapseMap()).toEqual({})
    expect(getCollapsedStageKeys(1, 'parameters')).toEqual(new Set())

    localStorage.setItem(
      LS_KEYS.STAGE_COLLAPSED_STATE,
      JSON.stringify({ version: 2, collapsed: { '1:parameters': ['main'] } }),
    )
    expect(readStageCollapseMap()).toEqual({})

    localStorage.setItem(
      LS_KEYS.STAGE_COLLAPSED_STATE,
      JSON.stringify({ version: 1, collapsed: { '1:parameters': ['main', 123, 'main'], bad: 'nope' } }),
    )
    expect(readStageCollapseMap()).toEqual({ '1:parameters': ['main'] })

    const quotaStorage: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      },
    }
    expect(() => toggleCollapsedStageKey(1, 'parameters', 'main', ['main'], quotaStorage)).not.toThrow()
    expect(toggleCollapsedStageKey(1, 'parameters', 'main', ['main'], quotaStorage)).toEqual(new Set(['main']))

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    const { result } = renderHook(() => useStageCollapseState(55, 'parameters'))
    expect(() => {
      act(() => {
        result.current.toggleStageCollapsed('main', ['main'])
      })
    }).not.toThrow()
    expect(result.current.isStageCollapsed('main')).toBe(true)
  })
})