import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresetAutoSave, type UsePresetAutoSaveProps } from '../usePresetAutoSave'
import type { WorkflowPreset } from '../../../../api/types'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { HistoryState } from '../presetStateUtils'

describe('usePresetAutoSave', () => {
  const initialPresets: WorkflowPreset[] = [
    {
      id: 1,
      workflow_id: 10,
      name: 'Preset 1',
      param_values: { prompt: 'cat' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 123,
      is_default: false,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ]

  const mockCurrentState: HistoryState = {
    paramValues: { prompt: 'dog' },
    appliedAssets: {},
    batchSize: 1,
    seedMode: 'random',
    seed: 123,
  }

  let onPerformUpdatePresetMock: ReturnType<typeof vi.fn>
  let onRecordHistoryMock: ReturnType<typeof vi.fn>
  let updateActiveSetMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    onPerformUpdatePresetMock = vi.fn()
    onRecordHistoryMock = vi.fn()
    updateActiveSetMock = vi.fn()

    // Mock useGenerationStore.getState
    useGenerationStore.getState = vi.fn().mockReturnValue({
      activeSetId: 1,
      paramValues: { prompt: 'dog' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 123,
      updateActiveSet: updateActiveSetMock,
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('triggers auto save after 1000ms debounce when state changes', () => {
    const presetsRef = { current: initialPresets }
    const isInitialSyncRef = { current: true }
    const lastSavedStateRef = {
      current: {
        1: {
          paramValues: { prompt: 'cat' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 123,
        },
      },
    }
    const presetUpdatedAtRef = { current: { 1: '2026-09-01T00:00:00Z' } }

    const props: UsePresetAutoSaveProps = {
      selectedWorkflowId: 10,
      activeSetId: 1,
      currentState: mockCurrentState,
      presets: initialPresets,
      presetsRef,
      isInitialSyncRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      onPerformUpdatePreset: onPerformUpdatePresetMock,
      onRecordHistory: onRecordHistoryMock,
    }

    renderHook(() => usePresetAutoSave(props))

    expect(onPerformUpdatePresetMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(updateActiveSetMock).toHaveBeenCalledWith(mockCurrentState)
    expect(onRecordHistoryMock).toHaveBeenCalledWith(1, {
      paramValues: { prompt: 'cat' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 123,
    })
    expect(onPerformUpdatePresetMock).toHaveBeenCalledWith({
      id: 1,
      name: 'Preset 1',
      param_values: { prompt: 'dog' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 123,
      base_updated_at: '2026-09-01T00:00:00Z',
    })
    expect(lastSavedStateRef.current[1]).toEqual(mockCurrentState)
  })

  it('does not trigger auto save if isInitialSyncRef is false', () => {
    const presetsRef = { current: initialPresets }
    const isInitialSyncRef = { current: false }
    const lastSavedStateRef = { current: {} }
    const presetUpdatedAtRef = { current: {} }

    const props: UsePresetAutoSaveProps = {
      selectedWorkflowId: 10,
      activeSetId: 1,
      currentState: mockCurrentState,
      presets: initialPresets,
      presetsRef,
      isInitialSyncRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      onPerformUpdatePreset: onPerformUpdatePresetMock,
    }

    renderHook(() => usePresetAutoSave(props))

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onPerformUpdatePresetMock).not.toHaveBeenCalled()
  })

  it('suppresses auto save if current state equals lastSavedState (AC-3 normalization)', () => {
    const presetsRef = { current: initialPresets }
    const isInitialSyncRef = { current: true }
    // Same state, different key ordering in object
    const lastSavedStateRef = {
      current: {
        1: {
          seed: 123,
          seedMode: 'random' as const,
          batchSize: 1,
          appliedAssets: {},
          paramValues: { prompt: 'dog' },
        },
      },
    }
    const presetUpdatedAtRef = { current: {} }

    const props: UsePresetAutoSaveProps = {
      selectedWorkflowId: 10,
      activeSetId: 1,
      currentState: mockCurrentState,
      presets: initialPresets,
      presetsRef,
      isInitialSyncRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      onPerformUpdatePreset: onPerformUpdatePresetMock,
    }

    renderHook(() => usePresetAutoSave(props))

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onPerformUpdatePresetMock).not.toHaveBeenCalled()
  })

  it('synchronously executes flushAutoSave and immediately calls updateActiveSet (AC-2)', () => {
    const presetsRef = { current: initialPresets }
    const isInitialSyncRef = { current: true }
    const lastSavedStateRef = {
      current: {
        1: {
          paramValues: { prompt: 'cat' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 123,
        },
      },
    }
    const presetUpdatedAtRef = { current: {} }

    const props: UsePresetAutoSaveProps = {
      selectedWorkflowId: 10,
      activeSetId: 1,
      currentState: mockCurrentState,
      presets: initialPresets,
      presetsRef,
      isInitialSyncRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      onPerformUpdatePreset: onPerformUpdatePresetMock,
      onRecordHistory: onRecordHistoryMock,
    }

    const { result } = renderHook(() => usePresetAutoSave(props))

    expect(onPerformUpdatePresetMock).not.toHaveBeenCalled()

    // Call flushAutoSave directly before timer expires
    act(() => {
      result.current.flushAutoSave()
    })

    // AC-2: In-memory store should be updated synchronously
    expect(updateActiveSetMock).toHaveBeenCalledWith(mockCurrentState)
    expect(onPerformUpdatePresetMock).toHaveBeenCalledTimes(1)
    expect(lastSavedStateRef.current[1]).toEqual(mockCurrentState)
  })
})
