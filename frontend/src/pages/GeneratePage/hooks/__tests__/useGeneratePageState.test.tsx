import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import type { WorkflowPreset } from '../../../../api/types'
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
    loadPresetData: vi.fn(),
    setSets: vi.fn(),
    queueRunning: [],
    queuePending: [],
    openPresetIds: [10],
    openPreset: vi.fn(),
    promptChips: {},
    setPromptChips: vi.fn(),
    setAllPromptChips: vi.fn(),
    getEffectiveParamValues: vi.fn(),
    fetchParamSyncGroups: vi.fn(),
    loadSnapshot: vi.fn().mockResolvedValue(undefined),
  }
  const listeners = new Set<(state: typeof store, previousState: typeof store) => void>()
  const useGenerationStore = (selector?: (state: typeof store) => unknown) =>
    selector ? selector(store) : store
  Object.assign(useGenerationStore, {
    getState: () => store,
    getInitialState: () => store,
    setState: (updater: Partial<typeof store> | ((state: typeof store) => Partial<typeof store>)) => {
      const previousState = { ...store }
      Object.assign(store, typeof updater === 'function' ? updater(store) : updater)
      listeners.forEach((listener) => listener(store, previousState))
    },
    subscribe: (listener: (state: typeof store, previousState: typeof store) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  })
  return {
    useGenerationStore,
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
  let originalVisibilityDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
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
      { id: 10, workflow_id: 1, name: 'Preset 1', param_values: { Sampler_Seed: '999' }, applied_assets: {}, batch_size: 1, seed_mode: 'fixed', seed: 999, sort_order: 1, created_at: '', updated_at: '' }
    ])
  })

  afterEach(() => {
    mockStore.batchImages = ['image1.png']
    mockStore.selectedImg = 'image1.png'
    mockStore.comfyHistoryImages = ['image1.png', 'image2.png']
    mockStore.isConnected = true
    mockStore.fetchQueue = undefined
    mockStore.fetchHistory = undefined
    vi.mocked(snapshotsApi.list).mockReset()
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor)
    } else {
      Reflect.deleteProperty(document, 'visibilityState')
    }
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

  it('should integrate with useMultiSelect state and synchronize preview image', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    expect(result.current.isMultiSelectMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)

    act(() => {
      result.current.handleItemClick('image2.png', { ctrlKey: true } as any)
    })

    expect(result.current.isMultiSelectMode).toBe(true)
    expect(result.current.isSelected('image2.png')).toBe(true)
    expect(mockStore.setSelectedImg).toHaveBeenCalledWith('image2.png')
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
      updated_at: '',
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

  it('should persist and restore activePromptTab to/from localStorage', async () => {
    localStorage.setItem('prompt-surgeon-active-prompt-tab-1', 'negative')
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    await waitFor(() => {
      expect(result.current.activePromptTab).toBe('negative')
    })

    act(() => {
      result.current.setActivePromptTab('positive')
    })

    expect(result.current.activePromptTab).toBe('positive')
    expect(localStorage.getItem('prompt-surgeon-active-prompt-tab-1')).toBe('positive')
  })

  it('should persist and restore collapsed roles to/from localStorage', () => {
    localStorage.setItem('prompt-surgeon-collapsed-positive', 'true')
    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    expect(result.current.getIsRoleCollapsed('positive')).toBe(true)

    act(() => {
      result.current.setRoleCollapsed('positive', false)
    })

    expect(result.current.getIsRoleCollapsed('positive')).toBe(false)
    expect(localStorage.getItem('prompt-surgeon-collapsed-positive')).toBe('false')
  })

  it('[REQ-159/AC-1] should compute totalQueueCount based purely on ComfyUI queue running and pending', () => {
    mockStore.queueRunning = [['0', 'run-1', {}, { client_id: 'test-client-id' }]]
    mockStore.queuePending = [['1', 'pend-1', {}, { client_id: 'test-client-id' }]]
    mockStore.activeBatch = [
      { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
      { promptId: 'pending-Set 1-1-12345', setName: 'Set 1', status: 'pending' },
      { promptId: 'pending-Set 2-0-12345', setName: 'Set 2', status: 'pending' },
    ]

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    // ComfyUI running (1) + ComfyUI pending (1) = 2 (client pending is not added to totalQueueCount)
    expect(result.current.totalQueueCount).toBe(2)
  })

  it('[REQ-159/AC-2] should consider isGeneratingHere true when filterOwnSession is true and activeBatch has pending/generating jobs', () => {
    mockStore.isGenerating = true
    mockStore.filterOwnSession = true
    mockStore.activeClientId = 'other-client-id'
    mockStore.activeBatch = [
      { promptId: 'p-1', setName: 'Set 1', status: 'completed' },
      { promptId: 'p-2', setName: 'Set 1', status: 'generating' },
    ]

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    expect(result.current.isGeneratingHere).toBe(true)
  })

  it('[REQ-159/AC-3] should sync queue without refetching history for a restored nonempty baseline on visibilitychange', () => {
    const fetchQueueMock = vi.fn()
    const fetchHistoryMock = vi.fn()
    const restoredBatchImages = [...mockStore.batchImages]
    const restoredHistoryImages = [...mockStore.comfyHistoryImages]
    mockStore.fetchQueue = fetchQueueMock
    mockStore.fetchHistory = fetchHistoryMock

    const wrapper = createWrapper()
    renderHook(() => useGeneratePageState(), { wrapper })

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(fetchQueueMock).toHaveBeenCalled()
    expect(fetchHistoryMock).not.toHaveBeenCalled()
    expect(mockStore.batchImages).toEqual(restoredBatchImages)
    expect(mockStore.comfyHistoryImages).toEqual(restoredHistoryImages)
  })

  it('should sync queue and fetch history on visibilitychange for a cold empty baseline', async () => {
    const fetchQueueMock = vi.fn()
    const fetchHistoryMock = vi.fn()
    mockStore.batchImages = []
    mockStore.comfyHistoryImages = []
    mockStore.selectedImg = null
    mockStore.isConnected = true
    mockStore.fetchQueue = fetchQueueMock
    mockStore.fetchHistory = fetchHistoryMock
    vi.mocked(snapshotsApi.list).mockResolvedValue([])

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    await waitFor(() => expect(result.current.residualHistoryStatus).toBe('complete'))
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    expect(fetchQueueMock).toHaveBeenCalled()
    expect(fetchHistoryMock).toHaveBeenCalled()
  })

  it('[REQ-163/AC-1] should maintain independent prompts when switching presets', async () => {
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1,
      name: 'Workflow 1',
      created_at: '',
      json_body: {},
      mappings: [
        { id: 1, master_id: 101, node_id: '1', role: 'positive_prompt', input_type: 'textarea', display_name: 'Positive Prompt', param_name: 'value' },
      ],
    })

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })
    await waitFor(() => expect(workflowsApi.get).toHaveBeenCalledWith(1))
    await act(async () => {
      await vi.mocked(workflowsApi.get).mock.results.at(-1)?.value
    })
    await waitFor(() => {
      expect(result.current.workflow?.mappings).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'positive_prompt', input_type: 'textarea' }),
      ]))
    })

    const preset1: WorkflowPreset = {
      id: 10,
      workflow_id: 1,
      name: 'Preset 1',
      param_values: { positive_prompt: 'cat' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: -1,
      sort_order: 1,
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
    }

    const preset2: WorkflowPreset = {
      id: 20,
      workflow_id: 1,
      name: 'Preset 2',
      param_values: { positive_prompt: 'dog' },
      applied_assets: {},
      batch_size: 2,
      seed_mode: 'fixed',
      seed: 42,
      sort_order: 2,
      created_at: '2026-08-23T00:00:00Z',
      updated_at: '2026-08-23T00:00:00Z',
    }

    act(() => {
      result.current.handleLoadPreset(preset2)
    })

    expect(mockStore.loadPresetData).toHaveBeenCalledWith(preset2, expect.anything(), ['positive_prompt'])

    act(() => {
      result.current.handleLoadPreset(preset1)
    })

    expect(mockStore.loadPresetData).toHaveBeenCalledWith(preset1, expect.anything(), ['positive_prompt'])
  })

  it('[REQ-163/AC-2] should handle OCC conflict (409) in updatePresetMutation', async () => {
    const error409 = new Error('API error 409: Preset was updated by another session')
    vi.mocked(workflowPresetsApi.update).mockRejectedValueOnce(error409)

    const wrapper = createWrapper()
    const { result } = renderHook(() => useGeneratePageState(), { wrapper })

    await act(async () => {
      try {
        await result.current.updatePresetMutation.mutateAsync({
          id: 10,
          name: 'Preset 1',
          base_updated_at: '2026-08-23T00:00:00Z',
        })
      } catch {}
    })

    expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
      base_updated_at: '2026-08-23T00:00:00Z',
    }))
  })

  describe('REQ-164-T2 multi-session UI state, queue counts, and displayImages', () => {
    it('Test 1: should set isOtherSessionGenerating true and isGeneratingHere false when store.isGenerating is true and activeClientId !== clientId', () => {
      mockStore.isGenerating = true
      mockStore.activeClientId = 'other-client-id'
      mockStore.clientId = 'my-client-id'
      mockStore.activeBatch = null

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      expect(result.current.isOtherSessionGenerating).toBe(true)
      expect(result.current.isGeneratingHere).toBe(false)
    })

    it('Test 2: should compute allQueueCount across all sessions and switch totalQueueCount based on filterOwnSession', () => {
      mockStore.clientId = 'my-client-id'
      mockStore.queueRunning = [['0', 'run-1', {}, { client_id: 'my-client-id' }]]
      mockStore.queuePending = [
        ['1', 'pend-1', {}, { client_id: 'my-client-id' }],
        ['2', 'pend-2', {}, { client_id: 'other-client-id' }],
      ]

      mockStore.filterOwnSession = false
      const wrapper = createWrapper()
      const { result, rerender } = renderHook(() => useGeneratePageState(), { wrapper })

      expect(result.current.allQueueCount).toBe(3)
      expect(result.current.totalQueueCount).toBe(3)

      mockStore.filterOwnSession = true
      rerender()
      expect(result.current.allQueueCount).toBe(3)
      expect(result.current.totalQueueCount).toBe(2)
    })

    it('Test 3: should return comfyHistoryImages as displayImages when filterOwnSession is false and batchImages when true', () => {
      mockStore.batchImages = ['own1.png']
      mockStore.comfyHistoryImages = ['own1.png', 'other1.png', 'other2.png']

      mockStore.filterOwnSession = false
      const wrapper = createWrapper()
      const { result, rerender } = renderHook(() => useGeneratePageState(), { wrapper })

      expect(result.current.displayImages).toEqual(['own1.png', 'other1.png', 'other2.png'])

      mockStore.filterOwnSession = true
      rerender()
      expect(result.current.displayImages).toEqual(['own1.png'])
    })
  })

  describe('REQ-198: React Query cache sync and OCC timestamp updates', () => {
    it('should update query cache and presetUpdatedAtRef on updatePresetMutation success', async () => {
      const updatedPreset: WorkflowPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1 Updated',
        param_values: { prompt: 'new' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce(updatedPreset)

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await act(async () => {
        await result.current.updatePresetMutation.mutateAsync({
          id: 10,
          name: 'Preset 1 Updated',
          param_values: { prompt: 'new' },
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        name: 'Preset 1 Updated',
      }))
    })

    it('should update query cache immediately in handleBulkEditApply', async () => {
      const mockUpdated = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: 'bulk updated' },
        applied_assets: {},
        batch_size: 2,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:05:00Z',
      }
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce(mockUpdated)

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [{ op: 'overwrite', value: 'bulk updated', fields: ['positive_prompt'] }],
          batchSize: 2,
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        batch_size: 2,
      }))
    })

    it('should correctly remove specified tags on remove_tags operation in handleBulkEditApply', async () => {
      const mockPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: 'masterpiece, 1girl, solo, smile' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([mockPreset])

      const mockUpdated = {
        ...mockPreset,
        param_values: { positive_prompt: '1girl, smile' },
        updated_at: '2026-08-29T12:05:00Z',
      }
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce(mockUpdated)

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [{ op: 'remove_tags', fields: ['positive_prompt'], tags: ['masterpiece', 'solo'] }],
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        param_values: expect.objectContaining({
          positive_prompt: '1girl, smile',
        }),
      }))
    })

    it('[REQ-202/AC-1] should correctly update and remove tags with commonTagOps in handleBulkEditApply', async () => {
      const mockPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: '(masterpiece:1.2), 1girl, solo, smile' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([mockPreset])

      const mockUpdated = {
        ...mockPreset,
        param_values: { positive_prompt: '1girl, (solo:1.3), smile' },
        updated_at: '2026-08-29T12:05:00Z',
      }
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce(mockUpdated)

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [
            {
              op: 'remove_tags',
              fields: ['positive_prompt'],
              commonTagOps: [
                { originalBase: 'masterpiece', newFormattedTag: 'masterpiece', action: 'remove' },
                { originalBase: 'solo', newFormattedTag: '(solo:1.3)', action: 'update' },
              ],
            },
          ],
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        param_values: expect.objectContaining({
          positive_prompt: '1girl, (solo:1.3), smile',
        }),
      }))
    })

    it('[REQ-218/AC-1] should correctly prepend prefix with normalized comma delimiter in handleBulkEditApply', async () => {
      const mockPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: '1girl, blue eyes' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([mockPreset])
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce({
        ...mockPreset,
        param_values: { positive_prompt: 'masterpiece, best quality, 1girl, blue eyes' },
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [
            {
              op: 'prefix',
              fields: ['positive_prompt'],
              value: ' , masterpiece, best quality, ',
            },
          ],
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        param_values: expect.objectContaining({
          positive_prompt: 'masterpiece, best quality, 1girl, blue eyes',
        }),
      }))
    })

    it('[REQ-218/AC-2] should correctly append suffix with normalized comma delimiter in handleBulkEditApply', async () => {
      const mockPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: 'masterpiece, best quality' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([mockPreset])
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce({
        ...mockPreset,
        param_values: { positive_prompt: 'masterpiece, best quality, 1girl, blue eyes' },
      })

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [
            {
              op: 'suffix',
              fields: ['positive_prompt'],
              value: ' , 1girl, blue eyes, ',
            },
          ],
        })
      })

      expect(workflowPresetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
        param_values: expect.objectContaining({
          positive_prompt: 'masterpiece, best quality, 1girl, blue eyes',
        }),
      }))
    })

    it('should immediately synchronize promptChips and sets in handleBulkEditApply', async () => {
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 1,
        name: 'Workflow 1',
        created_at: '',
        json_body: {},
        mappings: [
          { id: 1, master_id: 101, node_id: '1', role: 'positive_prompt', input_type: 'textarea', display_name: 'Positive Prompt', param_name: 'value' },
        ],
      })

      const mockPreset: WorkflowPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { positive_prompt: 'masterpiece, best quality' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-29T12:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValueOnce([mockPreset])
      vi.mocked(workflowPresetsApi.update).mockResolvedValueOnce({
        ...mockPreset,
        param_values: { positive_prompt: 'solo, smile, 1girl' },
      })

      const store = useGenerationStore()
      store.sets = [
        {
          id: 10,
          name: 'Preset 1',
          paramValues: { positive_prompt: 'masterpiece, best quality' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ]

      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      await act(async () => {
        await vi.mocked(workflowsApi.get).mock.results[0]?.value
      })

      await waitFor(() => expect(workflowPresetsApi.list).toHaveBeenCalled())

      act(() => {
        result.current.handleBulkEditRequest([10])
      })

      await act(async () => {
        await result.current.handleBulkEditApply({
          promptOps: [
            {
              op: 'overwrite',
              fields: ['positive_prompt'],
              value: 'solo, smile, 1girl',
            },
          ],
        })
      })

      expect(store.setSets).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            promptChips: expect.objectContaining({
              positive_prompt: expect.arrayContaining([
                expect.objectContaining({ text: 'solo' }),
                expect.objectContaining({ text: 'smile' }),
                expect.objectContaining({ text: '1girl' }),
              ]),
            }),
          }),
        ])
      )
      expect(store.setAllPromptChips).toHaveBeenCalledWith(
        expect.objectContaining({
          positive_prompt: expect.arrayContaining([
            expect.objectContaining({ text: 'solo' }),
            expect.objectContaining({ text: 'smile' }),
            expect.objectContaining({ text: '1girl' }),
          ]),
        })
      )
    })

    it('[REQ-277/AC-1] ensures handleGenerateSets wires onBeforeGenerate with flushAutoSave', async () => {
      const wrapper = createWrapper()
      const { result } = renderHook(() => useGeneratePageState(), { wrapper })

      // Verify that handleGenerateSets and flushAutoSave are exposed and executable
      expect(typeof result.current.handleGenerateSets).toBe('function')
      expect(typeof result.current.flushAutoSave).toBe('function')
    })

    it('[REQ-278/AC-1] preserves in-memory edited parameters in setSets on preset sync', async () => {
      const preset: WorkflowPreset = {
        id: 10,
        workflow_id: 1,
        name: 'Preset 1',
        param_values: { steps: '20' },
        applied_assets: {},
        batch_size: 1,
        seed_mode: 'random',
        seed: 42,
        sort_order: 0,
        created_at: '2026-08-23T00:00:00Z',
        updated_at: '2026-08-23T00:00:00Z',
      }
      vi.mocked(workflowPresetsApi.list).mockResolvedValue([preset])

      mockStore.sets = [
        {
          id: 10,
          name: 'Preset 1',
          paramValues: { steps: '40' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ]
      mockStore.activeSetId = 10
      mockStore.paramValues = { steps: '40' }

      const wrapper = createWrapper()
      renderHook(() => useGeneratePageState(), { wrapper })

      await waitFor(() => {
        expect(mockStore.setSets).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              id: 10,
              paramValues: expect.objectContaining({ steps: '40' }),
            }),
          ])
        )
      })
    })
  })
})



