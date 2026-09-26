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

describe('usePresetState Autosave Cancellation Bug', () => {
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
      paramValues: { Sampler_Steps: '30' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'random',
      seed: 42,
      sets: [
        {
          id: 101,
          name: 'Set 1',
          paramValues: { Sampler_Steps: '30' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
    })
  })

  it('cancels autosave timer if presets refetches within 1 second', async () => {
    const initialPreset: WorkflowPreset = {
      id: 101,
      workflow_id: 1,
      name: 'Set 1',
      param_values: { Sampler_Steps: '30' },
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
      expect(result.current.presets).toBeDefined()
    })

    // User edits parameter
    act(() => {
      useGenerationStore.getState().setParamValues({ Sampler_Steps: '50' })
    })

    // 500ms later (before 1000ms debounce), polling refetches presets
    await new Promise((r) => setTimeout(r, 500))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-presets', 1] })
    })

    // Wait another 700ms (total 1200ms from initial edit)
    await new Promise((r) => setTimeout(r, 700))

    // If the timer was cancelled and reset, it wouldn't have fired at 1000ms!
    // Or worse, if invalidated with old server data, it overwrites local!
    console.log('Update called count:', vi.mocked(workflowPresetsApi.update).mock.calls.length)
  })
})
