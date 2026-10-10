import { describe, expect, it } from 'vitest'
import type { GenerationSnapshot, JobView, Scope } from '../generationSelectors'
import { selectProgress, selectWait } from '../generationSelectors'

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

  it('counts queued, submitting, running, and unconfirmed blockers but ignores terminal rows', () => {
    const state = snapshot([
      job('target', 'normal', 'queued'),
      job('running', 'normal', 'running', { session_id: 'session-b' }),
      job('queued', 'normal', 'queued', { session_id: 'session-b' }),
      job('submitting', 'normal', 'submitting', { session_id: 'session-b' }),
      job('failed', 'normal', 'failed', { session_id: 'session-b' }),
      job('succeeded', 'normal', 'succeeded', { session_id: 'session-b' }),
      job('cancelled', 'normal', 'cancelled', { session_id: 'session-b' }),
      job('unconfirmed', 'normal', 'unconfirmed', { session_id: 'session-b' })
    ])
    expect(selectWait(state, 'normal', 'session-a')).toEqual({ kind: 'session', remaining: 4, label: '別セッションの通常生成' })
  })
})
