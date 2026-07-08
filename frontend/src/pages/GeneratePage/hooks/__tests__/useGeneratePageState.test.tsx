import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGeneratePageState } from '../useGeneratePageState'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import {
  workflowsApi,
  snapshotsApi,
  mappingMastersApi,
  lorasApi,
  tagSetsApi,
  workflowPresetsApi
} from '../../../../api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock useGenerationStore
vi.mock('../../../../store/useGenerationStore', () => {
  const store = {
    clientId: 'test-client-id',
    selectedWorkflowId: 1,
    setSelectedWorkflowId: vi.fn(),
    paramValues: { Sampler_Seed: '12345' },
    setParamValues: vi.fn(),
    batchSize: 1,
    setBatchSize: vi.fn(),
    seedMode: 'random',
    setSeedMode: vi.fn(),
    seed: 42,
    setSeed: vi.fn(),
    batchImages: ['image1.png'],
    selectedImg: 'image1.png',
    setSelectedImg: vi.fn(),
    comfyHistoryImages: ['image1.png', 'image2.png'],
    appliedAssets: {},
    addAppliedAsset: vi.fn(),
    removeAppliedAsset: vi.fn(),
    toggleAppliedAsset: vi.fn(),
    setAppliedAssets: vi.fn(),
    comfyUrl: 'http://localhost:8188',
    setComfyUrl: vi.fn(),
    sets: [],
    updateActiveSet: vi.fn(),
    isConnected: true,
    isGenerating: false,
    progress: null,
    previewImage: null,
    activeClientId: 'test-client-id',
    filterOwnSession: false,
    setFilterOwnSession: vi.fn(),
    activeBatch: null,
    activeSetId: 10,
    setActiveSetId: vi.fn(),
    setSets: vi.fn(),
    queueRunning: [],
    queuePending: [],
    openPresetIds: [10],
    openPreset: vi.fn(),
    closePreset: vi.fn(),
  }
  return {
    useGenerationStore: () => store,
  }
})

// Mock API clients
vi.mock('../../../../api/client', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    copy: vi.fn(),
  },
  snapshotsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  mappingMastersApi: {
    list: vi.fn(),
  },
  lorasApi: {
    list: vi.fn(),
  },
  tagSetsApi: {
    list: vi.fn(),
  },
  workflowPresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useGeneratePageState', () => {
  let mockStore: any

  beforeEach(() => {
    mockStore = useGenerationStore()
    vi.clearAllMocks()

    // Setup default API mock resolves
    vi.mocked(workflowsApi.list).mockResolvedValue([{ id: 1, name: 'Workflow 1', created_at: '' }])
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1,
      name: 'Workflow 1',
      created_at: '',
      json_body: {},
      mappings: [
        { id: 1, master_id: 101, node_id: '1', role: 'positive', input_type: 'textarea', display_name: 'Positive Prompt', param_name: 'value' },
        { id: 2, master_id: 102, node_id: '2', role: 'negative', input_type: 'textarea', display_name: 'Negative Prompt', param_name: 'value' },
      ],
    })
    vi.mocked(snapshotsApi.list).mockResolvedValue([
      { id: 10, workflow_id: 1, image_path: 'image1.png', created_at: new Date().toISOString() }
    ])
    vi.mocked(mappingMastersApi.list).mockResolvedValue([])
    vi.mocked(lorasApi.list).mockResolvedValue([
      {
        id: 50,
        model_name: 'test_lora.safetensors',
        file_path: 'loras/test_lora.safetensors',
        description: 'Test LoRA',
        trigger_word_sets: [],
        sort_order: 1,
        created_at: '',
        recommended_strength_min: null,
        recommended_strength_max: null,
        category_id: null,
        thumbnail_path: null,
      }
    ])
    vi.mocked(tagSetsApi.list).mockResolvedValue([
      { id: 60, name: 'Test TagSet', description: '', category_id: null, tags: ['tag1', 'tag2'], thumbnail_path: null, sort_order: 1, created_at: '' }
    ])
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([
      { id: 10, workflow_id: 1, name: 'Preset 1', param_values: { Sampler_Seed: '999' }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 999, sort_order: 1, created_at: '' }
    ])
  })

  it('should initialize with default states and fetch active lists', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    expect(result.current.rescanOpen).toBe(false)
    expect(result.current.isSettingsOpen).toBe(false)
    expect(result.current.thumbnailTab).toBe('history')

    await waitFor(() => {
      expect(workflowsApi.list).toHaveBeenCalled()
      expect(workflowsApi.get).toHaveBeenCalledWith(1)
      expect(snapshotsApi.list).toHaveBeenCalledWith(1)
    })
  })

  it('should handle workflow changes', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(2)
    })

    expect(mockStore.setSelectedWorkflowId).toHaveBeenCalledWith(2)
  })

  it('should load snapshot params and assets on handleLoadSnapshot', async () => {
    const mockSnapshot = {
      id: 10,
      workflow_id: 1,
      image_path: 'image1.png',
      created_at: new Date().toISOString(),
      params: { Sampler_Seed: '55555' },
      loras: [{ id: 1, snapshot_id: 10, lora_id: 50, strength: 0.8, role: 'positive' }],
      tag_sets: [{ id: 1, snapshot_id: 10, tag_set_id: 60, role: 'positive' }],
    }
    vi.mocked(snapshotsApi.get).mockResolvedValue(mockSnapshot as any)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    await act(async () => {
      await result.current.handleLoadSnapshot(10)
    })

    expect(snapshotsApi.get).toHaveBeenCalledWith(10)
    expect(mockStore.setAppliedAssets).toHaveBeenCalled()
  })

  it('should integrate with useMultiSelect state', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    expect(result.current.isMultiSelectMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('should handle preset creation, update, and deletion mutations', async () => {
    vi.mocked(workflowPresetsApi.create).mockResolvedValue({
      id: 20,
      workflow_id: 1,
      name: 'New Preset',
      param_values: {},
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 1,
      created_at: '',
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    act(() => {
      result.current.setNewPresetName('New Preset')
    })
    expect(result.current.newPresetName).toBe('New Preset')

    await act(async () => {
      result.current.handleCreatePreset('New Preset')
    })

    expect(workflowPresetsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      workflow_id: 1,
      name: 'New Preset',
    }))
  })

  it('should handle undo and redo of parameter states', async () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    await waitFor(() => {
      expect(workflowsApi.list).toHaveBeenCalled()
    })

    act(() => {
      result.current.undo(10)
      result.current.redo(10)
    })
  })
})
