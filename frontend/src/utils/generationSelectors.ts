export type Scope = 'normal' | 'studio'

export type JobStatus =
  | 'queued'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unconfirmed'
  | 'released'

export interface GenerationItem {
  graph: Record<string, unknown>
  workflow_id?: number
  param_values: Record<string, unknown>
  applied_assets?: Record<string, unknown>
  set_name?: string
}

export interface BatchRequest {
  request_id: string
  session_id: string
  scope: Scope
  project_id?: number
  items: GenerationItem[]
}

export interface JobView {
  job_id: string
  request_id: string
  prompt_id: string | null
  session_id: string
  scope: Scope
  batch_id: string
  normal_group_id: string | null
  project_id: number | null
  status: JobStatus
  started_at: string | null
  finished_at: string | null
  set_name?: string | null
  prompt_excerpt?: string | null
  node: { id: string; name: string; value: number; max: number } | null
  outputs: Array<{
    node_id: string
    index: number
    view_url: string
    thumbnail_url: string
    availability: 'present' | 'missing' | 'unknown'
  }>
  failure: { reason: string; outcome: 'failed' | 'unconfirmed' } | null
  release?: {
    released_at: string
    released_by_session: string | null
    reason: 'user_release'
    upstream_check: 'skipped_no_identity' | 'not_found' | 'unavailable'
    late_prompt_id: string | null
  } | null
}

export interface GenerationSnapshot {
  version: 1
  epoch: string
  revision: number
  normal_group_id: string | null
  jobs: JobView[]
  batches: Array<{ batch_id: string; scope: Scope; project_id: number | null }>
  upstream: { http_ready: boolean; ws_connected: boolean; failure_since: string | null }
}

export type GenerationEnvelope = {
  type: 'GENERATION_SNAPSHOT' | 'GENERATION_EVENT'
  version: 1
  epoch: string
  revision: number
  data: GenerationSnapshot
}

// unconfirmed は active でも終了でもない第3の状態。待機/進捗の母数に混ぜず別集合で扱う。
const ACTIVE_STATUSES = new Set<JobStatus>(['queued', 'submitting', 'running'])

export function isActiveJobStatus(status: JobStatus): boolean {
  return ACTIVE_STATUSES.has(status)
}

function currentNormalGroupJobs(snapshot: GenerationSnapshot): JobView[] {
  if (snapshot.normal_group_id === null) return []
  return snapshot.jobs.filter(
    (job) => job.scope === 'normal' && job.normal_group_id === snapshot.normal_group_id
  )
}

function selectedJobs(
  snapshot: GenerationSnapshot,
  scope: Scope,
  sessionId: string | null,
  batchId?: string
): JobView[] {
  if (scope === 'normal') {
    if (snapshot.normal_group_id === null) return []
    return currentNormalGroupJobs(snapshot).filter(
      (job) => sessionId === null || job.session_id === sessionId
    )
  }
  if (batchId === undefined) return []
  return snapshot.jobs.filter((job) => job.scope === 'studio' && job.batch_id === batchId)
}

function runningFraction(jobs: JobView[]): number {
  const current = jobs.find((job) => job.status === 'running')
  const node = current?.node
  if (!node || !Number.isFinite(node.value) || !Number.isFinite(node.max) || node.max <= 0) return 0
  return Math.min(1, Math.max(0, node.value / node.max))
}

export function selectProgress(
  snapshot: GenerationSnapshot,
  scope: Scope,
  sessionId: string | null,
  batchId?: string
): { finished: number; total: number; fraction: number; idle: boolean } {
  const jobs = selectedJobs(snapshot, scope, sessionId, batchId)
  const countForTotal = scope === 'studio'
    ? jobs.filter((job) => job.status !== 'released')
    : jobs.filter((job) => job.status !== 'cancelled' && job.status !== 'released' && job.status !== 'unconfirmed')
  const finished = jobs.filter((job) => job.status === 'succeeded' || job.status === 'failed').length
  const total = countForTotal.length
  if (total === 0) return { finished, total, fraction: 0, idle: true }
  const fraction = Math.min(1, Math.max(0, (finished + runningFraction(jobs)) / total))
  return { finished, total, fraction, idle: false }
}

function unfinished(jobs: JobView[]): JobView[] {
  return jobs.filter((job) => ACTIVE_STATUSES.has(job.status))
}

function hasRunning(jobs: JobView[]): boolean {
  return jobs.some((job) => job.status === 'running')
}

function scopeLabel(scope: Scope): string {
  return scope === 'studio' ? 'Studio' : '通常生成'
}

export function selectWait(
  snapshot: GenerationSnapshot,
  scope: Scope,
  sessionId: string | null,
  batchId?: string
): { kind: 'scope' | 'session' | 'batch'; remaining: number; label: string } | null {
  if (scope === 'studio' && batchId === undefined) return null

  const targetJobs = selectedJobs(snapshot, scope, sessionId, batchId)
  const targetUnfinished = unfinished(targetJobs)
  if (targetUnfinished.length === 0 || hasRunning(targetUnfinished)) return null

  const blockingScope: Scope = scope === 'normal' ? 'studio' : 'normal'
  const scopeJobs = blockingScope === 'studio'
    ? snapshot.jobs.filter((job) => job.scope === 'studio')
    : currentNormalGroupJobs(snapshot)
  const scopeUnfinished = unfinished(scopeJobs)
  const scopeRemaining = scopeUnfinished.length
  if (scopeRemaining > 0 && hasRunning(scopeUnfinished)) {
    return { kind: 'scope', remaining: scopeRemaining, label: scopeLabel(blockingScope) }
  }

  if (scope === 'normal' && sessionId !== null) {
    const otherSession = currentNormalGroupJobs(snapshot).filter((job) => job.session_id !== sessionId)
    const otherSessionUnfinished = unfinished(otherSession)
    const remaining = otherSessionUnfinished.length
    if (remaining > 0 && hasRunning(otherSessionUnfinished)) {
      return { kind: 'session', remaining, label: '別セッションの通常生成' }
    }
    return null
  }

  if (scope === 'studio' && batchId !== undefined) {
    const otherBatchIds = [...new Set(
      snapshot.jobs
        .filter((job) => job.scope === 'studio' && job.batch_id !== batchId && job.status === 'running')
        .map((job) => job.batch_id)
    )]
    const otherBatchId = otherBatchIds[0]
    if (!otherBatchId) return null
    const batchJobs = snapshot.jobs.filter((job) => job.scope === 'studio' && job.batch_id === otherBatchId)
    const batch = snapshot.batches.find((item) => item.batch_id === otherBatchId)
    const projectLabel = batch?.project_id === null || batch?.project_id === undefined
      ? ''
      : ` (project ${batch.project_id})`
    return {
      kind: 'batch',
      remaining: unfinished(batchJobs).length,
      label: `別Studioバッチ${projectLabel}`
    }
  }

  return null
}

/** 全scope・全groupの状態未確認ジョブ。sessionId を渡すとそのsessionのみ。古い順。 */
export function selectUnconfirmedJobs(snapshot: GenerationSnapshot, sessionId: string | null = null): JobView[] {
  return snapshot.jobs.filter((job) => job.status === 'unconfirmed' && (sessionId === null || job.session_id === sessionId))
}

/** 解除済み記録。released_at の新しい順で limit 件（既定10）。 */
export function selectReleasedJobs(snapshot: GenerationSnapshot, sessionId: string | null = null, limit = 10): JobView[] {
  const at = (job: JobView) => Date.parse(job.release?.released_at ?? '') || 0
  return snapshot.jobs
    .filter((job) => job.status === 'released' && (sessionId === null || job.session_id === sessionId))
    .sort((a, b) => at(b) - at(a))
    .slice(0, limit)
}
