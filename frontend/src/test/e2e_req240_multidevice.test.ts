import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useGenerationStore, _resetWebSocketForTesting } from '../store/useGenerationStore'
import { useGenerateDisplayState } from '../pages/GeneratePage/hooks/useGenerateDisplayState'

describe('REQ-240: Multi-device sync and UI context protection', () => {
  let createdWsList: any[] = []
  let queryClient: QueryClient

  beforeEach(() => {
    _resetWebSocketForTesting()
    localStorage.clear()
    vi.restoreAllMocks()
    createdWsList = []
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

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

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  it('AC-1: Other device execution prepends image to comfyHistoryImages without altering local selectedImg', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

    useGenerationStore.setState({
      currentPromptId: null,
      selectedImg: 'viewing_current.png',
      batchImages: ['batch_item1.png'],
      comfyHistoryImages: ['history_item1.png'],
    })

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'external-prompt-100',
          output: {
            images: [{ filename: 'external_gen.png', subfolder: '', type: 'output' }],
          },
        },
      }),
    })

    const state = useGenerationStore.getState()
    const expectedUrl = 'http://localhost:3000/comfy/view?filename=external_gen.png&subfolder=&type=output&t=external-prompt-100'

    expect(state.comfyHistoryImages[0]).toBe(expectedUrl)
    expect(state.selectedImg).toBe('viewing_current.png')
    expect(state.batchImages).toEqual(['batch_item1.png'])
  })

  it('AC-2 & AC-3: Protects modal preview index when sortedDisplayImages receives new external images', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

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

    // Receive external image execution -> prepends to comfyHistoryImages
    act(() => {
      wsInstance.onmessage?.({
        data: JSON.stringify({
          type: 'executed',
          data: {
            prompt_id: 'external-prompt-200',
            output: {
              images: [{ filename: 'img_NEW.png', subfolder: '', type: 'output' }],
            },
          },
        }),
      })
    })

    const newUrl = 'http://localhost:3000/comfy/view?filename=img_NEW.png&subfolder=&type=output&t=external-prompt-200'

    // The new item is at index 0, img_B is now at index 2
    expect(result.current.sortedDisplayImages[0]).toBe(newUrl)
    expect(result.current.sortedDisplayImages[2]).toBe('img_B.png')

    // The modal index should be adjusted so the user is STILL viewing img_B.png
    expect(result.current.modalPreviewIndex).toBe(2)
    expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_B.png')
  })

  it('AC-4: Own session execution correctly updates selectedImg, batchImages, and resets previewImage', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

    useGenerationStore.setState({
      currentPromptId: 'own-prompt-300',
      isGenerating: true,
      previewImage: 'blob:http://localhost/active-preview',
      selectedImg: 'old_selected.png',
      batchImages: ['old_batch.png'],
      comfyHistoryImages: ['old_history.png'],
    })

    act(() => {
      wsInstance.onmessage?.({
        data: JSON.stringify({
          type: 'executed',
          data: {
            prompt_id: 'own-prompt-300',
            output: {
              images: [{ filename: 'my_new_art.png', subfolder: '', type: 'output' }],
            },
          },
        }),
      })
    })

    const state = useGenerationStore.getState()
    const expectedUrl = 'http://localhost:3000/comfy/view?filename=my_new_art.png&subfolder=&type=output&t=own-prompt-300'

    expect(state.selectedImg).toBe(expectedUrl)
    expect(state.batchImages[0]).toBe(expectedUrl)
    expect(state.comfyHistoryImages[0]).toBe(expectedUrl)
    expect(state.previewImage).toBeNull()
    expect(state.isGenerating).toBe(false)
    expect(state.currentPromptId).toBeNull()
  })

  it('Red Teaming: handles malformed, empty images, or unexpected output without crashing or state corruption', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188')
    useGenerationStore.getState().initialize()
    const wsInstance = createdWsList[0]

    useGenerationStore.setState({
      currentPromptId: null,
      selectedImg: 'stable_image.png',
      comfyHistoryImages: ['existing1.png'],
    })

    // Case 1: output without images
    expect(() => {
      wsInstance.onmessage?.({
        data: JSON.stringify({
          type: 'executed',
          data: {
            prompt_id: 'bad-prompt-1',
            output: {},
          },
        }),
      })
    }).not.toThrow()

    // Case 2: output with empty images array
    expect(() => {
      wsInstance.onmessage?.({
        data: JSON.stringify({
          type: 'executed',
          data: {
            prompt_id: 'bad-prompt-2',
            output: { images: [] },
          },
        }),
      })
    }).not.toThrow()

    // Case 3: completely empty data object
    expect(() => {
      wsInstance.onmessage?.({
        data: JSON.stringify({
          type: 'executed',
          data: {},
        }),
      })
    }).not.toThrow()

    const state = useGenerationStore.getState()
    expect(state.selectedImg).toBe('stable_image.png')
    expect(state.comfyHistoryImages).toEqual(['existing1.png'])
  })
})
