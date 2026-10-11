import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowPreset } from '../../../../api/types'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { usePresetAutoSave } from '../usePresetAutoSave'
import type { HistoryState } from '../presetStateUtils'

const SEED_MODES_KEY = '__seed_modes_v1'
const slotKey = 'master:10:variant:20'
const seedValues = {
  MainSeed: '4294967295',
  [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes: { [slotKey]: 'random' } }),
}

describe('usePresetAutoSave seed contract', () => {
  const preset: WorkflowPreset = {
    id: 7,
    workflow_id: 350,
    name: 'seed preset',
    param_values: {},
    applied_assets: {},
    batch_size: 1,
    seed_mode: 'random',
    seed: 42,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    useGenerationStore.setState({
      activeSetId: 7,
      paramValues: seedValues,
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 42,
    })
  })

  it('passes seed role values and versioned slot modes through autosave and active-set sync', () => {
    const saved: HistoryState[] = []
    const update = vi.fn((state: HistoryState) => saved.push(state))
    vi.spyOn(useGenerationStore, 'getState').mockReturnValue({
      ...useGenerationStore.getState(),
      activeSetId: 7,
      paramValues: seedValues,
      updateActiveSet: update,
    } as ReturnType<typeof useGenerationStore.getState>)
    const onPerformUpdatePreset = vi.fn()
    const props = {
      selectedWorkflowId: 350,
      activeSetId: 7,
      currentState: { paramValues: {}, appliedAssets: {}, batchSize: 1, seedMode: 'random' as const, seed: 42 },
      presets: [preset],
      presetsRef: { current: [preset] },
      isInitialSyncRef: { current: true },
      lastSavedStateRef: { current: {} },
      presetUpdatedAtRef: { current: {} },
      onPerformUpdatePreset,
    }
    const { result } = renderHook(() => usePresetAutoSave(props))

    act(() => result.current.flushAutoSave())

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ paramValues: seedValues }))
    expect(onPerformUpdatePreset).toHaveBeenCalledWith(expect.objectContaining({
      param_values: seedValues,
      seed_mode: 'random',
      seed: 42,
    }))
  })
})
