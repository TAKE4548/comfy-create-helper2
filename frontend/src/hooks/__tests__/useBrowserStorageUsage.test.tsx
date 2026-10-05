import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { measureBrowserStorageUsage } from '../../utils/browserStorageUsage'
import { useBrowserStorageUsage } from '../useBrowserStorageUsage'

vi.mock('../../utils/browserStorageUsage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/browserStorageUsage')>()
  return { ...actual, measureBrowserStorageUsage: vi.fn() }
})

const measure = vi.mocked(measureBrowserStorageUsage)
const snapshot = (bytes: number) => ({
  localStorage: { status: 'ok' as const, bytes },
  sessionStorage: { status: 'ok' as const, bytes: bytes + 1 },
})

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
}

describe('useBrowserStorageUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    measure.mockReturnValue(snapshot(1))
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    setVisibility('visible')
  })

  it('measures on mount and every 2500ms', () => {
    const { result, unmount } = renderHook(() => useBrowserStorageUsage())
    expect(measure).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual(snapshot(1))

    measure.mockReturnValue(snapshot(2))
    act(() => vi.advanceTimersByTime(2499))
    expect(measure).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1))
    expect(measure).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual(snapshot(2))
    unmount()
    act(() => vi.advanceTimersByTime(5000))
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('stops while hidden and measures immediately when visible again', () => {
    const { result } = renderHook(() => useBrowserStorageUsage())
    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(5000))
    expect(measure).toHaveBeenCalledTimes(1)

    measure.mockReturnValue(snapshot(3))
    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(measure).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual(snapshot(3))
    act(() => vi.advanceTimersByTime(2500))
    expect(measure).toHaveBeenCalledTimes(3)
  })

  it('reflects changed measurements and recovers from unavailable storage', () => {
    const { result } = renderHook(() => useBrowserStorageUsage())
    const unavailable = {
      localStorage: { status: 'unavailable' as const },
      sessionStorage: { status: 'unavailable' as const },
    }
    measure.mockReturnValue(unavailable)
    act(() => vi.advanceTimersByTime(2500))
    expect(result.current).toEqual(unavailable)

    measure.mockReturnValue(snapshot(42))
    act(() => vi.advanceTimersByTime(2500))
    expect(result.current).toEqual(snapshot(42))
  })

  it('keeps one interval under StrictMode and replaces it on repeated visibility events', () => {
    const { unmount } = renderHook(() => useBrowserStorageUsage(), {
      wrapper: StrictMode,
    })
    expect(measure).toHaveBeenCalledTimes(2)
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(2500))
    expect(measure).toHaveBeenCalledTimes(5)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
