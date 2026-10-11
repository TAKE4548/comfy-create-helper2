import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { systemWsService } from '../../store/services/systemWsService'
import { generationApi } from '../../api/domains/generation'
import { useGenerationStore } from '../../store/useGenerationStore'
import {
  useAppLifecycleSync,
  resetLifecycleSyncStateForTesting,
} from '../useAppLifecycleSync'

vi.mock('../../store/services/systemWsService', () => ({
  systemWsService: {
    resume: vi.fn(),
    suspend: vi.fn(),
  },
}))

vi.mock('../../api/domains/generation', () => ({
  generationApi: {
    getState: vi.fn(),
  },
}))

const mockStoreState = {
  applyGenerationSnapshot: vi.fn().mockReturnValue(true),
  fetchQueue: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../store/useGenerationStore', () => ({
  useGenerationStore: {
    getState: vi.fn(() => mockStoreState),
  },
}))

describe('useAppLifecycleSync', () => {
  const mockSnapshot = {
    version: 1,
    epoch: 'epoch-1',
    revision: 42,
    normal_group_id: null,
    jobs: [],
    batches: [],
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
  }

  beforeEach(() => {
    vi.useFakeTimers()
    resetLifecycleSyncStateForTesting()
    vi.clearAllMocks()
    vi.mocked(generationApi.getState).mockResolvedValue(mockSnapshot as any)
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    resetLifecycleSyncStateForTesting()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('syncs state and calls systemWsService.resume when visibility changes to visible', async () => {
    const onSyncSuccess = vi.fn()
    const onSyncError = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        onSyncError,
        debounceMs: 500,
      })
    )

    document.dispatchEvent(new Event('visibilitychange'))

    expect(systemWsService.resume).not.toHaveBeenCalled()
    expect(generationApi.getState).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(systemWsService.resume).toHaveBeenCalledTimes(1)
    expect(generationApi.getState).toHaveBeenCalledTimes(1)
    expect(mockStoreState.applyGenerationSnapshot).toHaveBeenCalledWith(mockSnapshot)
    expect(onSyncSuccess).toHaveBeenCalledTimes(1)
    expect(onSyncError).not.toHaveBeenCalled()
  })

  it('does nothing when visibility changes to hidden', async () => {
    const onSyncSuccess = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        debounceMs: 500,
      })
    )

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    })

    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(systemWsService.resume).not.toHaveBeenCalled()
    expect(generationApi.getState).not.toHaveBeenCalled()
    expect(onSyncSuccess).not.toHaveBeenCalled()
  })

  it('syncs state when window receives focus while document is visible', async () => {
    const onSyncSuccess = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        debounceMs: 300,
      })
    )

    window.dispatchEvent(new Event('focus'))

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(systemWsService.resume).toHaveBeenCalledTimes(1)
    expect(generationApi.getState).toHaveBeenCalledTimes(1)
    expect(onSyncSuccess).toHaveBeenCalledTimes(1)
  })

  it('debounces multiple rapid events within debounce window', async () => {
    const onSyncSuccess = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        debounceMs: 500,
      })
    )

    // First event
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(200)

    // Second event before 500ms elapses
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(200)

    // Third event
    document.dispatchEvent(new Event('visibilitychange'))

    // Advance remaining time for the debounced call to fire
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(systemWsService.resume).toHaveBeenCalledTimes(1)
    expect(generationApi.getState).toHaveBeenCalledTimes(1)
    expect(onSyncSuccess).toHaveBeenCalledTimes(1)
  })

  it('suppresses redundant sync when a sync is already in flight', async () => {
    let resolveState!: (val: any) => void
    const statePromise = new Promise((resolve) => {
      resolveState = resolve
    })
    vi.mocked(generationApi.getState).mockReturnValue(statePromise as any)

    const onSyncSuccess = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        debounceMs: 200,
      })
    )

    // Trigger first sync
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(generationApi.getState).toHaveBeenCalledTimes(1)

    // Trigger second sync while first is still awaiting statePromise
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // Still only 1 call because first sync is in flight
    expect(generationApi.getState).toHaveBeenCalledTimes(1)

    // Now resolve the in-flight promise
    await act(async () => {
      resolveState(mockSnapshot)
    })

    expect(onSyncSuccess).toHaveBeenCalledTimes(1)
    expect(mockStoreState.applyGenerationSnapshot).toHaveBeenCalledWith(mockSnapshot)
  })

  it('catches errors gracefully on network/fetch failure and invokes onSyncError', async () => {
    const testError = new Error('Network offline')
    vi.mocked(generationApi.getState).mockRejectedValue(testError)

    const onSyncSuccess = vi.fn()
    const onSyncError = vi.fn()

    renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        onSyncError,
        debounceMs: 200,
      })
    )

    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(systemWsService.resume).toHaveBeenCalledTimes(1)
    expect(generationApi.getState).toHaveBeenCalledTimes(1)
    expect(onSyncSuccess).not.toHaveBeenCalled()
    expect(onSyncError).toHaveBeenCalledWith(testError)
  })

  it('cleans up event listeners and timers on unmount', async () => {
    const onSyncSuccess = vi.fn()

    const { unmount } = renderHook(() =>
      useAppLifecycleSync({
        onSyncSuccess,
        debounceMs: 500,
      })
    )

    // Trigger event and unmount before timer elapses
    document.dispatchEvent(new Event('visibilitychange'))
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(systemWsService.resume).not.toHaveBeenCalled()
    expect(generationApi.getState).not.toHaveBeenCalled()
    expect(onSyncSuccess).not.toHaveBeenCalled()

    // Trigger event after unmount
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(systemWsService.resume).not.toHaveBeenCalled()
    expect(generationApi.getState).not.toHaveBeenCalled()
  })
})
