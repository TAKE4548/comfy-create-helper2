import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePresetStoreSync, type UsePresetStoreSyncProps } from '../usePresetStoreSync'
import type { Workflow, WorkflowPreset } from '../../../../api/types'
import { useGenerationStore } from '../../../../store/useGenerationStore'

describe('usePresetStoreSync', () => {
  const mockWorkflow: Workflow = {
    id: 10,
    name: 'Test Workflow',
    description: '',
    author: '',
    version: '1.0',
    mappings: [],
    parameters: [],
  }

  const mockPresets: WorkflowPreset[] = [
    {
      id: 1,
      workflow_id: 10,
      name: 'Preset 1',
      param_values: { prompt: 'cat' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 123,
      is_default: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 2,
      workflow_id: 10,
      name: 'Preset 2',
      param_values: { prompt: 'dog' },
      applied_assets: {},
      batch_size: 2,
      seed_mode: 'fixed',
      seed: 456,
      is_default: false,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ]

  let flushAutoSaveMock: ReturnType<typeof vi.fn>
  let setConflictDataMock: ReturnType<typeof vi.fn>
  let handleLoadPresetMock: ReturnType<typeof vi.fn>
  let handleCreatePresetMock: ReturnType<typeof vi.fn>
  let setActiveSetIdMock: ReturnType<typeof vi.fn>
  let setSetsMock: ReturnType<typeof vi.fn>
  let loadPresetDataMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    flushAutoSaveMock = vi.fn()
    setConflictDataMock = vi.fn()
    handleLoadPresetMock = vi.fn()
    handleCreatePresetMock = vi.fn()
    setActiveSetIdMock = vi.fn()
    setSetsMock = vi.fn()
    loadPresetDataMock = vi.fn()

    useGenerationStore.getState = vi.fn().mockReturnValue({
      activeSetId: 1,
      openPresetIds: [1, 2],
      sets: [
        {
          id: 1,
          name: 'Preset 1',
          paramValues: { prompt: 'cat' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 123,
        },
        {
          id: 2,
          name: 'Preset 2',
          paramValues: { prompt: 'dog' },
          appliedAssets: {},
          batchSize: 2,
          seedMode: 'fixed',
          seed: 456,
        },
      ],
      paramValues: { prompt: 'cat' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 123,
      setActiveSetId: setActiveSetIdMock,
      setSets: setSetsMock,
      loadPresetData: loadPresetDataMock,
      openPreset: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls flushAutoSave when switching active tab to a different preset', () => {
    const presetsRef = { current: mockPresets }
    const isInitialSyncRef = { current: true }
    const prevWorkflowIdRef = { current: 10 }
    const lastSavedStateRef = {
      current: {
        1: {
          paramValues: { prompt: 'cat' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 123,
        },
        2: {
          paramValues: { prompt: 'dog' },
          appliedAssets: {},
          batchSize: 2,
          seedMode: 'fixed' as const,
          seed: 456,
        },
      },
    }
    const presetUpdatedAtRef = {
      current: {
        1: '2026-09-01T00:00:00Z',
        2: '2026-09-01T00:00:00Z',
      },
    }

    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: mockWorkflow,
      presets: mockPresets,
      presetsRef,
      isInitialSyncRef,
      prevWorkflowIdRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }

    const { result } = renderHook(() => usePresetStoreSync(props))

    act(() => {
      result.current.handleSelectPresetTab(2)
    })

    expect(flushAutoSaveMock).toHaveBeenCalledTimes(1)
    expect(handleLoadPresetMock).toHaveBeenCalledWith(mockPresets[1])
  })

  it('triggers conflict resolution if serverPreset changed and local target set is dirty', () => {
    const presetsRef = { current: mockPresets }
    const isInitialSyncRef = { current: true }
    const prevWorkflowIdRef = { current: 10 }
    // Local set 2 is modified (dirty) relative to lastSaved
    const lastSavedStateRef = {
      current: {
        1: {
          paramValues: { prompt: 'cat' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 123,
        },
        2: {
          paramValues: { prompt: 'old dog' }, // different from store sets[1].paramValues { prompt: 'dog' }
          appliedAssets: {},
          batchSize: 2,
          seedMode: 'fixed' as const,
          seed: 456,
        },
      },
    }
    // Server preset 2 was updated remotely
    const presetUpdatedAtRef = {
      current: {
        1: '2026-09-01T00:00:00Z',
        2: '2026-08-30T00:00:00Z', // older than serverPreset.updated_at
      },
    }

    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: mockWorkflow,
      presets: mockPresets,
      presetsRef,
      isInitialSyncRef,
      prevWorkflowIdRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }

    const { result } = renderHook(() => usePresetStoreSync(props))

    act(() => {
      result.current.handleSelectPresetTab(2)
    })

    expect(flushAutoSaveMock).toHaveBeenCalledTimes(1)
    expect(setConflictDataMock).toHaveBeenCalledWith({
      serverPreset: mockPresets[1],
      localDraft: {
        name: 'Preset 2',
        paramValues: { prompt: 'dog' },
        appliedAssets: {},
        batchSize: 2,
        seedMode: 'fixed',
        seed: 456,
      },
    })
    expect(handleLoadPresetMock).not.toHaveBeenCalled()
  })

  it('calls handleCreatePreset when presets list is empty', () => {
    const presetsRef = { current: [] }
    const isInitialSyncRef = { current: false }
    const prevWorkflowIdRef = { current: null }
    const lastSavedStateRef = { current: {} }
    const presetUpdatedAtRef = { current: {} }

    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: mockWorkflow,
      presets: [],
      presetsRef,
      isInitialSyncRef,
      prevWorkflowIdRef,
      lastSavedStateRef,
      presetUpdatedAtRef,
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
      isCreatePending: false,
    }

    renderHook(() => usePresetStoreSync(props))

    expect(handleCreatePresetMock).toHaveBeenCalledWith('Set 1')
  })

  it('passes only textarea roles when loading a dotted preset on initial sync', () => {
    const workflow: Workflow = {
      ...mockWorkflow,
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'prompt', input_type: 'textarea', display_name: 'Prompt' },
        { id: 2, master_id: 2, node_id: '2', role: 'checkpoint', param_name: 'ckpt_name', input_type: 'select', display_name: 'Checkpoint' },
      ],
    }
    const preset: WorkflowPreset = {
      ...mockPresets[0],
      param_values: {
        positive: '1girl. solo.',
        checkpoint: 'model.safetensors',
      },
    }
    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow,
      presets: [preset],
      presetsRef: { current: [preset] },
      isInitialSyncRef: { current: false },
      prevWorkflowIdRef: { current: 10 },
      lastSavedStateRef: { current: {} },
      presetUpdatedAtRef: { current: {} },
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }

    renderHook(() => usePresetStoreSync(props))

    expect(loadPresetDataMock).toHaveBeenCalledWith(preset, expect.any(Object), ['positive'])
  })

  it('passes an empty prompt role allowlist when workflow is unavailable', () => {
    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: undefined,
      presets: mockPresets,
      presetsRef: { current: mockPresets },
      isInitialSyncRef: { current: false },
      prevWorkflowIdRef: { current: 10 },
      lastSavedStateRef: { current: {} },
      presetUpdatedAtRef: { current: {} },
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }

    renderHook(() => usePresetStoreSync(props))

    expect(loadPresetDataMock).toHaveBeenCalledWith(mockPresets[0], expect.any(Object), [])
  })

  it('rehydrates a clean active preset when textarea mappings arrive after the first sync', () => {
    const state: Record<string, any> = {
      activeSetId: 1,
      openPresetIds: [1, 2],
      sets: [],
      paramValues: { prompt: 'cat' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 123,
      promptRoleAllowlist: [],
      setActiveSetId: setActiveSetIdMock,
      setSets: setSetsMock,
      loadPresetData: loadPresetDataMock,
      openPreset: vi.fn(),
    }
    loadPresetDataMock.mockImplementation((_preset, _defaults, roles) => {
      state.promptRoleAllowlist = roles
    })
    vi.mocked(useGenerationStore.getState).mockReturnValue(state as any)

    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: undefined,
      presets: mockPresets,
      presetsRef: { current: mockPresets },
      isInitialSyncRef: { current: false },
      prevWorkflowIdRef: { current: 10 },
      lastSavedStateRef: { current: {} },
      presetUpdatedAtRef: { current: {} },
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }
    const { rerender } = renderHook(({ workflow }) => usePresetStoreSync({ ...props, workflow }), {
      initialProps: { workflow: undefined as Workflow | undefined },
    })

    expect(loadPresetDataMock).toHaveBeenCalledTimes(1)
    expect(loadPresetDataMock).toHaveBeenLastCalledWith(mockPresets[0], expect.any(Object), [])

    const mappedWorkflow: Workflow = {
      ...mockWorkflow,
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'prompt', input_type: 'textarea', display_name: 'Prompt' },
      ],
    }
    rerender({ workflow: mappedWorkflow })

    expect(loadPresetDataMock).toHaveBeenCalledTimes(2)
    expect(loadPresetDataMock).toHaveBeenLastCalledWith(mockPresets[0], expect.any(Object), ['positive'])
    expect(state.promptRoleAllowlist).toEqual(['positive'])
  })

  it('preserves dirty active preset edits when textarea mappings arrive', () => {
    const state: Record<string, any> = {
      activeSetId: 1,
      openPresetIds: [1, 2],
      sets: [],
      paramValues: { prompt: 'cat' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 123,
      promptRoleAllowlist: [],
      setActiveSetId: setActiveSetIdMock,
      setSets: setSetsMock,
      loadPresetData: loadPresetDataMock,
      openPreset: vi.fn(),
    }
    loadPresetDataMock.mockImplementation((_preset, _defaults, roles) => {
      state.promptRoleAllowlist = roles
    })
    vi.mocked(useGenerationStore.getState).mockReturnValue(state as any)

    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow: undefined,
      presets: mockPresets,
      presetsRef: { current: mockPresets },
      isInitialSyncRef: { current: false },
      prevWorkflowIdRef: { current: 10 },
      lastSavedStateRef: { current: {} },
      presetUpdatedAtRef: { current: {} },
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }
    const { rerender } = renderHook(({ workflow }) => usePresetStoreSync({ ...props, workflow }), {
      initialProps: { workflow: undefined as Workflow | undefined },
    })
    state.paramValues = { prompt: 'locally edited prompt' }

    const mappedWorkflow: Workflow = {
      ...mockWorkflow,
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'prompt', input_type: 'textarea', display_name: 'Prompt' },
      ],
    }
    rerender({ workflow: mappedWorkflow })

    expect(loadPresetDataMock).toHaveBeenCalledTimes(1)
    expect(state.paramValues).toEqual({ prompt: 'locally edited prompt' })
    expect(state.promptRoleAllowlist).toEqual([])
  })

  it('passes textarea roles when a clean active preset is refreshed from the list', () => {
    const workflow: Workflow = {
      ...mockWorkflow,
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'prompt', input_type: 'textarea', display_name: 'Prompt' },
        { id: 2, master_id: 2, node_id: '2', role: 'checkpoint', param_name: 'ckpt_name', input_type: 'select', display_name: 'Checkpoint' },
      ],
    }
    const refreshedPreset: WorkflowPreset = {
      ...mockPresets[0],
      updated_at: '2026-09-02T00:00:00Z',
    }
    const props: UsePresetStoreSyncProps = {
      selectedWorkflowId: 10,
      workflow,
      presets: [refreshedPreset, mockPresets[1]],
      presetsRef: { current: [refreshedPreset, mockPresets[1]] },
      isInitialSyncRef: { current: true },
      prevWorkflowIdRef: { current: 10 },
      lastSavedStateRef: {
        current: {
          1: {
            paramValues: { prompt: 'cat' },
            appliedAssets: {},
            batchSize: 1,
            seedMode: 'random',
            seed: 123,
          },
        },
      },
      presetUpdatedAtRef: { current: { 1: '2026-09-01T00:00:00Z' } },
      setConflictData: setConflictDataMock,
      handleLoadPreset: handleLoadPresetMock,
      handleCreatePreset: handleCreatePresetMock,
      flushAutoSave: flushAutoSaveMock,
    }

    renderHook(() => usePresetStoreSync(props))

    expect(loadPresetDataMock).toHaveBeenCalledWith(refreshedPreset, expect.any(Object), ['positive'])
  })
})
