import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useGenerationStore, _resetWebSocketForTesting, resolveNodeTitle } from '../../useGenerationStore'

describe('connectionSlice - preview reset logic', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should reset previewImage to null when setSelectedImg is called', () => {
    useGenerationStore.setState({
      previewImage: 'some_preview_image.png',
      selectedImg: 'some_selected_image.png',
    })

    useGenerationStore.getState().setSelectedImg('new_selected_image.png')

    const state = useGenerationStore.getState()
    expect(state.selectedImg).toBe('new_selected_image.png')
    expect(state.previewImage).toBeNull()
  })
})

describe('connectionSlice - resolveNodeTitle', () => {
  it('returns null for null or undefined workflow / nodeId', () => {
    expect(resolveNodeTitle(null, '3')).toBeNull()
    expect(resolveNodeTitle(undefined, '3')).toBeNull()
    expect(resolveNodeTitle({}, null)).toBeNull()
    expect(resolveNodeTitle({}, undefined)).toBeNull()
  })

  it('returns _meta.title if present', () => {
    const wf = {
      '3': { class_type: 'KSampler', _meta: { title: 'My KSampler Node' } }
    }
    expect(resolveNodeTitle(wf, '3')).toBe('My KSampler Node')
  })

  it('falls back to class_type if _meta.title is absent', () => {
    const wf = {
      '4': { class_type: 'CheckpointLoaderSimple' }
    }
    expect(resolveNodeTitle(wf, '4')).toBe('CheckpointLoaderSimple')
  })

  it('returns null if node ID is not in workflow', () => {
    const wf = {
      '4': { class_type: 'CheckpointLoaderSimple' }
    }
    expect(resolveNodeTitle(wf, '99')).toBeNull()
  })
})

describe('connectionSlice - WebSocket status event optimization', () => {
  let createdWsList: any[] = []

  beforeEach(() => {
    _resetWebSocketForTesting()
    localStorage.clear()
    vi.restoreAllMocks()
    createdWsList = []

    class MockWebSocket {
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

      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    })
  })

  afterEach(() => {
    _resetWebSocketForTesting()
  })

  it('handles WS status event by calling fetchQueue and NOT calling fetchHistory', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory')
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue')

    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]
    expect(wsInstance).toBeDefined()

    fetchHistorySpy.mockClear()
    fetchQueueSpy.mockClear()

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'status',
        data: {
          status: {
            exec_info: { queue_remaining: 1 },
          },
        },
      }),
    })

    expect(fetchQueueSpy).toHaveBeenCalledTimes(1)
    expect(fetchHistorySpy).not.toHaveBeenCalled()
  })
})
