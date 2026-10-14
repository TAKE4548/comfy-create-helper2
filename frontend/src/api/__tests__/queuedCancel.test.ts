import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeGenerationSnapshot, generationApi, type GenerationSnapshot } from '../domains/generation'

const snapshot: GenerationSnapshot = {
  version: 1,
  epoch: 'epoch-1',
  revision: 1,
  normal_group_id: null,
  jobs: [{
    job_id: 'job-1', request_id: 'request-1', prompt_id: 'prompt-1', session_id: 'session-1',
    scope: 'normal', batch_id: 'batch-1', normal_group_id: null, project_id: null,
    status: 'queued', started_at: null, finished_at: null, node: null, outputs: [], failure: null,
  }],
  batches: [{ batch_id: 'batch-1', scope: 'normal', project_id: null }],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('queued cancel API contract', () => {
  it('keeps old snapshots valid and accepts nullable optional job metadata', () => {
    expect(decodeGenerationSnapshot(snapshot)).toEqual(snapshot)
    expect(decodeGenerationSnapshot({
      ...snapshot,
      jobs: [{ ...snapshot.jobs[0], set_name: 'Favorites', prompt_excerpt: 'a prompt' }],
    }).jobs[0]).toMatchObject({ set_name: 'Favorites', prompt_excerpt: 'a prompt' })
    expect(decodeGenerationSnapshot({
      ...snapshot,
      jobs: [{ ...snapshot.jobs[0], set_name: null, prompt_excerpt: null }],
    }).jobs[0]).toMatchObject({ set_name: null, prompt_excerpt: null })
  })

  it.each(['set_name', 'prompt_excerpt'] as const)('rejects non-string %s when present', (field) => {
    expect(() => decodeGenerationSnapshot({
      ...snapshot,
      jobs: [{ ...snapshot.jobs[0], [field]: 42 }],
    })).toThrow(/invalid generation state response/i)
  })

  it('sends only_queued without changing legacy/default cancel URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await generationApi.cancelJob('legacy/prompt')
    await generationApi.cancelJob('job/unsubmitted', true)
    await generationApi.cancelJob('job/queued', false, true)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/generation/jobs/legacy%2Fprompt/cancel',
      '/api/generation/jobs/job%2Funsubmitted/cancel?only_unsubmitted=true',
      '/api/generation/jobs/job%2Fqueued/cancel?only_queued=true',
    ])
    expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'POST')).toBe(true)
  })

  it('refuses mutually exclusive cancel guards without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(generationApi.cancelJob('job-1', true, true)).rejects.toThrow(/cannot be combined/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
