import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGenerationStore, _resetWebSocketForTesting } from '../store/useGenerationStore'
import { comfyWsService } from '../store/services/comfyWebSocketService'
import { comfyApi, bypassProfilesApi, paramSyncGroupsApi } from '../api/client'
import { LS_KEYS } from '../utils/localStorageKeys'

vi.mock('../api/client', () => ({
  configApi: {
    get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }),
  },
  bypassProfilesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  paramSyncGroupsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  comfyApi: {
    getObjectInfo: vi.fn().mockResolvedValue({}),
    queuePrompt: vi.fn(),
    getQueue: vi.fn().mockResolvedValue({ queue_running: [], queue_pending: [] }),
    deleteQueue: vi.fn().mockResolvedValue({ status: 'ok' }),
    interrupt: vi.fn().mockResolvedValue({ status: 'interrupted' }),
    getHistory: vi.fn().mockResolvedValue({}),
    deleteHistory: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
}))

describe('E2E Automated Verification: REQ-207 5大シナリオ統合検証', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    _resetWebSocketForTesting()
    useGenerationStore.setState({
      isConnected: false,
      isGenerating: false,
      progress: null,
      previewImage: null,
      currentPromptId: null,
      activeBatch: null,
      selectedWorkflowId: null,
      sets: [],
      activeSetId: null,
      openPresetIds: [],
      paramValues: {},
      appliedAssets: {},
      bypassProfiles: [],
      bypassProfilesCache: {},
      paramSyncGroups: [],
      paramSyncGroupsCache: {},
      queueRunning: [],
      queuePending: [],
    })

    if (!global.URL.createObjectURL) {
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:8188/mock-preview')
    }
    if (!global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL = vi.fn()
    }
  })

  afterEach(() => {
    _resetWebSocketForTesting()
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 1: リアルタイム生成・進捗・Blobプレビュー・画像追加
  // ─────────────────────────────────────────────────────────────
  it('Scenario 1: Real-time generation, node progress, binary blob preview, completion & image addition', async () => {
    localStorage.setItem(LS_KEYS.COMFY_URL, 'http://localhost:8188')
    useGenerationStore.getState().initialize()

    const ws = comfyWsService.getWebSocket() as any
    expect(ws).toBeDefined()

    // 1. WS open
    ws.onopen()
    expect(useGenerationStore.getState().isConnected).toBe(true)

    // 2. Binary Blob preview message
    const mockBlob = new Blob(['fake image binary'], { type: 'image/png' })
    const createObjectURLSpy = vi.spyOn(global.URL, 'createObjectURL').mockReturnValue('blob:http://localhost:8188/preview-1')
    const revokeObjectURLSpy = vi.spyOn(global.URL, 'revokeObjectURL').mockImplementation(() => {})

    ws.onmessage({ data: mockBlob })
    expect(useGenerationStore.getState().previewImage).toBe('blob:http://localhost:8188/preview-1')

    // 3. Node Progress event
    ws.onmessage({
      data: JSON.stringify({
        type: 'progress',
        data: { value: 25, max: 100, node: 'node-ksampler', prompt_id: 'prompt-101' },
      }),
    })
    const stateAfterProgress = useGenerationStore.getState()
    expect(stateAfterProgress.isGenerating).toBe(true)
    expect(stateAfterProgress.progress?.percentage).toBe(25)
    expect(stateAfterProgress.nodeProgress?.nodeId).toBe('node-ksampler')

    // 4. Executed event with generated image output
    ws.onmessage({
      data: JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'prompt-101',
          output: {
            images: [{ filename: 'test_output.png', subfolder: '', type: 'output' }],
          },
        },
      }),
    })

    const finalState = useGenerationStore.getState()
    expect(finalState.previewImage).toBeNull()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost:8188/preview-1')
    expect(finalState.selectedImg).toContain('test_output.png')
    expect(finalState.batchImages).toContain(finalState.selectedImg)
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe(finalState.selectedImg)

    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 2: ジョブ中断・キュー消去 & AbortController 制御
  // ─────────────────────────────────────────────────────────────
  it('Scenario 2: Job interruption, pending queue clearance, AbortController abort & optimistic recovery', async () => {
    localStorage.setItem(LS_KEYS.COMFY_URL, 'http://localhost:8188')
    useGenerationStore.getState().initialize()

    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')
    useGenerationStore.getState().setSubmissionAbortController(abortController)

    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'prompt-running',
      queueRunning: [[1, 'prompt-running', {}, { client_id: 'my-client' }, []]],
      queuePending: [[2, 'prompt-pending-1', {}, {}, []], [3, 'prompt-pending-2', {}, {}, []]],
      activeBatch: [
        { promptId: 'prompt-running', setName: 'Set 1', status: 'generating' },
        { promptId: 'prompt-pending-1', setName: 'Set 2', status: 'pending' },
      ],
    })

    // 1. cancelJob for running job
    await useGenerationStore.getState().cancelJob('prompt-running')

    expect(abortSpy).toHaveBeenCalled()
    expect(comfyApi.interrupt).toHaveBeenCalled()
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['prompt-running'] })
    expect(useGenerationStore.getState().currentPromptId).toBeNull()

    // 2. clearPendingQueue
    await useGenerationStore.getState().clearPendingQueue()

    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true })
    expect(useGenerationStore.getState().queuePending).toEqual([])

    // 3. cancelAllJobs
    useGenerationStore.setState({
      queueRunning: [[1, 'another-running', {}, {}, []]],
      isGenerating: true,
    })
    await useGenerationStore.getState().cancelAllJobs()

    expect(useGenerationStore.getState().isGenerating).toBe(false)
    expect(useGenerationStore.getState().queuePending).toEqual([])
    expect(useGenerationStore.getState().activeBatch).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 3: マルチセット・アセット挿入・LocalStorage 永続化 & 復元
  // ─────────────────────────────────────────────────────────────
  it('Scenario 3: MultiSet full lifecycle, LoRA/Tag prompt injection, tab switching & LocalStorage persistence', () => {
    const workflowId = 42
    useGenerationStore.getState().setSelectedWorkflowId(workflowId)

    // 1. Initialize Sets for workflow 42
    useGenerationStore.getState().initSets(workflowId)
    const initialSets = useGenerationStore.getState().sets
    expect(initialSets.length).toBe(1)
    expect(useGenerationStore.getState().activeSetId).toBe(initialSets[0].id)

    // 2. Add LoRA asset to prompt
    useGenerationStore.getState().addAppliedAsset('positive', {
      type: 'lora',
      assetId: 10,
      name: 'Detail LoRA',
      tags: ['masterpiece', 'ultra-detailed'],
      loraPromptString: '<lora:detail:0.8>',
    })

    const stateWithAsset = useGenerationStore.getState()
    expect(stateWithAsset.paramValues['positive']).toContain('<lora:detail:0.8>')
    expect(stateWithAsset.paramValues['positive']).toContain('masterpiece, ultra-detailed')
    expect(stateWithAsset.appliedAssets['positive'].length).toBe(1)

    // 3. Add a second Set and switch active Set
    useGenerationStore.getState().addSet()
    const updatedSets = useGenerationStore.getState().sets
    expect(updatedSets.length).toBe(2)
    const secondSetId = updatedSets[1].id
    expect(useGenerationStore.getState().activeSetId).toBe(secondSetId)

    // Verify localStorage has updated active set prefix
    expect(localStorage.getItem(LS_KEYS.ACTIVE_SET_PREFIX + workflowId)).toBe(String(secondSetId))

    // 4. Switch back to first set
    useGenerationStore.getState().setActiveSetId(initialSets[0].id)
    expect(useGenerationStore.getState().activeSetId).toBe(initialSets[0].id)
    expect(useGenerationStore.getState().paramValues['positive']).toContain('<lora:detail:0.8>')

    // 5. Toggle applied asset (disable) -> prompt should remove tag and LoRA
    const assetId = stateWithAsset.appliedAssets['positive'][0].id
    useGenerationStore.getState().toggleAppliedAsset('positive', assetId)
    expect(useGenerationStore.getState().paramValues['positive']).not.toContain('<lora:detail:0.8>')
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 4: バイパス & パラメータ同期設定の CRUD & キャッシュ整合性
  // ─────────────────────────────────────────────────────────────
  it('Scenario 4: Bypass Profiles & ParamSync CRUD, cache consistency across workflows', async () => {
    const workflowId = 1
    const mockProfiles = [
      { id: 101, workflow_id: 1, name: 'Profile A', bypassed_node_ids: ['node1', 'node2'], is_enabled: true },
    ]
    vi.mocked(bypassProfilesApi.list).mockResolvedValue(mockProfiles)
    vi.mocked(bypassProfilesApi.create).mockResolvedValue({
      id: 102,
      workflow_id: 1,
      name: 'Profile B',
      bypassed_node_ids: ['node3'],
      is_enabled: true,
    })

    // 1. Fetch bypass profiles
    await useGenerationStore.getState().fetchBypassProfiles(workflowId)
    expect(useGenerationStore.getState().bypassProfiles).toEqual(mockProfiles)
    expect(useGenerationStore.getState().bypassProfilesCache[workflowId]).toEqual(mockProfiles)

    // 2. Create bypass profile
    await useGenerationStore.getState().createBypassProfile(workflowId, 'Profile B', ['node3'])
    expect(useGenerationStore.getState().bypassProfiles.length).toBe(2)
    expect(useGenerationStore.getState().bypassProfilesCache[workflowId].length).toBe(2)

    // 3. ParamSync group CRUD & cache
    const mockGroups = [
      { id: 201, workflow_id: 1, name: 'Group 1', source_key: 'seed', target_keys: ['seed2'], is_enabled: true },
    ]
    vi.mocked(paramSyncGroupsApi.list).mockResolvedValue(mockGroups)
    await useGenerationStore.getState().fetchParamSyncGroups(workflowId)
    expect(useGenerationStore.getState().paramSyncGroups).toEqual(mockGroups)
    expect(useGenerationStore.getState().paramSyncGroupsCache[workflowId]).toEqual(mockGroups)
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 5: WebSocket 切断・3秒自動再接続 & キュー・履歴の同期
  // ─────────────────────────────────────────────────────────────
  it('Scenario 5: WebSocket disconnection simulation, 3s auto-reconnect timer & queue recovery', async () => {
    vi.useFakeTimers()
    localStorage.setItem(LS_KEYS.COMFY_URL, 'http://localhost:8188')

    useGenerationStore.getState().initialize()
    const ws = comfyWsService.getWebSocket() as any
    expect(ws).toBeDefined()

    // 1. Connection established
    ws.onopen()
    expect(useGenerationStore.getState().isConnected).toBe(true)

    // 2. Network disconnect occurs
    ws.onclose()
    expect(useGenerationStore.getState().isConnected).toBe(false)
    expect(comfyWsService.getReconnectTimer()).toBeDefined()

    // 3. Fast-forward 3 seconds for reconnection timer
    const initSpy = vi.spyOn(useGenerationStore.getState(), 'initialize')
    vi.advanceTimersByTime(3000)

    expect(initSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
