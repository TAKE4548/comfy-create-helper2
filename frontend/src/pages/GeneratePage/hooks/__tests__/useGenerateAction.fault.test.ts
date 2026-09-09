import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/mocks/server'
import { useGenerateAction } from '../useGenerateAction'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { Workflow } from '../../../../api/types'

describe('useGenerateAction - Fault Injection Tests (MSW)', () => {
  const dummyWorkflow: Workflow = {
    id: 1,
    name: 'Fault Test Workflow',
    created_at: '2026-09-09T00:00:00Z',
    mappings: [],
    json_body: {
      '1': {
        inputs: { seed: 12345, text: 'test prompt' },
        class_type: 'KSampler',
      },
    },
  }

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
    useGenerationStore.setState({
      isGenerating: false,
      isBatchSubmitting: false,
      errorToast: null,
      sets: [],
      activeBatch: null,
      paramValues: { text: 'test prompt' },
      batchSize: 1,
      seedMode: 'fixed',
      seed: 42,
    })
  })

  afterAll(() => {
    server.close()
  })

  it('handles HTTP 503 during handleGenerate safely without crashing and shows error toast', async () => {
    server.use(
      http.post('/api/comfy/prompt', () => {
        return new HttpResponse('Service Unavailable', { status: 503 })
      })
    )

    const { result } = renderHook(() => useGenerateAction(dummyWorkflow))

    await act(async () => {
      await result.current.handleGenerate()
    })

    const state = useGenerationStore.getState()
    expect(state.isGenerating).toBe(false)
    expect(state.isBatchSubmitting).toBe(false)
    expect(state.errorToast).not.toBeNull()
    expect(state.errorToast?.type).toBe('error')
    expect(state.errorToast?.message).toMatch(/503/)
  })

  it('handles network error (HttpResponse.error) during handleGenerate safely', async () => {
    server.use(
      http.post('/api/comfy/prompt', () => {
        return HttpResponse.error()
      })
    )

    const { result } = renderHook(() => useGenerateAction(dummyWorkflow))

    await act(async () => {
      await result.current.handleGenerate()
    })

    const state = useGenerationStore.getState()
    expect(state.isGenerating).toBe(false)
    expect(state.isBatchSubmitting).toBe(false)
    expect(state.errorToast).not.toBeNull()
    expect(state.errorToast?.type).toBe('error')
  })

  it('marks failed set job as status "failed" and sets error toast when handleGenerateSets encounters 503', async () => {
    server.use(
      http.post('/api/comfy/prompt', () => {
        return new HttpResponse('ComfyUI overloaded', { status: 503 })
      })
    )

    useGenerationStore.setState({
      sets: [
        {
          id: 'set-1',
          name: 'Set Alpha',
          checked: true,
          batchSize: 2,
          seedMode: 'fixed',
          seed: 100,
          paramValues: { text: 'alpha prompt' },
        },
      ],
    })

    const { result } = renderHook(() => useGenerateAction(dummyWorkflow))

    await act(async () => {
      await result.current.handleGenerateSets()
    })

    const state = useGenerationStore.getState()
    expect(state.isBatchSubmitting).toBe(false)
    expect(state.errorToast).not.toBeNull()
    expect(state.errorToast?.type).toBe('error')
    expect(state.errorToast?.message).toContain('キュー投入に失敗しました')

    expect(state.activeBatch).toHaveLength(2)
    expect(state.activeBatch?.[0].status).toBe('failed')
    expect(state.activeBatch?.[1].status).toBe('failed')
  })
})
