import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePresetState } from '../usePresetState'
import { workflowPresetsApi } from '../../../../api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WorkflowPreset } from '../../../../api/types'
import React from 'react'

const mockStore = {
  paramValues: { prompt: 'masterpiece' },
  setParamValues: vi.fn(),
  appliedAssets: {},
  setAppliedAssets: vi.fn(),
  batchSize: 1,
  setBatchSize: vi.fn(),
  seedMode: 'random',
  setSeedMode: vi.fn(),
  seed: 42,
  setSeed: vi.fn(),
  activeSetId: 10,
  setActiveSetId: vi.fn(),
  sets: [],
  setSets: vi.fn(),
  updateActiveSet: vi.fn(),
  loadPresetData: vi.fn(),
  openPresetIds: [10],
  openPreset: vi.fn(),
}

vi.mock('../../../../store/useGenerationStore', () => ({
  useGenerationStore: () => mockStore,
}))

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

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )
}

describe('usePresetState', () => {
  const mockPresets: WorkflowPreset[] = [
    {
      id: 10,
      workflow_id: 1,
      name: 'Default Set',
      param_values: { prompt: 'masterpiece' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      order_index: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    vi.mocked(workflowPresetsApi.list).mockResolvedValue(mockPresets)
  })

  it('loads presets and initializes state', async () => {
    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.presets).toEqual(mockPresets)
    })
    expect(result.current.isPresetOpen).toBe(false)
  })

  it('handles createPreset', async () => {
    vi.mocked(workflowPresetsApi.create).mockResolvedValue({
      id: 11,
      workflow_id: 1,
      name: 'New Set',
      param_values: {},
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      order_index: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper: createWrapper() }
    )

    await act(async () => {
      result.current.handleCreatePreset('New Set')
    })

    expect(workflowPresetsApi.create).toHaveBeenCalled()
  })

  it('manages bulk delete requests', () => {
    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper: createWrapper() }
    )

    act(() => {
      result.current.handleBulkDeleteRequest([10, 11])
    })

    expect(result.current.isBulkDeleteConfirmOpen).toBe(true)
    expect(result.current.bulkTargetIds).toEqual([10, 11])
  })

  it('handles handleBulkEditApply with loraStackOps in differential mode', async () => {
    const presetWithLoras: WorkflowPreset = {
      id: 10,
      workflow_id: 1,
      name: 'Set 1',
      param_values: {
        lora_lora_count: '2',
        lora_lora_name_1: 'detail.safetensors',
        lora_lora_wt_1: '0.8',
        lora_model_str_1: '0.8',
        lora_clip_str_1: '0.8',
        lora_lora_name_2: 'remove_me.safetensors',
        lora_lora_wt_2: '1.0',
        lora_model_str_2: '1.0',
        lora_clip_str_2: '1.0',
      },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      order_index: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetWithLoras])
    vi.mocked(workflowPresetsApi.update).mockResolvedValue({
      ...presetWithLoras,
      updated_at: '2026-01-01T00:01:00Z',
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.presets).toHaveLength(1)
    })

    act(() => {
      result.current.handleBulkEditRequest([10])
    })

    await act(async () => {
      await result.current.handleBulkEditApply({
        loraStackOps: [
          {
            role: 'lora',
            mode: 'differential',
            commonOps: [
              { name: 'remove_me.safetensors', action: 'remove' },
              { name: 'detail.safetensors', action: 'update', weight: '0.9', modelStrength: '0.9', clipStrength: '0.9' },
            ],
            addSlots: [
              { name: 'new_lora.safetensors', weight: '0.7', modelStrength: '0.7', clipStrength: '0.7' },
            ],
          },
        ],
      })
    })

    expect(workflowPresetsApi.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        param_values: {
          lora_lora_count: '2',
          lora_lora_name_1: 'detail.safetensors',
          lora_lora_wt_1: '0.9',
          lora_model_str_1: '0.9',
          lora_clip_str_1: '0.9',
          lora_lora_name_2: 'new_lora.safetensors',
          lora_lora_wt_2: '0.7',
          lora_model_str_2: '0.7',
          lora_clip_str_2: '0.7',
        },
      })
    )
  })

  it('handles handleBulkEditApply with loraStackOps in overwrite mode', async () => {
    const presetWithLoras: WorkflowPreset = {
      id: 10,
      workflow_id: 1,
      name: 'Set 1',
      param_values: {
        lora_lora_count: '1',
        lora_lora_name_1: 'old.safetensors',
        lora_lora_wt_1: '1.0',
      },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      order_index: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([presetWithLoras])
    vi.mocked(workflowPresetsApi.update).mockResolvedValue({
      ...presetWithLoras,
      updated_at: '2026-01-01T00:01:00Z',
    })

    const { result } = renderHook(
      () => usePresetState({ selectedWorkflowId: 1, workflow: undefined }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.presets).toHaveLength(1)
    })

    act(() => {
      result.current.handleBulkEditRequest([10])
    })

    await act(async () => {
      await result.current.handleBulkEditApply({
        loraStackOps: [
          {
            role: 'lora',
            mode: 'overwrite',
            slots: [
              { name: 'fresh.safetensors', weight: '0.5', modelStrength: '0.5', clipStrength: '0.5' },
            ],
          },
        ],
      })
    })

    expect(workflowPresetsApi.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        param_values: {
          lora_lora_count: '1',
          lora_lora_name_1: 'fresh.safetensors',
          lora_lora_wt_1: '0.5',
          lora_model_str_1: '0.5',
          lora_clip_str_1: '0.5',
        },
      })
    )
  })
})
