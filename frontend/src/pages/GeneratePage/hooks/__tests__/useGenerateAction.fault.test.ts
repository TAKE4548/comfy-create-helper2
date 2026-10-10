import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
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
    vi.useRealTimers()
    useGenerationStore.setState({
      isGenerating: false,
      isBatchSubmitting: false,
      errorToast: null,
      vramWaitStatus: null,
      generationSnapshot: null,
      systemStats: null,
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

  const installAcceptedQueuedBatch = () => {
    let batchRequests = 0
    let guardedCancels: string[] = []
    server.use(
      http.post('/api/generation/batches', () => {
        batchRequests += 1
        return HttpResponse.json({ batch_id: 'accepted-batch', job_ids: ['accepted-job'], epoch: 'epoch', revision: 1 }, { status: 202 })
      }),
      http.get('/api/generation/state', () => HttpResponse.json({
        version: 1, epoch: 'epoch', revision: 1, normal_group_id: 'group',
        jobs: [{
          job_id: 'accepted-job', request_id: 'request', prompt_id: null, session_id: useGenerationStore.getState().clientId,
          scope: 'normal', batch_id: 'accepted-batch', normal_group_id: 'group', project_id: null,
          status: 'queued', started_at: null, finished_at: null, node: null, outputs: [], failure: null,
        }],
        batches: [{ batch_id: 'accepted-batch', scope: 'normal', project_id: null }],
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
      })),
      http.get('/api/generation/upstream-queue', () => HttpResponse.json({ running: [], pending: [] })),
      http.get('/api/comfy/history', () => HttpResponse.json({})),
      http.post('/api/generation/jobs/accepted-job/cancel', ({ request }) => {
        guardedCancels.push(new URL(request.url).search)
        return HttpResponse.json({
          job_id: 'accepted-job', prompt_id: null, status: 'cancelled', outcome: 'cancelled', message: 'cancelled',
        })
      }),
    )
    return { get batchRequests() { return batchRequests }, guardedCancels }
  }

  it('tracks low VRAM with the real Zustand subscription, warns once, and stops on recovery', async () => {
    vi.useFakeTimers()
    const serverBatch = installAcceptedQueuedBatch()
    useGenerationStore.setState({
      generationSnapshot: null,
      vramWaitStatus: null,
      systemStats: { vram_safe: false, vram_free_gb: 1, vram_min_free_gb: 6 } as any,
    })
    const warningSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast')
    const { result } = renderHook(() => useGenerateAction(dummyWorkflow))

    await act(async () => { await result.current.handleGenerate() })
    expect(serverBatch.batchRequests).toBe(1)
    expect(useGenerationStore.getState().vramWaitStatus).toMatchObject({ isWaiting: true, freeGb: 1, requiredGb: 6 })

    act(() => { vi.advanceTimersByTime(20_000) })
    expect(warningSpy.mock.calls.filter(([toast]) => toast.type === 'warning')).toHaveLength(1)
    expect(useGenerationStore.getState().vramWaitStatus?.waitDurationSec).toBe(20)

    act(() => {
      useGenerationStore.setState({ systemStats: { vram_safe: true, vram_free_gb: 12, vram_min_free_gb: 6 } as any })
    })
    expect(useGenerationStore.getState().vramWaitStatus).toBeNull()
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(warningSpy.mock.calls.filter(([toast]) => toast.type === 'warning')).toHaveLength(1)
    expect(serverBatch.batchRequests).toBe(1)
    warningSpy.mockRestore()
  })

  it('explicit wait cancellation clears monitoring and sends only the accepted job guard', async () => {
    const serverBatch = installAcceptedQueuedBatch()
    useGenerationStore.setState({
      generationSnapshot: null,
      vramWaitStatus: null,
      systemStats: { vram_safe: false, vram_free_gb: 1, vram_min_free_gb: 6 } as any,
    })
    const { result, unmount } = renderHook(() => useGenerateAction(dummyWorkflow))
    await act(async () => { await result.current.handleGenerate() })
    expect(useGenerationStore.getState().vramWaitStatus?.isWaiting).toBe(true)

    unmount()
    expect(serverBatch.guardedCancels).toEqual([])
    act(() => { useGenerationStore.getState().cancelVramWait() })
    await waitFor(() => expect(serverBatch.guardedCancels).toEqual(['?only_unsubmitted=true']))
    expect(useGenerationStore.getState().vramWaitStatus).toBeNull()
    expect(serverBatch.batchRequests).toBe(1)
    expect(serverBatch.guardedCancels).toEqual(['?only_unsubmitted=true'])
  })

  it('handles HTTP 503 during handleGenerate safely without crashing and shows error toast', async () => {
    server.use(
      http.post('/api/generation/batches', () => {
        return HttpResponse.json({ detail: { code: 'upstream_unavailable', message: 'Service Unavailable', outcome: 'failed' } }, { status: 503 })
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
    expect(state.errorToast?.message).toContain('キュー投入に失敗しました')
    expect(state.errorToast?.message).toContain('Service Unavailable')
  })

  it('handles network error (HttpResponse.error) during handleGenerate safely', async () => {
    server.use(
      http.post('/api/generation/batches', () => {
        return HttpResponse.error()
      }),
      http.get('/api/generation/requests/:requestId', () => HttpResponse.json({ status: 'not_found' }, { status: 404 }))
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
      http.post('/api/generation/batches', () => {
        return HttpResponse.json({ detail: { code: 'upstream_unavailable', message: 'ComfyUI overloaded', outcome: 'failed' } }, { status: 503 })
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
