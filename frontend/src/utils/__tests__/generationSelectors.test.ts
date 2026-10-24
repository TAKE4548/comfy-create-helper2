import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { GenerationSnapshot, JobView, Scope } from '../generationSelectors'
import { selectProgress, selectReleasedJobs, selectUnconfirmedJobs, selectWait } from '../generationSelectors'

const ALL_STATUSES: JobView['status'][] = [
  'queued', 'submitting', 'running', 'succeeded', 'failed', 'cancelled', 'unconfirmed', 'released',
]

const job = (
  id: string,
  scope: Scope,
  status: JobView['status'],
  options: Partial<JobView> = {}
): JobView => ({
  job_id: id,
  request_id: `request-${id}`,
  prompt_id: null,
  session_id: 'session-a',
  scope,
  batch_id: `batch-${id}`,
  normal_group_id: scope === 'normal' ? 'normal-current' : null,
  project_id: scope === 'studio' ? 3 : null,
  status,
  started_at: null,
  finished_at: null,
  node: null,
  outputs: [],
  failure: null,
  ...options
})

const snapshot = (jobs: JobView[], batches?: GenerationSnapshot['batches']): GenerationSnapshot => ({
  version: 1,
  epoch: 'epoch-1',
  revision: 1,
  normal_group_id: 'normal-current',
  jobs,
  batches: batches ?? jobs.map((item) => ({ batch_id: item.batch_id, scope: item.scope, project_id: item.project_id })),
  upstream: { http_ready: true, ws_connected: true, failure_since: null }
})

describe('selectProgress', () => {
  it('uses current normal group across sessions unless the self-only session filter is active', () => {
    const state = snapshot([
      job('succeeded-self', 'normal', 'succeeded'),
      job('failed-other', 'normal', 'failed', { session_id: 'session-b' }),
      job('running-other', 'normal', 'running', {
        session_id: 'session-b',
        node: { id: 'current-node', name: 'KSampler', value: 4, max: 8 }
      }),
      job('queued-other-group', 'normal', 'queued', { normal_group_id: 'older-group' }),
      job('studio', 'studio', 'running', { batch_id: 'studio-batch' })
    ])

    expect(selectProgress(state, 'normal', null)).toEqual({ finished: 2, total: 3, fraction: 2.5 / 3, idle: false })
    expect(selectProgress(state, 'normal', 'session-a')).toEqual({ finished: 1, total: 1, fraction: 1, idle: false })
  })

  it('counts failures as finished and removes normal cancellations from N', () => {
    const state = snapshot([
      job('ok', 'normal', 'succeeded'),
      job('failed', 'normal', 'failed'),
      job('cancelled', 'normal', 'cancelled'),
      job('queued', 'normal', 'queued')
    ])
    expect(selectProgress(state, 'normal', null)).toEqual({ finished: 2, total: 3, fraction: 2 / 3, idle: false })
    expect(selectProgress(snapshot([], []), 'normal', null)).toEqual({ finished: 0, total: 0, fraction: 0, idle: true })
  })

  it('isolates Studio to the requested batch and retains canceled batch rows outside F', () => {
    const state = snapshot([
      job('succeeded', 'studio', 'succeeded', { batch_id: 'batch-current' }),
      job('failed', 'studio', 'failed', { batch_id: 'batch-current' }),
      job('cancelled', 'studio', 'cancelled', { batch_id: 'batch-current' }),
      job('queued', 'studio', 'queued', { batch_id: 'batch-current' }),
      job('other-batch', 'studio', 'running', { batch_id: 'batch-other' }),
      job('normal', 'normal', 'running')
    ])

    expect(selectProgress(state, 'studio', null)).toEqual({ finished: 0, total: 0, fraction: 0, idle: true })
    expect(selectProgress(state, 'studio', null, 'batch-current')).toEqual({ finished: 2, total: 4, fraction: 0.5, idle: false })
  })

  it.each([
    [{ id: 'node', name: 'Node', value: 100, max: 50 }, 1],
    [{ id: 'node', name: 'Node', value: -3, max: 50 }, 0],
    [{ id: 'node', name: 'Node', value: 1, max: 0 }, 0],
    [{ id: 'node', name: 'Node', value: Number.NaN, max: 50 }, 0],
    [{ id: 'node', name: 'Node', value: 3, max: Number.POSITIVE_INFINITY }, 0]
  ])('clamps only a finite current-node fraction with max > 0', (node, expectedFraction) => {
    const state = snapshot([job('running', 'normal', 'running', { node })])
    expect(selectProgress(state, 'normal', null).fraction).toBe(expectedFraction)
  })
})

describe('selectWait', () => {
  it('returns no wait without an unfinished target, when the target is running, or without a running blocker', () => {
    expect(selectWait(snapshot([job('blocker', 'studio', 'running')]), 'normal', 'session-a')).toBeNull()
    expect(selectWait(snapshot([
      job('normal-self', 'normal', 'running'),
      job('studio-blocker', 'studio', 'running', { batch_id: 'studio-batch' })
    ]), 'normal', 'session-a')).toBeNull()
    expect(selectWait(snapshot([
      job('normal-self', 'normal', 'queued'),
      job('studio-queued', 'studio', 'queued', { batch_id: 'studio-batch' })
    ]), 'normal', 'session-a')).toBeNull()
  })

  it('prioritizes another scope with a running blocker and counts its full unfinished collection', () => {
    const studioJobs = [
      job('studio-running', 'studio', 'running', { batch_id: 'studio-batch' }),
      ...Array.from({ length: 7 }, (_, index) => job(`studio-queued-${index}`, 'studio', 'queued', { batch_id: 'studio-batch' }))
    ]
    const state = snapshot([
      job('normal-self', 'normal', 'queued'),
      job('normal-other-running', 'normal', 'running', { session_id: 'session-b' }),
      ...studioJobs
    ])
    expect(selectWait(state, 'normal', 'session-a')).toEqual({ kind: 'scope', remaining: 8, label: 'Studio' })
  })

  it('shows same-scope other-session wait only when filtered and another session is running', () => {
    const state = snapshot([
      job('normal-self', 'normal', 'queued'),
      job('normal-other-running', 'normal', 'running', { session_id: 'session-b' }),
      job('normal-other-queued', 'normal', 'queued', { session_id: 'session-b' }),
      job('normal-other-failed', 'normal', 'failed', { session_id: 'session-b' }),
      job('normal-canceled', 'normal', 'cancelled', { session_id: 'session-b' })
    ])
    expect(selectWait(state, 'normal', 'session-a')).toEqual({ kind: 'session', remaining: 2, label: '別セッションの通常生成' })

    const unfiltered = snapshot([
      job('normal-self', 'normal', 'queued'),
      job('normal-other-running', 'normal', 'running', { session_id: 'session-b' })
    ])
    expect(selectWait(unfiltered, 'normal', null)).toBeNull()
  })

  it('waits only for a running other Studio batch and keeps that batch isolated', () => {
    const state = snapshot([
      job('studio-current', 'studio', 'queued', { batch_id: 'current' }),
      job('studio-other-running', 'studio', 'running', { batch_id: 'other', project_id: 9 }),
      job('studio-other-queued', 'studio', 'queued', { batch_id: 'other', project_id: 9 }),
      job('studio-third-queued', 'studio', 'queued', { batch_id: 'third', project_id: 10 })
    ])
    expect(selectWait(state, 'studio', null)).toBeNull()
    expect(selectWait(state, 'studio', null, 'current')).toEqual({
      kind: 'batch',
      remaining: 2,
      label: '別Studioバッチ (project 9)'
    })

    const runningTarget = snapshot([
      job('studio-current-running', 'studio', 'running', { batch_id: 'current' }),
      job('studio-other-running', 'studio', 'running', { batch_id: 'other' })
    ])
    expect(selectWait(runningTarget, 'studio', null, 'current')).toBeNull()
  })

  it('[REQ-335/AC-1] counts queued, submitting and running blockers but ignores terminal, unconfirmed and released rows', () => {
    const state = snapshot([
      job('target', 'normal', 'queued'),
      job('running', 'normal', 'running', { session_id: 'session-b' }),
      job('queued', 'normal', 'queued', { session_id: 'session-b' }),
      job('submitting', 'normal', 'submitting', { session_id: 'session-b' }),
      job('failed', 'normal', 'failed', { session_id: 'session-b' }),
      job('succeeded', 'normal', 'succeeded', { session_id: 'session-b' }),
      job('cancelled', 'normal', 'cancelled', { session_id: 'session-b' }),
      job('unconfirmed', 'normal', 'unconfirmed', { session_id: 'session-b' }),
      job('released', 'normal', 'released', { session_id: 'session-b' })
    ])
    expect(selectWait(state, 'normal', 'session-a')).toEqual({ kind: 'session', remaining: 3, label: '別セッションの通常生成' })
  })

  it('[REQ-335/AC-1] excludes unconfirmed and released from normal N, F and wait counts', () => {
    const state = snapshot([
      job('succeeded', 'normal', 'succeeded'),
      job('unconfirmed', 'normal', 'unconfirmed'),
      job('released', 'normal', 'released'),
      job('queued', 'normal', 'queued')
    ])
    expect(selectProgress(state, 'normal', null)).toMatchObject({ finished: 1, total: 2 })
    expect(selectProgress(snapshot([job('only-unconfirmed', 'normal', 'unconfirmed')]), 'normal', null)).toMatchObject({ total: 0, idle: true })
    const studio = snapshot([
      job('succeeded', 'studio', 'succeeded', { batch_id: 'batch-x' }),
      job('released', 'studio', 'released', { batch_id: 'batch-x' }),
      job('unconfirmed', 'studio', 'unconfirmed', { batch_id: 'batch-x' })
    ])
    expect(selectProgress(studio, 'studio', null, 'batch-x')).toMatchObject({ finished: 1, total: 2 })
  })

  it('[REQ-335/AC-1] selectUnconfirmedJobs returns out-of-group rows and honours the session filter', () => {
    const state = snapshot([
      job('old-group-a', 'normal', 'unconfirmed', { normal_group_id: 'older-group', session_id: 'session-a' }),
      job('current-b', 'normal', 'unconfirmed', { session_id: 'session-b' }),
      job('current-a', 'normal', 'unconfirmed', { session_id: 'session-a' }),
      job('queued', 'normal', 'queued')
    ])
    expect(selectUnconfirmedJobs(state).map((item) => item.job_id)).toEqual(['old-group-a', 'current-b', 'current-a'])
    expect(selectUnconfirmedJobs(state, 'session-a').map((item) => item.job_id)).toEqual(['old-group-a', 'current-a'])
  })

  it('[REQ-335/AC-1] selectReleasedJobs sorts newest first and applies the limit', () => {
    const released = (id: string, at: string, session = 'session-a') => job(id, 'normal', 'released', {
      session_id: session,
      release: { released_at: at, released_by_session: null, reason: 'user_release', upstream_check: 'not_found', late_prompt_id: null },
    })
    const state = snapshot([
      released('r-old', '2026-10-20T00:00:00Z'),
      released('r-new', '2026-10-24T00:00:00Z'),
      released('r-other', '2026-10-25T00:00:00Z', 'session-b'),
      released('r-mid', '2026-10-22T00:00:00Z'),
    ])
    expect(selectReleasedJobs(state, null, 2).map((item) => item.job_id)).toEqual(['r-other', 'r-new'])
    expect(selectReleasedJobs(state, 'session-a').map((item) => item.job_id)).toEqual(['r-new', 'r-mid', 'r-old'])
  })

  it('[REQ-335/AC-4] unconfirmed rows never count as blockers for another scope wait', () => {
    const onlyUnconfirmed = snapshot([
      job('studio-target', 'studio', 'queued', { batch_id: 'current' }),
      job('normal-unconfirmed', 'normal', 'unconfirmed'),
    ])
    expect(selectWait(onlyUnconfirmed, 'studio', null, 'current')).toBeNull()

    const withRunning = snapshot([
      job('studio-target', 'studio', 'queued', { batch_id: 'current' }),
      job('normal-running', 'normal', 'running'),
      job('normal-unconfirmed', 'normal', 'unconfirmed'),
      job('normal-queued', 'normal', 'queued'),
    ])
    expect(selectWait(withRunning, 'studio', null, 'current')).toEqual({ kind: 'scope', remaining: 2, label: '通常生成' })
  })

  it('[REQ-335/AC-1] property: progress invariants hold for arbitrary status multisets', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom(...ALL_STATUSES), { maxLength: 30 }), (statuses) => {
      const state = snapshot(statuses.map((status, index) => job(`j${index}`, 'normal', status)))
      const progress = selectProgress(state, 'normal', null)
      expect(progress.fraction).toBeGreaterThanOrEqual(0)
      expect(progress.fraction).toBeLessThanOrEqual(1)
      expect(progress.finished).toBeLessThanOrEqual(progress.total)
      expect(progress.total).toBe(statuses.filter((status) => status !== 'cancelled' && status !== 'released' && status !== 'unconfirmed').length)
      if (progress.total === 0) expect(progress.idle).toBe(true)
    }), { numRuns: 100 })
  })
})
