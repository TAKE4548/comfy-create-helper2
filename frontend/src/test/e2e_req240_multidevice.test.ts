import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGenerationStore, _resetWebSocketForTesting } from '../store/useGenerationStore'
import { systemWsService } from '../store/services/systemWsService'
import type { GenerationSnapshot, JobView } from '../api/domains/generation'
import { useGenerateDisplayState } from '../pages/GeneratePage/hooks/useGenerateDisplayState'

const job = (overrides: Partial<JobView> = {}): JobView => ({
  job_id: 'job-1', request_id: 'request-1', prompt_id: 'prompt-1', session_id: 'foreign-session',
  scope: 'normal', batch_id: 'batch-1', normal_group_id: 'group-1', project_id: null,
  status: 'running', started_at: '2026-10-10T00:00:00.000Z', finished_at: null,
  node: null, outputs: [], failure: null, ...overrides,
})

const snapshot = (revision: number, jobs: JobView[] = []): GenerationSnapshot => ({
  version: 1, epoch: 'test-epoch', revision, normal_group_id: 'group-1', jobs,
  batches: jobs.map((item) => ({ batch_id: item.batch_id, scope: item.scope, project_id: item.project_id })),
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
})

describe('REQ-240: Multi-device sync and UI context protection', () => {
  let createdWsList: any[] = []
  let queryClient: QueryClient
  let currentSnapshot: GenerationSnapshot

  beforeEach(() => {
    _resetWebSocketForTesting()
    localStorage.clear()
    vi.restoreAllMocks()
    createdWsList = []
    currentSnapshot = snapshot(0)
    useGenerationStore.setState({
      generationSnapshot: null,
      generationSyncIssue: null,
      comfyHistoryImages: [],
      batchImages: [],
      selectedImg: null,
      previewImage: null,
      isGenerating: false,
      currentPromptId: null,
      queueRunning: [],
      queuePending: [],
    })
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

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
      binaryType: string = ''
      url: string

      constructor(url: string) {
        this.url = url
        createdWsList.push(this)
      }

      close() { this.readyState = MockWebSocket.CLOSED }
      send() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.endsWith('/generation/state') ? currentSnapshot
        : url.endsWith('/generation/upstream-queue') ? { running: [], pending: [] }
          : {}
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
  })

  afterEach(() => {
    _resetWebSocketForTesting()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  const connect = async (initial: GenerationSnapshot = snapshot(0)) => {
    currentSnapshot = initial
    useGenerationStore.getState().initialize({ force: true })
    const socket = createdWsList[0]
    socket.readyState = WebSocket.OPEN
    socket.onopen?.()
    await waitFor(() => expect(useGenerationStore.getState().generationSnapshot?.revision).toBe(initial.revision))
    await useGenerationStore.getState().fetchHistory({ preserveSelection: true })
    return socket
  }

  const publish = (socket: any, next: GenerationSnapshot) => {
    socket.onmessage?.({ data: JSON.stringify({
      type: 'GENERATION_SNAPSHOT', version: 1, epoch: next.epoch, revision: next.revision, data: next,
    }) })
  }

  it('AC-1: Other device completion appears in history without altering local selectedImg', async () => {
    const wsInstance = await connect()
    useGenerationStore.setState({
      currentPromptId: null,
      selectedImg: 'viewing_current.png',
      batchImages: ['batch_item1.png'],
      comfyHistoryImages: ['history_item1.png'],
    })

    const external = job({
      job_id: 'foreign-job-100', request_id: 'foreign-request-100', prompt_id: 'external-prompt-100',
      status: 'succeeded', finished_at: '2026-10-10T00:01:00.000Z', outputs: [{ node_id: '9', index: 0,
        view_url: '/api/comfy/view?filename=external_gen.png&subfolder=&type=output&t=external-prompt-100',
        thumbnail_url: '/api/generation/thumbnail/foreign-job-100/0', availability: 'present' }],
    })
    publish(wsInstance, snapshot(1, [external]))

    const state = useGenerationStore.getState()
    const expectedUrl = '/api/comfy/view?filename=external_gen.png&subfolder=&type=output&t=external-prompt-100'

    expect(state.comfyHistoryImages[0]).toBe(expectedUrl)
    expect(state.selectedImg).toBe('viewing_current.png')
    expect(state.batchImages).toEqual(['batch_item1.png'])
  })

  it('AC-2 & AC-3: Protects modal preview index when sortedDisplayImages receives new external images', async () => {
    const wsInstance = await connect()

    const initialHistory = ['img_A.png', 'img_B.png', 'img_C.png']
    useGenerationStore.setState({
      filterOwnSession: false,
      comfyHistoryImages: initialHistory,
      selectedImg: 'img_B.png',
    })

    const { result } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: 1 }), { wrapper })

    // Open modal at img_B.png (index 1)
    act(() => {
      result.current.handleOpenModalPreview()
    })

    expect(result.current.isModalPreviewOpen).toBe(true)
    expect(result.current.modalPreviewIndex).toBe(1)
    expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_B.png')

    // Receive external image execution -> prepends to comfyHistoryImages and notifies queries
    act(() => {
      const external = job({ job_id: 'foreign-job-200', request_id: 'foreign-request-200', prompt_id: 'external-prompt-200',
        status: 'succeeded', finished_at: '2026-10-10T00:01:00.000Z', outputs: [{ node_id: '9', index: 0,
          view_url: '/api/comfy/view?filename=img_NEW.png&subfolder=&type=output&t=external-prompt-200',
          thumbnail_url: '/api/generation/thumbnail/foreign-job-200/0', availability: 'present' }] })
      publish(wsInstance, snapshot(1, [external]))
    })

    const newUrl = '/api/comfy/view?filename=img_NEW.png&subfolder=&type=output&t=external-prompt-200'

    await waitFor(() => {
      // The new item is at index 0, img_B is now at index 2
      expect(result.current.sortedDisplayImages[0]).toBe(newUrl)
      expect(result.current.sortedDisplayImages[2]).toBe('img_B.png')

      // The modal index should be adjusted so the user is STILL viewing img_B.png
      expect(result.current.effectiveModalIndex).toBe(2)
      expect(result.current.modalPreviewIndex).toBe(2)
      expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_B.png')
    })
  })

  it('AC-4: Own session completion updates selectedImg, batchImages, and resets previewImage', async () => {
    const wsInstance = await connect()

    useGenerationStore.setState({
      currentPromptId: 'own-prompt-300',
      isGenerating: true,
      previewImage: 'blob:http://localhost/active-preview',
      selectedImg: 'old_selected.png',
      batchImages: ['old_batch.png'],
      comfyHistoryImages: ['old_history.png'],
      previewAutoFollow: true,
    })
    const { unmount } = renderHook(() => useGenerateDisplayState({ selectedWorkflowId: null }), { wrapper })

    const owned = job({ job_id: 'own-job-300', request_id: 'own-request-300', prompt_id: 'own-prompt-300',
      session_id: useGenerationStore.getState().clientId, status: 'running' })
    publish(wsInstance, snapshot(1, [owned]))
    const completed = { ...owned, status: 'succeeded' as const, finished_at: '2026-10-10T00:02:00.000Z',
      outputs: [{ node_id: '9', index: 0,
        view_url: '/api/comfy/view?filename=my_new_art.png&subfolder=&type=output&t=own-prompt-300',
        thumbnail_url: '/api/generation/thumbnail/own-job-300/0', availability: 'present' as const }] }

    act(() => {
      publish(wsInstance, snapshot(2, [completed]))
    })

    const expectedUrl = '/api/comfy/view?filename=my_new_art.png&subfolder=&type=output&t=own-prompt-300'

    await waitFor(() => expect(useGenerationStore.getState().selectedImg).toBe(expectedUrl))
    const state = useGenerationStore.getState()

    expect(state.selectedImg).toBe(expectedUrl)
    expect(state.batchImages[0]).toBe(expectedUrl)
    expect(state.comfyHistoryImages[0]).toBe(expectedUrl)
    expect(state.previewImage).toBeNull()
    expect(state.isGenerating).toBe(false)
    expect(state.currentPromptId).toBeNull()
    unmount()
  })

  it('Red Teaming: malformed or incomplete snapshots do not corrupt valid image state', async () => {
    const wsInstance = await connect()

    useGenerationStore.setState({
      currentPromptId: null,
      selectedImg: 'stable_image.png',
      comfyHistoryImages: ['existing1.png'],
    })

    const valid = job({ job_id: 'safe', prompt_id: 'safe-prompt', session_id: useGenerationStore.getState().clientId,
      status: 'succeeded', outputs: [{ node_id: '1', index: 0, view_url: 'stable_image.png',
        thumbnail_url: 'stable_thumb.png', availability: 'present' }] })
    publish(wsInstance, snapshot(1, [valid]))
    wsInstance.onmessage?.({ data: JSON.stringify({ type: 'GENERATION_SNAPSHOT', version: 1, epoch: 'test-epoch', revision: 2,
      data: { ...snapshot(2, [valid]), jobs: [{ ...valid, outputs: [{ ...valid.outputs[0], availability: 'invalid' }] }] } }) })

    const state = useGenerationStore.getState()
    expect(state.selectedImg).toBe('stable_image.png')
    expect(state.comfyHistoryImages).toContain('stable_image.png')
  })
})
