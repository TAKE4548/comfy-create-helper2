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

  it('handles WS executed event for own job: updates selectedImg, batchImages, comfyHistoryImages and resets previewImage', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

    useGenerationStore.setState({
      currentPromptId: 'prompt-123',
      isGenerating: true,
      previewImage: 'blob:http://localhost/preview1',
      selectedImg: 'old_selected.png',
      batchImages: ['old_batch1.png'],
      comfyHistoryImages: ['old_history1.png'],
    })

    const eventSpy = vi.fn()
    window.addEventListener('comfy-job-event', eventSpy)

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'prompt-123',
          output: {
            images: [{ filename: 'new_gen.png', subfolder: '', type: 'output' }],
          },
        },
      }),
    })

    const state = useGenerationStore.getState()
    const expectedUrl = 'http://localhost:3000/comfy/view?filename=new_gen.png&subfolder=&type=output&t=prompt-123'
    expect(state.selectedImg).toBe(expectedUrl)
    expect(state.batchImages[0]).toBe(expectedUrl)
    expect(state.comfyHistoryImages[0]).toBe(expectedUrl)
    expect(state.previewImage).toBeNull()
    expect(state.isGenerating).toBe(false)
    expect(state.currentPromptId).toBeNull()

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          type: 'executed',
          promptId: 'prompt-123',
          images: [expectedUrl],
          isOwn: true,
        },
      })
    )
    window.removeEventListener('comfy-job-event', eventSpy)
  })

  it('handles WS executed event for other device job: adds to comfyHistoryImages but does not alter selectedImg or batchImages or local generating state', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

    useGenerationStore.setState({
      currentPromptId: 'own-prompt-999',
      isGenerating: true,
      previewImage: 'blob:http://localhost/preview-own',
      selectedImg: 'my_viewing_image.png',
      batchImages: ['my_batch1.png'],
      comfyHistoryImages: ['old_history1.png'],
    })

    const eventSpy = vi.fn()
    window.addEventListener('comfy-job-event', eventSpy)

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'other-device-prompt-555',
          output: {
            images: [{ filename: 'other_gen.png', subfolder: '', type: 'output' }],
          },
        },
      }),
    })

    const state = useGenerationStore.getState()
    const otherUrl = 'http://localhost:3000/comfy/view?filename=other_gen.png&subfolder=&type=output&t=other-device-prompt-555'
    expect(state.comfyHistoryImages[0]).toBe(otherUrl)
    expect(state.selectedImg).toBe('my_viewing_image.png')
    expect(state.batchImages).toEqual(['my_batch1.png'])
    expect(state.previewImage).toBe('blob:http://localhost/preview-own')
    expect(state.isGenerating).toBe(true)
    expect(state.currentPromptId).toBe('own-prompt-999')

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          type: 'executed',
          promptId: 'other-device-prompt-555',
          images: [otherUrl],
          isOwn: false,
        },
      })
    )
    window.removeEventListener('comfy-job-event', eventSpy)
  })
})

