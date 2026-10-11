import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type GenerationSnapshot } from '../../../api/domains/generation'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { systemWsService } from '../../services/systemWsService'
import { useGenerationStore, _resetWebSocketForTesting, resolveNodeTitle } from '../../useGenerationStore'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED })

  constructor(readonly url: string) {}

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  message(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}

const snapshot = (revision = 7, jobs: GenerationSnapshot['jobs'] = [], epoch = 'epoch-1'): GenerationSnapshot => ({
  version: 1,
  epoch,
  revision,
  normal_group_id: 'normal-group-1',
  jobs,
  batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
})

const job = (overrides: Partial<GenerationSnapshot['jobs'][number]> = {}): GenerationSnapshot['jobs'][number] => ({
  job_id: 'job-1',
  request_id: 'request-1',
  prompt_id: 'prompt-1',
  session_id: useGenerationStore.getState().clientId,
  scope: 'normal',
  batch_id: 'batch-1',
  normal_group_id: 'normal-group-1',
  project_id: null,
  status: 'running',
  started_at: '2026-10-10T00:00:00Z',
  finished_at: null,
  node: { id: 'node-1', name: 'Sampler', value: 3, max: 10 },
  outputs: [],
  failure: null,
  ...overrides,
})

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

describe('connectionSlice - preview reset and node titles', () => {
  beforeEach(() => localStorage.clear())

  it('resets previewImage when setSelectedImg is called', () => {
    useGenerationStore.setState({ previewImage: 'some_preview_image.png', selectedImg: 'old.png' })
    useGenerationStore.getState().setSelectedImg('new.png')
    expect(useGenerationStore.getState().selectedImg).toBe('new.png')
    expect(useGenerationStore.getState().previewImage).toBeNull()
  })

  it('resolves node titles from workflow metadata or class type', () => {
    expect(resolveNodeTitle(null, '3')).toBeNull()
    expect(resolveNodeTitle({ '3': { class_type: 'KSampler', _meta: { title: 'Sampler' } } }, '3')).toBe('Sampler')
    expect(resolveNodeTitle({ '4': { class_type: 'CheckpointLoaderSimple' } }, '4')).toBe('CheckpointLoaderSimple')
  })
})

describe('connectionSlice - server generation state', () => {
  let sockets: MockWebSocket[]
  let stateResponse: unknown
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    systemWsService.resetForTesting()
    _resetWebSocketForTesting()
    useGenerationStore.setState({
      generationSnapshot: null,
      generationSyncing: false,
      generationSyncIssue: null,
      isConnected: false,
      isGenerating: false,
      progress: null,
      currentNode: null,
      nodeProgress: null,
      previewImage: null,
      currentPromptId: null,
      generationStartTime: null,
      activeClientId: null,
    })
    sockets = []
    stateResponse = snapshot()

    class TestWebSocket extends MockWebSocket {
      constructor(url: string) {
        super(url)
        sockets.push(this)
      }
    }
    vi.stubGlobal('WebSocket', TestWebSocket)
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/generation/state') return response(stateResponse)
      if (url === '/api/generation/upstream-queue') return response({ running: [], pending: [] })
      if (String(url).startsWith('/api/comfy/history')) return response({})
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    systemWsService.resetForTesting()
    _resetWebSocketForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const connect = async () => {
    useGenerationStore.getState().initialize({ force: true })
    expect(sockets).toHaveLength(1)
    expect(sockets[0].url).toBe(`${window.location.origin.replace(/^http/, 'ws')}/api/ws`)
    sockets[0].open()
    await vi.waitFor(() => expect(useGenerationStore.getState().generationSnapshot).not.toBeNull())
  }

  const emit = (data: GenerationSnapshot, type = 'GENERATION_EVENT', version = 1) => {
    sockets[sockets.length - 1].message({ type, version, epoch: data.epoch, revision: data.revision, data })
  }

  it('does not request or merge history when applying the initial snapshot', async () => {
    const clicked = '/api/comfy/view?filename=clicked.png&subfolder=&type=output&t=clicked'
    const clientId = useGenerationStore.getState().clientId
    useGenerationStore.setState({ selectedImg: null })
    stateResponse = snapshot(7, [job({ status: 'succeeded', session_id: clientId, outputs: [
      { node_id: 'image', index: 0, view_url: '/initial.png', thumbnail_url: '/initial-thumb.png', availability: 'present' },
    ] })])
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/generation/state') return response(stateResponse)
      if (url === '/api/generation/upstream-queue') return response({ running: [], pending: [] })
      throw new Error(`Unexpected fetch: ${url}`)
    })
    const historyFetch = vi.spyOn(useGenerationStore.getState(), 'fetchHistory')
    await connect()
    expect(localStorage.getItem(LS_KEYS.CLIENT_ID)).toBe(clientId)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('8188'))).toBe(false)
    expect(historyFetch).not.toHaveBeenCalled()
    expect(useGenerationStore.getState().comfyHistoryImages).not.toContain('/initial.png')
    useGenerationStore.getState().setSelectedImg(clicked)
    expect(useGenerationStore.getState().selectedImg).toBe(clicked)
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe(clicked)
  })

  it('atomically applies the newest complete snapshot and ignores reversed revisions', async () => {
    stateResponse = snapshot(7, [job()])
    await connect()
    emit(snapshot(9, [job({ node: { id: 'node-2', name: 'VAE', value: 8, max: 10 } })]))
    emit(snapshot(8, [job({ node: { id: 'old', name: 'Old', value: 1, max: 10 } })]))

    const state = useGenerationStore.getState()
    expect(state.generationSnapshot?.revision).toBe(9)
    expect(state.generationSnapshot?.jobs[0].node?.id).toBe('node-2')
    expect(state.currentNode).toEqual({ id: 'node-2', name: 'VAE' })
    expect(state.progress).toEqual({ value: 8, max: 10, percentage: 80 })
    expect(state.previewImage).toBeNull()
    expect(state.generationStartTime).toBe(Date.parse('2026-10-10T00:00:00Z'))
  })

  it('rejects an older HTTP response after a newer WebSocket snapshot has applied', async () => {
    await connect()
    let resolveState!: (value: Response) => void
    const delayedState = new Promise<Response>((resolve) => { resolveState = resolve })
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/generation/state') return delayedState
      if (url === '/api/generation/upstream-queue') return response({ running: [], pending: [] })
      throw new Error(`Unexpected fetch: ${url}`)
    })

    useGenerationStore.getState().initialize({ force: true })
    sockets[sockets.length - 1].open()
    emit(snapshot(9, [job({ node: { id: 'new', name: 'New', value: 9, max: 10 } })]))
    resolveState(response(snapshot(8, [job({ node: { id: 'old', name: 'Old', value: 2, max: 10 } })])))
    await Promise.resolve()
    await Promise.resolve()

    expect(useGenerationStore.getState().generationSnapshot?.revision).toBe(9)
    expect(useGenerationStore.getState().currentNode?.id).toBe('new')
  })

  it('does not adopt workflow or parameters from another session', async () => {
    useGenerationStore.setState({ currentWorkflow: { own: true }, paramValues: { prompt: 'mine' } })
    stateResponse = snapshot(7, [job({ session_id: 'other-session', node: { id: 'other', name: 'Other', value: 7, max: 10 } })])
    await connect()

    const state = useGenerationStore.getState()
    expect(state.currentWorkflow).toEqual({ own: true })
    expect(state.paramValues).toEqual({ prompt: 'mine' })
    expect(state.isGenerating).toBe(false)
    expect(state.currentNode).toBeNull()
  })

  it('retains last valid snapshot on unsupported version and performs at most one resync per epoch', async () => {
    await connect()
    stateResponse = { ...snapshot(8), version: 2 }
    emit(snapshot(8), 'GENERATION_EVENT', 2)
    await vi.waitFor(() => expect(useGenerationStore.getState().generationSyncIssue?.kind).toBe('unsupported'))
    emit(snapshot(9), 'GENERATION_EVENT', 2)
    await Promise.resolve()

    const state = useGenerationStore.getState()
    expect(state.generationSnapshot?.revision).toBe(7)
    expect(state.generationSyncing).toBe(false)
    expect(state.generationSyncIssue?.message).toMatch(/reload|再読込/i)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/generation/state')).toHaveLength(2)
  })

  it('resynchronizes on a revision gap and reports a newly failed job once', async () => {
    stateResponse = snapshot(7, [job()])
    await connect()
    const toast = vi.spyOn(useGenerationStore.getState(), 'setErrorToast')
    const failed = job({
      status: 'failed',
      finished_at: '2026-10-10T00:01:00Z',
      failure: { reason: 'Prompt rejected', outcome: 'failed' },
    })
    emit(snapshot(10, [failed]))
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/generation/state')).toHaveLength(2))
    emit(snapshot(11, [failed]))

    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith({ message: 'Prompt rejected', type: 'error' })
    expect(useGenerationStore.getState().isGenerating).toBe(false)
  })

  it('treats cancellation as terminal without sending a failure toast', async () => {
    stateResponse = snapshot(7, [job()])
    await connect()
    useGenerationStore.setState({
      activeBatch: [{ promptId: 'prompt-1', setName: 'studio set', status: 'generating' }],
      isBatchSubmitting: true,
    })
    const toast = vi.spyOn(useGenerationStore.getState(), 'setErrorToast')
    emit(snapshot(8, [job({ scope: 'studio', status: 'cancelled', finished_at: '2026-10-10T00:01:00Z', node: null })]))

    expect(useGenerationStore.getState().isGenerating).toBe(false)
    expect(useGenerationStore.getState().currentPromptId).toBeNull()
    expect(useGenerationStore.getState().previewImage).toBeNull()
    expect(useGenerationStore.getState().activeBatch).toBeNull()
    expect(useGenerationStore.getState().isBatchSubmitting).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })

  it('exposes one atomic snapshot adapter and rejects retired epochs and malformed payloads', async () => {
    await connect()
    const apply = useGenerationStore.getState().applyGenerationSnapshot
    expect(apply(snapshot(1, [job()]))).toBe(false)
    expect(apply({ ...snapshot(20), version: 2 } as unknown as GenerationSnapshot)).toBe(false)
    expect(apply({ ...snapshot(1), epoch: 'epoch-2' })).toBe(true)
    expect(apply(snapshot(99))).toBe(false)
    expect(useGenerationStore.getState().generationSnapshot?.epoch).toBe('epoch-2')
    expect(useGenerationStore.getState().generationSnapshot?.revision).toBe(1)
  })

  it('does not merge historical succeeded jobs from an initial snapshot', async () => {
    const own = useGenerationStore.getState().clientId
    const oldOwnUrl = 'http://localhost:8188/view?filename=own.png&subfolder=&type=output&t=legacy-prompt'
    const oldForeignUrl = 'http://localhost:8188/view?filename=foreign.png&subfolder=&type=output&t=prompt-foreign'
    const initialAll = ['/legacy/all.png', '/unmanaged/old.png', oldOwnUrl, oldForeignUrl]
    const initialOwn = ['/legacy/own.png', '/unmanaged/own.png', oldOwnUrl, oldForeignUrl]
    useGenerationStore.setState({ comfyHistoryImages: initialAll, batchImages: initialOwn, selectedImg: '/legacy/selected.png' })
    const foreign = job({
      session_id: 'foreign-session', status: 'succeeded', node: null,
      outputs: [
        { node_id: 'image', index: 0, view_url: '/api/comfy/view?filename=foreign.png&subfolder=&type=output&t=prompt-foreign', thumbnail_url: '/api/comfy/view?filename=foreign-thumb.png', availability: 'present' },
        { node_id: 'missing', index: 1, view_url: '/api/comfy/view?filename=missing.png&t=prompt-foreign', thumbnail_url: '/missing-thumb.png', availability: 'missing' },
      ],
    })
    const ownDone = job({
      job_id: 'own-job', prompt_id: 'prompt-own', session_id: own, status: 'succeeded', node: null,
      outputs: [{ node_id: 'image', index: 0, view_url: '/api/comfy/view?filename=own.png&subfolder=&type=output&t=prompt-own', thumbnail_url: '/api/comfy/view?filename=own-thumb.png', availability: 'present' }],
    })
    const dispatch = vi.spyOn(window, 'dispatchEvent')

    expect(useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [foreign, ownDone], 'phone-history-epoch'), { running: [], pending: [] })).toBe(true)

    const state = useGenerationStore.getState()
    expect(state.comfyHistoryImages).toContain('/legacy/all.png')
    expect(state.comfyHistoryImages).toContain('/unmanaged/old.png')
    expect(state.comfyHistoryImages).not.toContain('/api/comfy/view?filename=foreign.png&subfolder=&type=output&t=prompt-foreign')
    expect(state.comfyHistoryImages).toContain(oldForeignUrl)
    expect(state.comfyHistoryImages).toContain(oldForeignUrl)
    expect(state.comfyHistoryImages).not.toContain('/api/comfy/view?filename=foreign-thumb.png')
    expect(state.comfyHistoryImages).not.toContain('/api/comfy/view?filename=missing.png&t=prompt-foreign')
    expect(state.batchImages).toContain('/legacy/own.png')
    expect(state.batchImages).toContain('/unmanaged/own.png')
    expect(state.batchImages).not.toContain('/api/comfy/view?filename=own.png&subfolder=&type=output&t=prompt-own')
    expect(state.batchImages).toContain(oldOwnUrl)
    expect(state.batchImages).toContain(oldForeignUrl)
    expect(state.selectedImg).toBe('/legacy/selected.png')
    expect(dispatch.mock.calls.some(([event]) => event.type === 'comfy-job-event')).toBe(false)
    useGenerationStore.setState({ filterOwnSession: true })
    expect(useGenerationStore.getState().batchImages).toContain(oldForeignUrl)
    useGenerationStore.setState({ filterOwnSession: false })
    expect(useGenerationStore.getState().comfyHistoryImages).not.toContain('/api/comfy/view?filename=foreign.png&subfolder=&type=output&t=prompt-foreign')
  })

  it('does not rewrite history arrays on node/preview revisions and emits original URLs for a live own completion', async () => {
    const own = useGenerationStore.getState().clientId
    useGenerationStore.setState({ comfyHistoryImages: ['/cached/all.png'], batchImages: ['/cached/own.png'] })
    const output = { node_id: 'image', index: 0, view_url: '/original.png?t=prompt-1', thumbnail_url: '/thumbnail.png', availability: 'present' as const }
    const running = job({ status: 'running', outputs: [] })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [running], 'phone-live-epoch'), { running: [], pending: [] })
    const allReference = useGenerationStore.getState().comfyHistoryImages
    const ownReference = useGenerationStore.getState().batchImages
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [job({ node: { id: 'node-2', name: 'Decode', value: 5, max: 10 } })], 'phone-live-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().comfyHistoryImages).toBe(allReference)
    expect(useGenerationStore.getState().batchImages).toBe(ownReference)

    let completion: CustomEvent | null = null
    const listener = (event: Event) => { completion = event as CustomEvent }
    window.addEventListener('comfy-job-event', listener)
    const completed = job({ session_id: own, status: 'succeeded', node: null, outputs: [output] })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(3, [completed], 'phone-live-epoch'), { running: [], pending: [] })
    window.removeEventListener('comfy-job-event', listener)
    expect(completion?.detail.images).toEqual(['/original.png?t=prompt-1'])
    expect(useGenerationStore.getState().comfyHistoryImages).toContain('/original.png?t=prompt-1')
    expect(useGenerationStore.getState().batchImages).toContain('/original.png?t=prompt-1')
    expect(useGenerationStore.getState().selectedImg).toBe('/original.png?t=prompt-1')
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe('/original.png?t=prompt-1')
  })

  it('auto-follows a fast same-epoch own completion without clearing the next job preview', () => {
    const own = useGenerationStore.getState().clientId
    useGenerationStore.setState({ selectedImg: '/before.png', previewAutoFollow: true })
    const nextRunning = job({ job_id: 'next-job', prompt_id: 'next-prompt', status: 'running' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [nextRunning], 'fast-live-epoch'), { running: [], pending: [] })
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    const completed = job({
      job_id: 'fast-job', prompt_id: 'actual-prompt', session_id: own, status: 'succeeded', node: null,
      outputs: [{ node_id: 'image', index: 0, view_url: '/api/comfy/view?filename=fast.png&t=actual-prompt', thumbnail_url: '/thumb.png', availability: 'present' }],
    })

    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [nextRunning, completed], 'fast-live-epoch'), { running: [], pending: [] })

    expect(useGenerationStore.getState().selectedImg).toBe('/api/comfy/view?filename=fast.png&t=actual-prompt')
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe('/api/comfy/view?filename=fast.png&t=actual-prompt')
    expect(useGenerationStore.getState().previewImage).toBeNull()
    expect(dispatch.mock.calls.some(([event]) => event.type === 'comfy-job-event')).toBe(true)
  })

  it('shows an own completed original instead of that completed job preview until the next job has a frame', () => {
    const own = useGenerationStore.getState().clientId
    useGenerationStore.setState({ previewAutoFollow: true })
    const first = job({ job_id: 'job-a', prompt_id: 'prompt-a', session_id: own, status: 'running', preview_url: '/preview/a.jpg' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [first], 'follow-completion-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/a.jpg')

    const completed = { ...first, status: 'succeeded' as const, preview_url: null, node: null, outputs: [
      { node_id: 'image', index: 0, view_url: '/view?filename=a.png&t=prompt-a', thumbnail_url: '/thumb/a.png', availability: 'present' as const },
    ] }
    const nextWithoutFrame = job({ job_id: 'job-b', prompt_id: 'prompt-b', session_id: own, status: 'running', preview_url: null })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [completed, nextWithoutFrame], 'follow-completion-epoch'), { running: [], pending: [] })

    expect(useGenerationStore.getState().selectedImg).toBe('/view?filename=a.png&t=prompt-a')
    expect(useGenerationStore.getState().previewImage).toBeNull()

    const nextFrame = { ...nextWithoutFrame, preview_url: '/preview/b.jpg' }
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(3, [completed, nextFrame], 'follow-completion-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/b.jpg')

    const progressOnly = { ...nextFrame, node: { id: 'sampler', name: 'Sampler', value: 7, max: 10 } }
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(4, [completed, progressOnly], 'follow-completion-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/b.jpg')
  })

  it('preserves a next-job frame already received before the previous job completes', () => {
    const own = useGenerationStore.getState().clientId
    useGenerationStore.setState({ previewAutoFollow: true })
    const first = job({ job_id: 'job-a', prompt_id: 'prompt-a', session_id: own, status: 'running', preview_url: '/preview/a.jpg' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [first], 'frame-order-epoch'), { running: [], pending: [] })
    const next = job({ job_id: 'job-b', prompt_id: 'prompt-b', session_id: own, status: 'running', preview_url: '/preview/b.jpg' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [next, first], 'frame-order-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/b.jpg')

    const completed = { ...first, status: 'succeeded' as const, preview_url: null, node: null, outputs: [
      { node_id: 'image', index: 0, view_url: '/view?filename=a.png&t=prompt-a', thumbnail_url: '/thumb/a.png', availability: 'present' as const },
    ] }
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(3, [next, completed], 'frame-order-epoch'), { running: [], pending: [] })

    expect(useGenerationStore.getState().selectedImg).toBe('/view?filename=a.png&t=prompt-a')
    expect(useGenerationStore.getState().previewImage).toBe('/preview/b.jpg')
  })

  it('preserves selection for fixed mode and foreign live completion', () => {
    const own = useGenerationStore.getState().clientId
    const selected = '/keep-selected.png'
    useGenerationStore.setState({ selectedImg: selected, previewAutoFollow: false })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [], 'selection-live-epoch'), { running: [], pending: [] })
    const ownDone = job({ status: 'succeeded', node: null, outputs: [
      { node_id: 'image', index: 0, view_url: '/own-done.png?t=prompt-1', thumbnail_url: '/own-thumb.png', availability: 'present' },
    ] })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [ownDone], 'selection-live-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().selectedImg).toBe(selected)

    useGenerationStore.setState({ previewAutoFollow: true })
    const foreignDone = job({ job_id: 'foreign-job', prompt_id: 'foreign-prompt', session_id: 'other-session', status: 'succeeded', node: null, outputs: [
      { node_id: 'image', index: 0, view_url: '/foreign-done.png?t=foreign-prompt', thumbnail_url: '/foreign-thumb.png', availability: 'present' },
    ] })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(3, [ownDone, foreignDone], 'selection-live-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().selectedImg).toBe(selected)
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).not.toBe('/foreign-done.png?t=foreign-prompt')
  })

  it('uses only received preview URLs and retains the last frame across progress and image-less jobs', () => {
    const own = useGenerationStore.getState().clientId
    const first = job({ job_id: 'preview-one', session_id: own, status: 'running', preview_url: '/preview/one.jpg' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [first], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/one.jpg')

    const progress = job({ job_id: 'preview-one', session_id: own, status: 'running', node: { id: 'n', name: 'KSampler', value: 3, max: 10 } })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [progress], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/one.jpg')

    const nextWithoutImage = job({ job_id: 'preview-two', session_id: own, status: 'running', preview_url: null })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(3, [nextWithoutImage], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/one.jpg')

    const secondFrame = job({ job_id: 'preview-two', session_id: own, status: 'running', preview_url: '/preview/two.jpg' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(4, [secondFrame], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/two.jpg')

    useGenerationStore.getState().clearPreview()
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(5, [job({
      job_id: 'preview-two', session_id: own, status: 'running', preview_url: '/preview/two.jpg',
    })], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBeNull()

    useGenerationStore.getState().applyGenerationSnapshot(snapshot(6, [job({
      job_id: 'preview-two', session_id: own, status: 'running', preview_url: '/preview/two-next.jpg',
    })], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBe('/preview/two-next.jpg')

    useGenerationStore.getState().applyGenerationSnapshot(snapshot(7, [], 'preview-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBeNull()

    const restartedWithoutImage = job({ job_id: 'preview-three', session_id: own, status: 'running' })
    useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [restartedWithoutImage], 'preview-new-epoch'), { running: [], pending: [] })
    expect(useGenerationStore.getState().previewImage).toBeNull()
  })

  it('accepts legacy jobs without preview_url and rejects invalid supplied preview_url values', () => {
    const legacy = job({ status: 'running' })
    expect(useGenerationStore.getState().applyGenerationSnapshot(snapshot(1, [legacy], 'legacy-preview-epoch'), { running: [], pending: [] })).toBe(true)
    expect(useGenerationStore.getState().previewImage).toBeNull()

    const invalid = { ...legacy, preview_url: 42 } as unknown as typeof legacy
    expect(useGenerationStore.getState().applyGenerationSnapshot(snapshot(2, [invalid], 'legacy-preview-epoch'), { running: [], pending: [] })).toBe(false)
    expect(useGenerationStore.getState().generationSnapshot?.revision).toBe(1)
  })
})
