import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePresetState, normalizeTimestamp, isTimestampDifferent, isRecordEqual } from '../usePresetState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { workflowPresetsApi } from '../../../../api/client'
import type { Workflow, WorkflowPreset } from '../../../../api/types'

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

  it('passes only textarea roles when loading a preset so dotted parameter values remain raw', async () => {
    const workflow: Workflow = {
      id: 1,
      name: 'Workflow',
      json_body: {},
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'prompt', param_name: null, input_type: 'textarea', display_name: null },
        { id: 2, master_id: 2, node_id: '2', role: 'checkpoint', param_name: null, input_type: 'combo', display_name: null },
        { id: 3, master_id: 3, node_id: '3', role: 'lora', param_name: null, input_type: 'text', display_name: null },
      ],
      created_at: '2026-09-08T10:00:00Z',
    }
    const preset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Dotted values',
      param_values: {
        prompt: '1girl. solo.',
        checkpoint: 'model.safetensors',
        lora: 'style.safetensors',
      },
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow }),
      { wrapper }
    )

    act(() => {
      useGenerationStore.setState({ isAnimaMode: true })
      result.current.handleLoadPreset(preset)
    })

    const state = useGenerationStore.getState()
    expect(state.paramValues).toMatchObject(preset.param_values)
    expect(state.promptChips.prompt.map((chip) => chip.text)).toEqual(['1girl.', 'solo.'])
    expect(state.promptChips).not.toHaveProperty('checkpoint')
    expect(state.promptChips).not.toHaveProperty('lora')
  })

  it('round-trips the exact prompt saved by updatePreset through prompt chips', async () => {
    const workflow: Workflow = {
      id: 1,
      name: 'Workflow',
      json_body: {},
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'prompt', param_name: null, input_type: 'textarea', display_name: null },
      ],
      created_at: '2026-09-08T10:00:00Z',
    }
    const preset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Mixed separators',
      param_values: { prompt: 'old prompt' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 0,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T10:00:00Z',
    }
    const savedPreset: WorkflowPreset = {
      ...preset,
      param_values: { prompt: 'first. second, third.' },
      updated_at: '2026-09-08T10:01:00Z',
    }
    vi.mocked(workflowPresetsApi.update).mockResolvedValue(savedPreset)
    vi.stubGlobal('confirm', vi.fn(() => true))

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow }),
      { wrapper }
    )

    act(() => {
      useGenerationStore.setState({
        isAnimaMode: true,
        activeSetId: 101,
        paramValues: { prompt: 'first. second, third.' },
      })
    })
    act(() => {
      result.current.handleUpdatePreset(101, 'Mixed separators')
    })

    await waitFor(() => {
      expect(workflowPresetsApi.update).toHaveBeenCalled()
    })
    const updatePayload = vi.mocked(workflowPresetsApi.update).mock.calls[0][1]
    expect(updatePayload.param_values?.prompt).toBe('first. second, third.')

    act(() => {
      result.current.handleLoadPreset({ ...savedPreset, param_values: updatePayload.param_values! })
    })

    const chips = useGenerationStore.getState().promptChips.prompt
    expect(chips.map((chip) => chip.text)).toEqual(['first.', 'second', 'third.'])
    expect(chips.filter((chip) => chip.text.endsWith('.'))).toHaveLength(2)
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

  describe('REQ-280: Autosave serialization, timer isolation, and key-order insensitive equality', () => {
    it('1. isRecordEqual returns true for objects with shuffled key order, preventing false conflict', () => {
      const objA = { prompt: 'cat', steps: '20', cfg: '7.0' }
      const objB = { cfg: '7.0', prompt: 'cat', steps: '20' }

      expect(JSON.stringify(objA)).not.toBe(JSON.stringify(objB))
      expect(isRecordEqual(objA, objB)).toBe(true)
      expect(isRecordEqual(objA, { ...objA, steps: '21' })).toBe(false)
      expect(isRecordEqual(objA, { prompt: 'cat', steps: '20' })).toBe(false)
      expect(isRecordEqual(undefined, undefined)).toBe(true)
      expect(isRecordEqual(objA, undefined)).toBe(false)
    })

    it('2. Serializes in-flight updates so rapid changes do not result in 409 and latest state is saved', async () => {
      let resolveFirstUpdate: ((val: WorkflowPreset) => void) | null = null
      const firstUpdatePromise = new Promise<WorkflowPreset>((resolve) => {
        resolveFirstUpdate = resolve
      })

      const preset1: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Set 1',
        param_values: { prompt: 'initial' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }

      vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1])

      let callCount = 0
      vi.mocked(workflowPresetsApi.update).mockImplementation(async (id, data) => {
        callCount++
        if (callCount === 1) {
          return firstUpdatePromise
        }
        return {
          ...preset1,
          id,
          name: data.name || preset1.name,
          param_values: data.param_values || preset1.param_values,
          updated_at: '2026-09-08T10:00:02Z',
        }
      })

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.presets).toHaveLength(1)
        expect(useGenerationStore.getState().activeSetId).toBe(101)
        // Ensure firstSync has run: loadPresetData overwrites paramValues with preset's param_values
        expect(useGenerationStore.getState().paramValues).toEqual({ prompt: 'initial' })
      })

      // First change -> user changes paramValues in store and calls flushAutoSave
      await act(async () => {
        useGenerationStore.getState().setParamValues({ prompt: 'update 1' })
        result.current.flushAutoSave()
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledTimes(1)
      expect(workflowPresetsApi.update).toHaveBeenLastCalledWith(
        101,
        expect.objectContaining({
          param_values: { prompt: 'update 1' },
          base_updated_at: '2026-09-08T10:00:00Z',
        })
      )

      // Second change while first mutation is still in-flight
      act(() => {
        useGenerationStore.getState().setParamValues({ prompt: 'update 2' })
        result.current.flushAutoSave()
      })

      // Since first mutation is in-flight, update should NOT be called immediately
      expect(workflowPresetsApi.update).toHaveBeenCalledTimes(1)

      // Now first mutation finishes with new updated_at
      await act(async () => {
        resolveFirstUpdate!({
          ...preset1,
          param_values: { prompt: 'update 1' },
          updated_at: '2026-09-08T10:00:01Z',
        })
      })

      // The onSettled should now have fired the second mutation with base_updated_at updated to '2026-09-08T10:00:01Z'
      await waitFor(() => {
        expect(workflowPresetsApi.update).toHaveBeenCalledTimes(2)
      })

      expect(workflowPresetsApi.update).toHaveBeenLastCalledWith(
        101,
        expect.objectContaining({
          param_values: { prompt: 'update 2' },
          base_updated_at: '2026-09-08T10:00:01Z',
        })
      )
    })

    it('3. Auto-save timer is not reset or extended by background preset polling', async () => {
      vi.useFakeTimers()
      try {
        const preset1: WorkflowPreset = {
          id: 101,
          workflow_id: 1,
          name: 'Set 1',
          param_values: { prompt: 'initial' },
          applied_assets: {},
          batch_size: 1,
          seed_mode: 'random',
          seed: 42,
          sort_order: 0,
          created_at: '2026-09-08T10:00:00Z',
          updated_at: '2026-09-08T10:00:00Z',
        }

        vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset1])
        vi.mocked(workflowPresetsApi.update).mockResolvedValue({
          ...preset1,
          param_values: { prompt: 'typing...' },
          updated_at: '2026-09-08T10:00:01Z',
        })

        const { result } = renderHook(
          () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
          { wrapper }
        )

        // Wait for initial load
        await vi.advanceTimersByTimeAsync(10)
        expect(result.current.presets).toBeDefined()

        // User edits state (auto-save timer starts: 1000ms)
        act(() => {
          useGenerationStore.setState({
            paramValues: { prompt: 'typing...' },
          })
        })

        // Advance by 600ms
        await vi.advanceTimersByTimeAsync(600)
        expect(workflowPresetsApi.update).not.toHaveBeenCalled()

        // Background polling triggers query invalidate and refetch
        const polledPreset: WorkflowPreset = {
          ...preset1,
          updated_at: '2026-09-08T10:00:00Z',
        }
        vi.mocked(workflowPresetsApi.list).mockResolvedValue([polledPreset])
        await act(async () => {
          await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
        })

        // Advance remaining 450ms (total 1050ms > 1000ms)
        await vi.advanceTimersByTimeAsync(450)

        // It should have executed auto-save without being cancelled or restarted by polling
        expect(workflowPresetsApi.update).toHaveBeenCalledTimes(1)
        expect(workflowPresetsApi.update).toHaveBeenCalledWith(
          101,
          expect.objectContaining({
            param_values: { prompt: 'typing...' },
          })
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('REQ-281: プリセット同期・状態ライフサイクルの根本是正', () => {
    it('AC-1: protects previous preset A when creating new preset B without contaminating A or firing false auto-save on A', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'A orig' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'B new' },
        sort_order: 1,
        created_at: '2026-09-08T10:01:00Z',
        updated_at: '2026-09-08T10:01:00Z',
      }
      vi.mocked(workflowPresetsApi.create).mockResolvedValue(presetB)
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB])

      await act(async () => {
        result.current.createPresetMutation.mutate({
          name: 'Preset B',
          paramValues: { prompt: 'B new' },
        })
      })

      await waitFor(() => {
        const state = useGenerationStore.getState()
        expect(state.activeSetId).toBe(102)
        expect(state.paramValues.prompt).toBe('B new')
      })

      const finalState = useGenerationStore.getState()
      const setA = finalState.sets.find((s) => s.id === 101)
      const setB = finalState.sets.find((s) => s.id === 102)
      expect(setA?.paramValues.prompt).toBe('A orig')
      expect(setB?.paramValues.prompt).toBe('B new')
      expect(workflowPresetsApi.update).not.toHaveBeenCalled()
    })

    it('AC-2: immediately flushes unsaved edits of preset A when switching to preset B before debounce timer expires', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'A initial' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'B initial' },
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB])
      vi.mocked(workflowPresetsApi.update).mockResolvedValue({
        ...presetA,
        param_values: { prompt: 'A edited' },
        updated_at: '2026-09-08T10:02:00Z',
      })

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      // Edit A in store
      act(() => {
        useGenerationStore.setState({
          paramValues: { prompt: 'A edited' },
        })
      })

      // Immediately switch to Preset B without waiting for debounce
      await act(async () => {
        result.current.handleSelectPresetTab(102)
      })

      // Flush should synchronously trigger update for Preset A
      await waitFor(() => {
        expect(workflowPresetsApi.update).toHaveBeenCalledWith(
          101,
          expect.objectContaining({
            param_values: { prompt: 'A edited' },
          })
        )
      })

      // And activeSetId should now be 102
      expect(useGenerationStore.getState().activeSetId).toBe(102)
    })

    it('AC-3: loads latest server params when switching to clean preset B that was updated remotely', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'A prompt' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'B old' },
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      // Preset B is updated on another device
      const updatedPresetB: WorkflowPreset = {
        ...presetB,
        param_values: { prompt: 'B updated on device 2' },
        updated_at: '2026-09-08T10:05:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, updatedPresetB])
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
      })

      // Switch to Preset B
      act(() => {
        result.current.handleSelectPresetTab(102)
      })

      await waitFor(() => {
        const state = useGenerationStore.getState()
        expect(state.activeSetId).toBe(102)
        expect(state.paramValues.prompt).toBe('B updated on device 2')
      })
    })

    it('AC-4: background polling synchronizes clean presets into mappedSets without dropping them due to in-memory spread', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'A v1' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'B v1' },
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      // Remote updates Preset B while user is on Preset A (both clean)
      const presetBv2: WorkflowPreset = {
        ...presetB,
        param_values: { prompt: 'B v2 by background polling' },
        updated_at: '2026-09-08T10:10:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetBv2])
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
      })

      await waitFor(() => {
        const setB = useGenerationStore.getState().sets.find((s) => s.id === 102)
        expect(setB?.paramValues.prompt).toBe('B v2 by background polling')
      })
    })

    it('AC-5: updatePresetMutation does not overwrite inactive preset with active preset params', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'Active A prompt' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'Inactive B prompt' },
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB])

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      // Update preset B (which is inactive) by specifying only name
      await act(async () => {
        result.current.updatePresetMutation.mutate({
          id: 102,
          name: 'Preset B Renamed',
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(
        102,
        expect.objectContaining({
          name: 'Preset B Renamed',
          param_values: { prompt: 'Inactive B prompt' },
        })
      )
    })

    it('Red Team: rapid tab switching (A -> B -> C) flushes unsaved edits sequentially without race conditions', async () => {
      const presetA: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Preset A',
        param_values: { prompt: 'A init' },
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetB: WorkflowPreset = {
        id: 102,
        workflow_id: 1,
        name: 'Preset B',
        param_values: { prompt: 'B init' },
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const presetC: WorkflowPreset = {
        id: 103,
        workflow_id: 1,
        name: 'Preset C',
        param_values: { prompt: 'C init' },
        sort_order: 2,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetA, presetB, presetC])
      vi.mocked(workflowPresetsApi.update).mockImplementation(async (id, data) => ({
        id,
        workflow_id: 1,
        name: data.name,
        param_values: data.param_values,
        applied_assets: data.applied_assets,
        batch_size: data.batch_size,
        seed_mode: data.seed_mode,
        seed: data.seed,
        sort_order: 0,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:05:00Z',
      }))

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
        { wrapper }
      )
      await waitFor(() => expect(result.current.presets).toBeDefined())

      // 1. Edit A
      act(() => {
        useGenerationStore.setState({ paramValues: { prompt: 'A edited rapid' } })
      })

      // 2. Switch to B
      await act(async () => {
        result.current.handleSelectPresetTab(102)
      })
      await waitFor(() => {
        expect(workflowPresetsApi.update).toHaveBeenCalledWith(
          101,
          expect.objectContaining({ param_values: { prompt: 'A edited rapid' } })
        )
      })

      // 3. Edit B
      act(() => {
        useGenerationStore.setState({ paramValues: { prompt: 'B edited rapid' } })
      })

      // 4. Switch to C
      await act(async () => {
        result.current.handleSelectPresetTab(103)
      })
      await waitFor(() => {
        expect(workflowPresetsApi.update).toHaveBeenCalledWith(
          102,
          expect.objectContaining({ param_values: { prompt: 'B edited rapid' } })
        )
      })

      expect(useGenerationStore.getState().activeSetId).toBe(103)
    })
  })

  describe('REQ-306: Anima mode preset bulk synchronization', () => {
    it('AC-2: reflects isAnimaMode and protects period-delimited chips during preset bulk update/sync (resultMap)', async () => {
      const preset1: WorkflowPreset = {
        id: 101,
        workflow_id: 1,
        name: 'Set 1',
        param_values: { prompt: '1girl. solo.', checkpoint: 'model.safetensors', lora: 'style.safetensors' },
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
        param_values: { prompt: 'cat. outdoor.', checkpoint: 'model.safetensors', lora: 'style.safetensors' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 43,
        sort_order: 1,
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      }
      const workflow: Workflow = {
        id: 1,
        name: 'Workflow',
        json_body: {},
        mappings: [
          { id: 1, master_id: 1, node_id: '1', role: 'prompt', param_name: null, input_type: 'textarea', display_name: null },
          { id: 2, master_id: 2, node_id: '2', role: 'checkpoint', param_name: null, input_type: 'combo', display_name: null },
          { id: 3, master_id: 3, node_id: '3', role: 'lora', param_name: null, input_type: 'text', display_name: null },
        ],
        created_at: '2026-09-08T10:00:00Z',
      }

      useGenerationStore.setState({
        selectedWorkflowId: 1,
        activeSetId: 101,
        openPresetIds: [101, 102],
        isAnimaMode: true,
        sets: [
          {
            id: 101,
            name: 'Set 1',
            paramValues: { prompt: '1girl. solo.', checkpoint: 'model.safetensors', lora: 'style.safetensors' },
            appliedAssets: {},
            batchSize: 1,
            seedMode: 'random',
            seed: 42,
            checked: true,
            promptChips: {
              prompt: [
                { id: 'c1', text: '1girl.', enabled: true },
                { id: 'c2', text: 'solo.', enabled: true },
              ],
            },
          },
          {
            id: 102,
            name: 'Set 2',
            paramValues: { prompt: 'cat. outdoor.', checkpoint: 'model.safetensors', lora: 'style.safetensors' },
            appliedAssets: {},
            batchSize: 1,
            seedMode: 'random',
            seed: 43,
            checked: true,
            promptChips: {
              prompt: [
                { id: 'c3', text: 'cat.', enabled: true },
                { id: 'c4', text: 'outdoor.', enabled: true },
              ],
            },
          },
        ],
      })

      let currentPresets = [preset1, preset2]
      vi.mocked(workflowPresetsApi.list).mockImplementation(async () => currentPresets)
      vi.mocked(workflowPresetsApi.update).mockImplementation(async (id, patch) => {
        const base = currentPresets.find((p) => p.id === id) || (id === 101 ? preset1 : preset2)
        const updated = {
          ...base,
          ...patch,
          param_values: patch.param_values ?? base.param_values,
          updated_at: '2026-09-08T10:01:00Z',
        }
        currentPresets = currentPresets.map((p) => (p.id === id ? updated : p))
        return updated
      })

      const { result } = renderHook(
        () => usePresetState({ selectedWorkflowId: 1, workflow }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.presets).toHaveLength(2)
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          targetPresetIds: [101, 102],
          promptOps: [
            {
              op: 'overwrite',
              value: '1girl. red hair. masterpiece.',
              fields: ['prompt'],
            },
          ],
        })
      })

      // Check that resultMap sync reflected isAnimaMode: true across sets
      const state = useGenerationStore.getState()
      const updatedSet1 = state.sets.find((s) => s.id === 101)
      const updatedSet2 = state.sets.find((s) => s.id === 102)

      expect(updatedSet1?.promptChips?.prompt).toHaveLength(3)
      expect(updatedSet1?.promptChips?.prompt.map((c: any) => c.text)).toEqual([
        '1girl.',
        'red hair.',
        'masterpiece.',
      ])

      expect(updatedSet2?.promptChips?.prompt).toHaveLength(3)
      expect(updatedSet2?.promptChips?.prompt.map((c: any) => c.text)).toEqual([
        '1girl.',
        'red hair.',
        'masterpiece.',
      ])
      expect(updatedSet1?.paramValues).toMatchObject({ checkpoint: 'model.safetensors', lora: 'style.safetensors' })
      expect(updatedSet2?.paramValues).toMatchObject({ checkpoint: 'model.safetensors', lora: 'style.safetensors' })
      expect(updatedSet1?.promptChips).not.toHaveProperty('checkpoint')
      expect(updatedSet1?.promptChips).not.toHaveProperty('lora')

      // Active preset (101) promptChips should also be synced with 3 distinct chips
      expect(state.promptChips.prompt).toHaveLength(3)
      expect(state.promptChips.prompt.map((c: any) => c.text)).toEqual([
        '1girl.',
        'red hair.',
        'masterpiece.',
      ])
      expect(state.paramValues).toMatchObject({ checkpoint: 'model.safetensors', lora: 'style.safetensors' })
      expect(state.promptChips).not.toHaveProperty('checkpoint')
      expect(state.promptChips).not.toHaveProperty('lora')
    })
  })
})

