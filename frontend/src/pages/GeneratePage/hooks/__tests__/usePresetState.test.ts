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
})
