import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePresetState, normalizeTimestamp, isTimestampDifferent } from '../usePresetState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { workflowPresetsApi } from '../../../../api/client'
import type { WorkflowPreset } from '../../../../api/types'

vi.mock('../../../../api/client', () => ({
  workflowPresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkDelete: vi.fn(),
    reorder: vi.fn(),
  },
}))

describe('usePresetState multi-device sync and conflict handling', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    useGenerationStore.setState({
      selectedWorkflowId: 1,
      activeSetId: 101,
      openPresetIds: [101],
      paramValues: { prompt: 'initial prompt' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 42,
      sets: [
        {
          id: 101,
          name: 'Set 1',
          paramValues: { prompt: 'initial prompt' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
    })
  })

  it('syncs automatically with server via loadPresetData when local is clean (!isDirty)', async () => {
    const initialPreset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'initial prompt' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([initialPreset])

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toBeDefined()
    })

    // Simulate remote update from device B: updated_at advances, prompt changes
    const updatedPreset: WorkflowPreset = {
      ...initialPreset,
      param_values: { prompt: 'updated from device B' },
      updated_at: '2026-09-08T10:05:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([updatedPreset])

    // Invalidate queries to trigger TanStack Query refetch
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
    })

    // Store state should reflect server values automatically
    await waitFor(() => {
      const state = useGenerationStore.getState()
      expect(state.paramValues.prompt).toBe('updated from device B')
    })
    expect(result.current.conflictData).toBeNull()
  })

  it('triggers conflictData when server updated_at advances and local has unsaved changes (isDirty)', async () => {
    const initialPreset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'initial prompt' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([initialPreset])

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toBeDefined()
    })

    // User edits locally without saving (making it dirty)
    act(() => {
      useGenerationStore.getState().setParamValues({ prompt: 'local draft on device A' })
    })

    // Simulate remote update from device B: updated_at advances
    const updatedPreset: WorkflowPreset = {
      ...initialPreset,
      param_values: { prompt: 'remote edits on device B' },
      updated_at: '2026-09-08T10:05:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([updatedPreset])

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
    })

    // Should NOT overwrite local dirty draft; should enter conflictData state
    await waitFor(() => {
      expect(result.current.conflictData).not.toBeNull()
    })
    expect(result.current.conflictData?.serverPreset.param_values?.prompt).toBe('remote edits on device B')
    expect(result.current.conflictData?.localDraft.paramValues.prompt).toBe('local draft on device A')
  })

  it('sets conflictData when updatePresetMutation encounters 409 Conflict', async () => {
    const preset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'server version' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset])
    vi.mocked(workflowPresetsApi.update).mockRejectedValueOnce(new Error('409 Conflict: Optimistic lock error'))

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toBeDefined()
    })

    act(() => {
      result.current.updatePresetMutation.mutate({
        id: 101,
        name: 'Set 1',
        param_values: { prompt: 'my local changes that failed' },
      })
    })

    await waitFor(() => {
      expect(result.current.conflictData).not.toBeNull()
    })

    expect(result.current.conflictData?.serverPreset.id).toBe(101)
    expect(result.current.conflictData?.localDraft.paramValues.prompt).toBe('my local changes that failed')
  })

  it('handleSelectPresetTab switches to existing set without reloading when server is unchanged', async () => {
    const preset1: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'server prompt 1' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }
    const preset2: WorkflowPreset = {
      id: 102,
      workflow_id: 1,
      name: 'Set 2',
      param_values: { prompt: 'server prompt 2' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 1,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1, preset2])

    useGenerationStore.setState({
      selectedWorkflowId: 1,
      activeSetId: 101,
      openPresetIds: [101, 102],
      sets: [
        {
          id: 101,
          name: 'Set 1',
          paramValues: { prompt: 'edited draft 1' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
        {
          id: 102,
          name: 'Set 2',
          paramValues: { prompt: 'edited draft 2' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toHaveLength(2)
    })

    // User edits draft in Set 2 while on Set 1
    act(() => {
      useGenerationStore.setState((prev) => ({
        sets: prev.sets.map((s) =>
          s.id === 102 ? { ...s, paramValues: { prompt: 'edited draft 2' } } : s
        ),
      }))
    })

    act(() => {
      result.current.handleSelectPresetTab(102)
    })

    expect(useGenerationStore.getState().activeSetId).toBe(102)
    const set2 = useGenerationStore.getState().sets.find((s) => s.id === 102)
    expect(set2?.paramValues.prompt).toBe('edited draft 2')
    expect(result.current.conflictData).toBeNull()
  })

  it('handleSelectPresetTab automatically reloads server preset when server updated_at changed and local is clean', async () => {
    const preset1: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'prompt 1' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }
    const preset2: WorkflowPreset = {
      id: 102,
      workflow_id: 1,
      name: 'Set 2',
      param_values: { prompt: 'server prompt 2 clean' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 1,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1, preset2])

    useGenerationStore.setState({
      selectedWorkflowId: 1,
      activeSetId: 101,
      openPresetIds: [101, 102],
      sets: [
        {
          id: 101,
          name: 'Set 1',
          paramValues: { prompt: 'prompt 1' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
        {
          id: 102,
          name: 'Set 2',
          paramValues: { prompt: 'server prompt 2 clean' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toHaveLength(2)
    })

    // Remote update occurs on preset2
    const updatedPreset2: WorkflowPreset = {
      ...preset2,
      param_values: { prompt: 'remote updated prompt 2' },
      updated_at: '2026-09-08T10:10:00Z',
    }
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1, updatedPreset2])
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
    })

    await waitFor(() => {
      expect(result.current.presets?.[1].updated_at).toBe('2026-09-08T10:10:00Z')
    })

    act(() => {
      result.current.handleSelectPresetTab(102)
    })

    const state = useGenerationStore.getState()
    expect(state.activeSetId).toBe(102)
    expect(state.paramValues.prompt).toBe('remote updated prompt 2')
    expect(result.current.conflictData).toBeNull()
  })

  it('handleSelectPresetTab sets conflictData immediately when server updated_at changed and local is dirty', async () => {
    const preset1: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { prompt: 'prompt 1' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }
    const preset2: WorkflowPreset = {
      id: 102,
      workflow_id: 1,
      name: 'Set 2',
      param_values: { prompt: 'original prompt 2' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 1,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1, preset2])

    useGenerationStore.setState({
      selectedWorkflowId: 1,
      activeSetId: 101,
      openPresetIds: [101, 102],
      sets: [
        {
          id: 101,
          name: 'Set 1',
          paramValues: { prompt: 'prompt 1' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
        {
          id: 102,
          name: 'Set 2',
          paramValues: { prompt: 'local dirty prompt 2' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper }
    )

    await waitFor(() => {
      expect(result.current.presets).toHaveLength(2)
    })

    // User edits draft in Set 2 while on Set 1
    act(() => {
      useGenerationStore.setState((prev) => ({
        sets: prev.sets.map((s) =>
          s.id === 102 ? { ...s, paramValues: { prompt: 'local dirty prompt 2' } } : s
        ),
      }))
    })

    // Remote update occurs on preset2
    const updatedPreset2: WorkflowPreset = {
      ...preset2,
      param_values: { prompt: 'remote modified prompt 2' },
      updated_at: '2026-09-08T10:15:00Z',
    }
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1, updatedPreset2])
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
    })

    await waitFor(() => {
      expect(result.current.presets?.[1].updated_at).toBe('2026-09-08T10:15:00Z')
    })

    act(() => {
      result.current.handleSelectPresetTab(102)
    })

    expect(result.current.conflictData).not.toBeNull()
    expect(result.current.conflictData?.serverPreset.param_values?.prompt).toBe('remote modified prompt 2')
    expect(result.current.conflictData?.localDraft.paramValues.prompt).toBe('local dirty prompt 2')
  })

  describe('normalizeTimestamp & isTimestampDifferent', () => {
    it('normalizes timestamps correctly with or without Z', () => {
      const withZ = '2026-09-18T10:00:00Z'
      const withoutZ = '2026-09-18T10:00:00'
      expect(normalizeTimestamp(withZ)).toBe(normalizeTimestamp(withoutZ))
      expect(isTimestampDifferent(withZ, withoutZ)).toBe(false)
    })

    it('detects difference when timestamps differ by more than thresholdMs', () => {
      const ts1 = '2026-09-18T10:00:00Z'
      const ts2 = '2026-09-18T10:00:05Z'
      expect(isTimestampDifferent(ts1, ts2)).toBe(true)
      expect(isTimestampDifferent(ts1, ts2, 10000)).toBe(false)
    })

    it('handles empty or missing timestamps properly', () => {
      expect(isTimestampDifferent(null, null)).toBe(false)
      expect(isTimestampDifferent('2026-09-18T10:00:00Z', null)).toBe(true)
      expect(isTimestampDifferent(null, '2026-09-18T10:00:00Z')).toBe(true)
    })

    it('does not trigger reload when server updated_at only differs by formatting (Z suffix)', async () => {
      const initialPreset: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Set 1',
        param_values: { prompt: 'initial prompt' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-09-08T10:00:00',
        updated_at: '2026-09-08T10:00:00',
      }

      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([initialPreset])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.presets).toBeDefined()
      })

      // Simulate loadPresetData spy or verification that state is not overwritten
      const formattedPreset: WorkflowPreset = {
        ...initialPreset,
        updated_at: '2026-09-08T10:00:00Z', // identical instant, but with Z
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([formattedPreset])

      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
      })

      // Target preset tab select should not report conflict or change
      act(() => {
        result.current.handleSelectPresetTab(101)
      })
      expect(result.current.conflictData).toBeNull()
    })
  })

  describe('REQ-278: in-memory state preservation during preset re-sync', () => {
    it('Scenario 3.1: preserves local edited steps (Steps=40) in sets when server re-syncs with DB values (Steps=20)', async () => {
      const initialPreset: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Set 1',
        param_values: { Sampler_Steps: '20' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }

      vi.mocked(workflowPresetsApi.list).mockResolvedValue([initialPreset])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.presets).toHaveLength(1)
      })

      // 1. 編集前のプリセットがセットにロードされている
      expect(useGenerationStore.getState().sets[0].paramValues.Sampler_Steps).toBe('20')

      // 2. ユーザー操作により Steps=40 に変更（インメモリ編集）
      act(() => {
        useGenerationStore.getState().setParamValues({ Sampler_Steps: '40' })
        useGenerationStore.setState((prev) => ({
          sets: prev.sets.map((s) => (s.id === 101 ? { ...s, paramValues: { Sampler_Steps: '40' } } : s)),
        }))
      })

      // 3. サーバーから DB 値（Steps=20）を持つプリセットデータが再同期された際、インメモリのセットが Steps=40 を維持することを検証
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
      })

      await waitFor(() => {
        const currentSets = useGenerationStore.getState().sets
        expect(currentSets[0].paramValues.Sampler_Steps).not.toBe('20')
        expect(currentSets[0].paramValues.Sampler_Steps).toBe('40')
      })
    })
  })
})

