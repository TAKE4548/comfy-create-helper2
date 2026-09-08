import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePresetState } from '../usePresetState'
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
})
