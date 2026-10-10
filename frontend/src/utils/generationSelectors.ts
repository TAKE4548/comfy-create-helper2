export type Scope = 'normal' | 'studio'

export type JobStatus =
  | 'queued'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unconfirmed'

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

const UNFINISHED_STATUSES = new Set<JobStatus>(['queued', 'submitting', 'running', 'unconfirmed'])

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
    ? jobs
    : jobs.filter((job) => job.status !== 'cancelled')
  const finished = jobs.filter((job) => job.status === 'succeeded' || job.status === 'failed').length
  const total = countForTotal.length
  if (total === 0) return { finished, total, fraction: 0, idle: true }
  const fraction = Math.min(1, Math.max(0, (finished + runningFraction(jobs)) / total))
  return { finished, total, fraction, idle: false }
}

function unfinished(jobs: JobView[]): JobView[] {
  return jobs.filter((job) => UNFINISHED_STATUSES.has(job.status))
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
