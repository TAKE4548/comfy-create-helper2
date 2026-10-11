import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeGenerationEnvelope,
  decodeGenerationSnapshot,
  decodeResidualHistoryResponse,
  generationApi,
  GenerationApiError,
  type BatchRequest,
  type CancelOperation,
  type GenerationSnapshot,
  type ImageAvailability,
  type ResidualHistoryRequest,
} from '../generation'

const snapshot: GenerationSnapshot = {
  version: 1,
  epoch: 'epoch-1',
  revision: 7,
  normal_group_id: 'normal-group-1',
  jobs: [
    {
      job_id: 'job-1',
      request_id: 'request-1',
      prompt_id: 'prompt-1',
      session_id: 'session-1',
      scope: 'normal',
      batch_id: 'batch-1',
      normal_group_id: 'normal-group-1',
      project_id: null,
      status: 'queued',
      started_at: null,
      finished_at: null,
      node: null,
      outputs: [],
      failure: null,
    },
  ],
  batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: null }],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generationApi', () => {
  it('submits the frozen batch once and returns the accepted receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ batch_id: 'batch-1', job_ids: ['job-1'], epoch: 'epoch-1', revision: 8 }, 202)
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const body: BatchRequest = {
      request_id: 'request-1',
      session_id: 'session-1',
      scope: 'normal',
      items: [{ graph: { node: { seed: 0 } }, param_values: { seed: 0, enabled: false } }],
    }

    await expect(generationApi.submitBatch(body, controller.signal)).resolves.toEqual({
      batch_id: 'batch-1', job_ids: ['job-1'], epoch: 'epoch-1', revision: 8,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/generation/batches', expect.objectContaining({
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify(body),
    }))
  })

  it('decodes the exact nullable state shape and rejects an unsupported version', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(snapshot))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.getState()).resolves.toEqual(snapshot)
    expect(fetchMock).toHaveBeenCalledWith('/api/generation/state', expect.any(Object))

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...snapshot, version: 2 }))
    await expect(generationApi.getState()).rejects.toThrow(/unsupported generation.*version/i)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['missing snapshot nullable field', (() => {
      const { normal_group_id: _normalGroupId, ...malformed } = snapshot
      return malformed
    })()],
    ['fractional revision', { ...snapshot, revision: 1.5 }],
    ['null managed job', { ...snapshot, jobs: [null] }],
    ['invalid job scope', { ...snapshot, jobs: [{ ...snapshot.jobs[0], scope: 'legacy' }] }],
    ['missing job nullable field', { ...snapshot, jobs: [(({ prompt_id: _promptId, ...job }) => job)(snapshot.jobs[0])] }],
    ['invalid nested node', { ...snapshot, jobs: [{ ...snapshot.jobs[0], node: { id: 'n1', name: 'Sampler', value: '1', max: 2 } }] }],
    ['invalid output availability', { ...snapshot, jobs: [{ ...snapshot.jobs[0], outputs: [{ node_id: 'n1', index: 0, view_url: '/view', thumbnail_url: '/thumb', availability: 'gone' }] }] }],
    ['missing failure outcome', { ...snapshot, jobs: [{ ...snapshot.jobs[0], failure: { reason: 'error' } }] }],
    ['fractional batch project id', { ...snapshot, batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: 1.5 }] }],
    ['invalid upstream status', { ...snapshot, upstream: { http_ready: 1, ws_connected: true, failure_since: null } }],
    ['missing upstream nullable field', { ...snapshot, upstream: { http_ready: true, ws_connected: true } }],
  ])('rejects malformed snapshot contract: %s', async (_case, malformed) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(malformed)))

    await expect(generationApi.getState()).rejects.toThrow(/invalid generation state response/i)
  })

  it('rejects a non-finite snapshot revision', async () => {
    const body = JSON.stringify(snapshot).replace('"revision":7', '"revision":1e400')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(generationApi.getState()).rejects.toThrow(/invalid generation state response/i)
  })

  it('exports the shared snapshot decoder for WebSocket consumers', () => {
    expect(decodeGenerationSnapshot(snapshot)).toEqual(snapshot)
    expect(() => decodeGenerationSnapshot({ ...snapshot, jobs: [{ ...snapshot.jobs[0], outputs: [null] }] }))
      .toThrow(/invalid generation state response/i)
  })

  it.each([
    ['unknown envelope type', { type: 'OTHER', version: 1, epoch: 'epoch-1', revision: 7, data: snapshot }],
    ['unsupported envelope version', { type: 'GENERATION_EVENT', version: 2, epoch: 'epoch-1', revision: 7, data: snapshot }],
    ['mismatched epoch', { type: 'GENERATION_EVENT', version: 1, epoch: 'other', revision: 7, data: snapshot }],
    ['mismatched revision', { type: 'GENERATION_SNAPSHOT', version: 1, epoch: 'epoch-1', revision: 8, data: snapshot }],
    ['invalid nested job', { type: 'GENERATION_EVENT', version: 1, epoch: 'epoch-1', revision: 7, data: { ...snapshot, jobs: [{ ...snapshot.jobs[0], failure: { reason: 1, outcome: 'failed' } }] } }],
  ])('rejects malformed generation envelope: %s', (_name, envelope) => {
    expect(() => decodeGenerationEnvelope(envelope)).toThrow(/invalid generation envelope/i)
  })

  it('looks up a lost acceptance receipt without resubmitting the mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ batch_id: 'batch-2', job_ids: ['job-2'] })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.getRequest('request /?')).resolves.toEqual({
      batch_id: 'batch-2', job_ids: ['job-2'],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/generation/requests/request%20%2F%3F', expect.any(Object))
  })

  it('normalizes a lost mutation response as unconfirmed without retrying', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const body: BatchRequest = {
      request_id: 'request-uncertain',
      session_id: 'session-1',
      scope: 'normal',
      items: [{ graph: {}, param_values: { seed: 0 } }],
    }

    await expect(generationApi.submitBatch(body)).rejects.toMatchObject({
      status: 0,
      detail: {
        code: 'network_error',
        outcome: 'unconfirmed',
        request_id: null,
        job_id: null,
      },
    } satisfies Partial<GenerationApiError>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('supports scoped cancellation separately from selected single-job cancellation', async () => {
    const operation: CancelOperation = {
      scope: 'normal',
      message: 'Studio job protected',
      mode: 'all',
      items: [{
        job_id: 'normal-job', prompt_id: 'normal-prompt', status: 'running',
        outcome: 'not_cancelled', message: 'interrupt skipped to protect Studio',
      }],
      upstream_clear: 'confirmed',
      upstream_interrupt: 'skipped',
      epoch: 'epoch-1',
      revision: 9,
    }
    const single = {
      job_id: null, prompt_id: 'legacy/prompt', status: 'cancelled' as const,
      outcome: 'cancelled' as const, message: 'cancelled',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(operation))
      .mockResolvedValueOnce(jsonResponse(single))
      .mockResolvedValueOnce(jsonResponse(single))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.cancel({ mode: 'all', scope: 'normal' })).resolves.toEqual(operation)
    await expect(generationApi.cancelJob('legacy/prompt')).resolves.toEqual(single)
    await expect(generationApi.cancelJob('job/guarded', true)).resolves.toEqual(single)
    expect(fetchMock.mock.calls[0]).toMatchObject([
      '/api/generation/cancel',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ mode: 'all', scope: 'normal' }) }),
    ])
    expect(fetchMock.mock.calls[1]).toMatchObject([
      '/api/generation/jobs/legacy%2Fprompt/cancel',
      expect.objectContaining({ method: 'POST' }),
    ])
    expect(fetchMock.mock.calls[2]).toMatchObject([
      '/api/generation/jobs/job%2Fguarded/cancel?only_unsubmitted=true',
      expect.objectContaining({ method: 'POST' }),
    ])
  })

  it('reads the upstream queue without inventing legacy job UUIDs', async () => {
    const queue = {
      running: [{ prompt_id: 'legacy-prompt', client_id: null }],
      pending: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(queue))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.getUpstreamQueue()).resolves.toEqual(queue)
    expect(fetchMock).toHaveBeenCalledWith('/api/generation/upstream-queue', expect.any(Object))
  })

  it('requests residual history with the exact known identities and signal', async () => {
    const body: ResidualHistoryRequest = {
      known: [{ filename: 'known.png', subfolder: 'output', type: 'output' }],
      examined: [{ filename: 'gone.png', subfolder: '', type: 'temp' }],
    }
    const result = {
      items: [{ identity: { filename: 'new.png', subfolder: '', type: 'output' },
        view_url: '/api/comfy/view?filename=new.png&subfolder=&type=output', session_id: null, availability: 'present' }],
      rejected: [], has_more: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(generationApi.residualHistory(body, controller.signal)).resolves.toEqual(result)
    expect(fetchMock).toHaveBeenCalledWith('/api/generation/history/residual', expect.objectContaining({
      method: 'POST', body: JSON.stringify(body), signal: controller.signal,
    }))
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(decodeResidualHistoryResponse(result)).toEqual(result)
    expect(JSON.stringify(result)).not.toContain('host')
    expect(JSON.stringify(result)).not.toContain(' t=')
  })

  it('rejects malformed residual history and preserves HTTP failures without fallback', async () => {
    const malformed = [
      { items: [], rejected: [], has_more: true },
      { items: [{ identity: { filename: 'x', subfolder: '', type: 'output' }, view_url: 'https://evil.test/api/comfy/view?filename=x&subfolder=&type=output', session_id: null, availability: 'present' }], rejected: [], has_more: false },
      { items: [{ identity: { filename: 'x', subfolder: '', type: 'output' }, view_url: '/api/comfy/view?filename=y&subfolder=&type=output', session_id: null, availability: 'present' }], rejected: [], has_more: false },
      { items: [], rejected: [], has_more: false, extra: true },
    ]
    for (const value of malformed) expect(() => decodeResidualHistoryResponse(value)).toThrow(/invalid residual history response/i)

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'bad request' }, 422))
      .mockResolvedValueOnce(jsonResponse({ detail: 'unavailable' }, 503))
    vi.stubGlobal('fetch', fetchMock)
    const request = { known: [], examined: [] }
    await expect(generationApi.residualHistory(request)).rejects.toMatchObject({ status: 422 })
    await expect(generationApi.residualHistory(request)).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/generation/history/residual')).toBe(true)
  })

  it('uses image identity for legacy originals and preserves unavailable as unknown', async () => {
    const availability: ImageAvailability = { availability: 'unknown' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(availability))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.imageAvailability({
      filename: 'image a.png', subfolder: 'output/one', type: 'output',
    })).resolves.toEqual(availability)
    await expect(generationApi.availability('job/1')).resolves.toEqual([])
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/comfy/image-availability?filename=image+a.png&subfolder=output%2Fone&type=output'
    )
    expect(fetchMock.mock.calls[1][0]).toBe('/api/generation/images/job%2F1/availability')
  })

  it('normalizes typed and legacy HTTP errors while keeping 404 availability errors distinct', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        detail: { code: 'queue_unavailable', message: 'queue unavailable', outcome: 'unconfirmed', request_id: null, job_id: null },
      }, 503))
      .mockResolvedValueOnce(jsonResponse({ detail: 'old route not found' }, 404))
      .mockResolvedValueOnce(jsonResponse({ detail: 'image route unavailable' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    const typed = generationApi.getUpstreamQueue()
    await expect(typed).rejects.toMatchObject({
      status: 503,
      detail: { code: 'queue_unavailable', outcome: 'unconfirmed' },
    } satisfies Partial<GenerationApiError>)

    await expect(generationApi.availability('job-404')).rejects.toMatchObject({
      status: 404,
      detail: { message: 'old route not found' },
    })
    await expect(generationApi.availability('job-503')).rejects.toMatchObject({
      status: 503,
      detail: { message: 'image route unavailable' },
    })
  })
})
