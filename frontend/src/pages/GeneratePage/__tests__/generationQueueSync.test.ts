import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGenerationStore, _resetWebSocketForTesting } from '../../../store/useGenerationStore'
import { systemWsService } from '../../../store/services/systemWsService'
import { bypassProfilesApi, paramSyncGroupsApi } from '../../../api/client'
import { generationApi } from '../../../api/domains/generation'
import type { GenerationSnapshot, JobView } from '../../../api/domains/generation'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { useGenerateDisplayState } from '../hooks/useGenerateDisplayState'
import { cleanupAllTestState } from '../../../test/utils'

vi.mock('../../../api/client', () => ({
  configApi: {
    get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }),
  },
  comfyApi: { getHistory: vi.fn().mockResolvedValue({}) },
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
}))

describe('E2E Automated Verification: REQ-207 5大シナリオ統合検証', () => {
  let createdSockets: any[] = []
  let currentSnapshot: GenerationSnapshot
  let queryClient: QueryClient

  beforeEach(() => {
    cleanupAllTestState()
    localStorage.clear()
    vi.restoreAllMocks()
    _resetWebSocketForTesting()
    createdSockets = []
    currentSnapshot = makeSnapshot(0)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    class MockWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      readyState = MockWebSocket.CONNECTING
      onopen: (() => void) | null = null
      onclose: (() => void) | null = null
      onerror: (() => void) | null = null
      onmessage: ((event: { data: string | Blob | ArrayBuffer }) => void) | null = null
      constructor(public url: string) { createdSockets.push(this) }
      close() { this.readyState = MockWebSocket.CLOSED }
      send() {}
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.spyOn(generationApi, 'getState').mockImplementation(async () => currentSnapshot)
    vi.spyOn(generationApi, 'getUpstreamQueue').mockResolvedValue({ running: [], pending: [] })
    useGenerationStore.setState({
      isConnected: false,
      isGenerating: false,
      generationSnapshot: null,
      generationSyncIssue: null,
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

  })

  afterEach(() => {
    cleanupAllTestState()
    vi.useRealTimers()
    vi.restoreAllMocks()
    _resetWebSocketForTesting()
  })

  const makeSnapshot = (revision: number, jobs: JobView[] = []): GenerationSnapshot => ({
    version: 1, epoch: 'req207-epoch', revision, normal_group_id: '00000000-0000-4000-8000-000000000099', jobs,
    batches: jobs.map(item => ({ batch_id: item.batch_id, scope: item.scope, project_id: item.project_id })),
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
  })

  const makeJob = (overrides: Partial<JobView> = {}): JobView => ({
    job_id: '00000000-0000-4000-8000-000000000001',
    request_id: '00000000-0000-4000-8000-000000000002',
    prompt_id: 'prompt-101', session_id: useGenerationStore.getState().clientId,
    scope: 'normal', batch_id: '00000000-0000-4000-8000-000000000003',
    normal_group_id: '00000000-0000-4000-8000-000000000099', project_id: null,
    status: 'running', started_at: '2026-10-10T00:00:00.000Z', finished_at: null,
    node: { id: 'node-ksampler', name: 'KSampler', value: 25, max: 100 }, outputs: [], failure: null,
    ...overrides,
  })

  const initializeSharedWs = async () => {
    useGenerationStore.getState().initialize({ force: true })
    const socket = createdSockets[0]
    socket.readyState = WebSocket.OPEN
    socket.onopen?.()
    await vi.waitFor(() => expect(useGenerationStore.getState().generationSnapshot?.revision).toBe(currentSnapshot.revision))
    await useGenerationStore.getState().fetchHistory({ preserveSelection: true })
    return socket
  }

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  const publishSnapshot = (socket: any, next: GenerationSnapshot) => {
    currentSnapshot = next
    socket.onmessage?.({ data: JSON.stringify({
      type: 'GENERATION_SNAPSHOT', version: 1, epoch: next.epoch, revision: next.revision, data: next,
    }) })
  }

  // ─────────────────────────────────────────────────────────────
  // シナリオ 1: リアルタイム生成・進捗・Blobプレビュー・画像追加
  // ─────────────────────────────────────────────────────────────
  it('Scenario 1: Shared snapshot drives node progress without a preview before frame receipt, then completion & image addition', async () => {
    const ws = await initializeSharedWs()
    expect(useGenerationStore.getState().isConnected).toBe(true)
    useGenerationStore.setState({ previewAutoFollow: true, selectedImg: null })
    const { unmount } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })

    const running = makeJob()
    publishSnapshot(ws, makeSnapshot(1, [running]))
    const stateAfterProgress = useGenerationStore.getState()
    expect(stateAfterProgress.isGenerating).toBe(true)
    expect(stateAfterProgress.progress?.percentage).toBe(25)
    expect(stateAfterProgress.nodeProgress?.nodeId).toBe('node-ksampler')
    expect(stateAfterProgress.previewImage).toBeNull()

    const imageUrl = '/api/comfy/view?filename=test_output.png&subfolder=&type=output&t=prompt-101'
    const completed = makeJob({
      status: 'succeeded', finished_at: '2026-10-10T00:00:03.000Z', node: null,
      outputs: [{ node_id: 'node-ksampler', index: 0, view_url: imageUrl,
        thumbnail_url: '/api/generation/thumbnail/00000000-0000-4000-8000-000000000001/0', availability: 'present' }],
    })
    publishSnapshot(ws, makeSnapshot(2, [completed]))

    await waitFor(() => expect(useGenerationStore.getState().selectedImg).toBe(imageUrl))
    const finalState = useGenerationStore.getState()
    expect(finalState.previewImage).toBeNull()
    expect(finalState.selectedImg).toBe(imageUrl)
    expect(finalState.batchImages).toContain(finalState.selectedImg)
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe(finalState.selectedImg)
    unmount()
  })

  // ─────────────────────────────────────────────────────────────
  // シナリオ 2: ジョブ中断・キュー消去 & AbortController 制御
  // ─────────────────────────────────────────────────────────────
  it('Scenario 2: Confirmed cancellation of a job, queued jobs, and all jobs', async () => {
    const running = makeJob({ job_id: '00000000-0000-4000-8000-000000000011', prompt_id: 'prompt-running' })
    const pending1 = makeJob({ job_id: '00000000-0000-4000-8000-000000000012', prompt_id: 'prompt-pending-1', status: 'queued', node: null })
    const pending2 = makeJob({ job_id: '00000000-0000-4000-8000-000000000013', prompt_id: 'prompt-pending-2', status: 'queued', node: null })
    currentSnapshot = makeSnapshot(1, [running, pending1, pending2])
    useGenerationStore.setState({
      generationSnapshot: currentSnapshot,
      isGenerating: true,
      currentPromptId: 'prompt-running',
      queueRunning: [[1, 'prompt-running', {}, { client_id: 'my-client' }, []]],
      queuePending: [[2, 'prompt-pending-1', {}, {}, []], [3, 'prompt-pending-2', {}, {}, []]],
      activeBatch: [
        { promptId: 'prompt-running', setName: 'Set 1', status: 'generating' },
        { promptId: 'prompt-pending-1', setName: 'Set 2', status: 'pending' },
      ],
    })

    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')
    useGenerationStore.getState().setSubmissionAbortController(abortController)
    const cancelled = (jobId: string, promptId: string) => ({ job_id: jobId, prompt_id: promptId,
      status: 'cancelled' as const, outcome: 'cancelled' as const, message: 'cancelled' })
    vi.spyOn(generationApi, 'cancelJob').mockImplementation(async jobId => {
      currentSnapshot = makeSnapshot(currentSnapshot.revision + 1, currentSnapshot.jobs.map(item =>
        item.job_id === jobId ? { ...item, status: 'cancelled', finished_at: '2026-10-10T00:01:00.000Z' } : item))
      return cancelled(jobId, currentSnapshot.jobs.find(item => item.job_id === jobId)?.prompt_id ?? '')
    })
    vi.spyOn(generationApi, 'cancel').mockImplementation(async request => {
      currentSnapshot = makeSnapshot(currentSnapshot.revision + 1, currentSnapshot.jobs.map(item =>
        request.mode === 'all' || (request.mode === 'queued' && ['queued', 'submitting', 'unconfirmed'].includes(item.status))
          ? { ...item, status: 'cancelled', finished_at: '2026-10-10T00:02:00.000Z' }
          : item))
      return { scope: request.scope ?? 'all', mode: request.mode, message: 'cancelled', items: [],
        upstream_clear: 'confirmed', upstream_interrupt: 'confirmed', epoch: currentSnapshot.epoch, revision: currentSnapshot.revision }
    })

    // 1. Cancel one managed running job and apply only confirmed snapshot state.
    const singleResult = await useGenerationStore.getState().cancelJob('prompt-running')
    expect(singleResult.outcome).toBe('cancelled')
    expect(abortSpy).toHaveBeenCalled()
    expect(generationApi.cancelJob).toHaveBeenCalledWith(running.job_id)
    expect(useGenerationStore.getState().currentPromptId).toBe('prompt-pending-1')

    // 2. Clear queued jobs through the shared management API.
    await useGenerationStore.getState().clearPendingQueue()
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'queued', scope: 'all' })
    expect(useGenerationStore.getState().queuePending).toEqual([])
    expect(useGenerationStore.getState().currentPromptId).toBeNull()

    // 3. Cancel all remaining jobs and verify only the accepted result clears running state.
    const anotherRunning = makeJob({ job_id: '00000000-0000-4000-8000-000000000014', prompt_id: 'another-running' })
    currentSnapshot = makeSnapshot(currentSnapshot.revision + 1, [anotherRunning])
    useGenerationStore.setState({ generationSnapshot: currentSnapshot, isGenerating: true })
    await useGenerationStore.getState().cancelAllJobs()

    expect(generationApi.cancel).toHaveBeenLastCalledWith({ mode: 'all', scope: 'all' })
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
  it('Scenario 5: Shared WebSocket disconnection reconnects and resynchronizes the queue', async () => {
    vi.useFakeTimers()
    const ws = await initializeSharedWs()
    expect(useGenerationStore.getState().isConnected).toBe(true)

    // 2. Network disconnect occurs.
    ws.readyState = WebSocket.CLOSED
    ws.onclose()
    expect(useGenerationStore.getState().isConnected).toBe(false)

    // 3. Shared service opens the same-origin socket again and reloads its snapshot.
    await vi.advanceTimersByTimeAsync(1000)
    expect(createdSockets).toHaveLength(2)
    createdSockets[1].readyState = WebSocket.OPEN
    createdSockets[1].onopen?.()
    await vi.waitFor(() => expect(useGenerationStore.getState().isConnected).toBe(true))

    vi.useRealTimers()
  })
})
