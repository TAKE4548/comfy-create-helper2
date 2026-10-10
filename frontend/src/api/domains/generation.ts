import { BASE_URL } from '../core/base'

export type Scope = 'normal' | 'studio'
export type JobStatus = 'queued' | 'submitting' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unconfirmed'

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
  preview_url?: string | null
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

export interface BatchAccepted { batch_id: string; job_ids: string[]; epoch: string; revision: number }
export interface RequestLookup { batch_id: string; job_ids: string[] }
export type CancelMode = 'single' | 'queued' | 'all'
export type CancelScope = 'all' | 'normal'
export type ActionOutcome = 'confirmed' | 'unconfirmed' | 'failed' | 'not_requested' | 'skipped'
export interface CancelTarget { job_id?: string; prompt_id?: string }
export interface CancelRequest { mode: CancelMode; scope?: CancelScope; target?: CancelTarget }
export interface CancelResult {
  job_id: string | null
  prompt_id: string | null
  status: JobStatus | null
  outcome: 'cancelled' | 'not_cancelled' | 'already_terminal' | 'unconfirmed' | 'rejected'
  message: string
}
export interface CancelOperation {
  scope: CancelScope
  message: string
  mode: CancelMode
  items: CancelResult[]
  upstream_clear: ActionOutcome
  upstream_interrupt: ActionOutcome
  epoch: string
  revision: number
}
export interface UpstreamQueueView {
  running: Array<{ prompt_id: string; client_id: string | null }>
  pending: Array<{ prompt_id: string; client_id: string | null }>
}
export interface ImageIdentity { filename: string; subfolder: string; type: string }
export interface ImageAvailability { availability: 'present' | 'missing' | 'unknown' }
export interface ErrorDetail {
  code: string
  message: string
  outcome: 'failed' | 'unconfirmed' | null
  request_id: string | null
  job_id: string | null
}
export interface ErrorEnvelope { detail: ErrorDetail }

export class GenerationApiError extends Error {
  readonly status: number
  readonly detail: ErrorDetail

  constructor(status: number, detail: ErrorDetail) {
    super(detail.message)
    this.name = 'GenerationApiError'
    this.status = status
    this.detail = detail
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRequiredKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value)
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || isInteger(value)
}

function isScope(value: unknown): value is Scope {
  return value === 'normal' || value === 'studio'
}

function isJobStatus(value: unknown): value is JobStatus {
  return value === 'queued' || value === 'submitting' || value === 'running' ||
    value === 'succeeded' || value === 'failed' || value === 'cancelled' || value === 'unconfirmed'
}

function isNodeView(value: unknown): boolean {
  if (value === null) return true
  return hasRequiredKeys(value, ['id', 'name', 'value', 'max']) &&
    isString(value.id) && isString(value.name) && isFiniteNumber(value.value) && isFiniteNumber(value.max)
}

function isImageView(value: unknown): boolean {
  return hasRequiredKeys(value, ['node_id', 'index', 'view_url', 'thumbnail_url', 'availability']) &&
    isString(value.node_id) && isInteger(value.index) && isString(value.view_url) &&
    isString(value.thumbnail_url) &&
    (value.availability === 'present' || value.availability === 'missing' || value.availability === 'unknown')
}

function isFailureView(value: unknown): boolean {
  if (value === null) return true
  return hasRequiredKeys(value, ['reason', 'outcome']) && isString(value.reason) &&
    (value.outcome === 'failed' || value.outcome === 'unconfirmed')
}

function isJobView(value: unknown): value is JobView {
  return hasRequiredKeys(value, [
    'job_id', 'request_id', 'prompt_id', 'session_id', 'scope', 'batch_id', 'normal_group_id',
    'project_id', 'status', 'started_at', 'finished_at', 'node', 'outputs', 'failure',
  ]) && isString(value.job_id) && isString(value.request_id) && isNullableString(value.prompt_id) &&
    isString(value.session_id) && isScope(value.scope) && isString(value.batch_id) &&
    isNullableString(value.normal_group_id) && isNullableInteger(value.project_id) &&
    isJobStatus(value.status) && isNullableString(value.started_at) && isNullableString(value.finished_at) &&
    (value.preview_url === undefined || isNullableString(value.preview_url)) &&
    (value.set_name === undefined || isNullableString(value.set_name)) &&
    (value.prompt_excerpt === undefined || isNullableString(value.prompt_excerpt)) &&
    isNodeView(value.node) && Array.isArray(value.outputs) && value.outputs.every(isImageView) &&
    isFailureView(value.failure)
}

function isBatchView(value: unknown): boolean {
  return hasRequiredKeys(value, ['batch_id', 'scope', 'project_id']) &&
    isString(value.batch_id) && isScope(value.scope) && isNullableInteger(value.project_id)
}

function isUpstreamView(value: unknown): boolean {
  return hasRequiredKeys(value, ['http_ready', 'ws_connected', 'failure_since']) &&
    typeof value.http_ready === 'boolean' && typeof value.ws_connected === 'boolean' &&
    isNullableString(value.failure_since)
}

function normalizeDetail(value: unknown, status: number): ErrorDetail {
  const raw = isRecord(value) && 'detail' in value ? value.detail : value
  if (isRecord(raw)) {
    return {
      code: typeof raw.code === 'string' ? raw.code : `http_${status}`,
      message: typeof raw.message === 'string' ? raw.message : `API request failed (${status})`,
      outcome: raw.outcome === 'failed' || raw.outcome === 'unconfirmed' ? raw.outcome : null,
      request_id: typeof raw.request_id === 'string' ? raw.request_id : null,
      job_id: typeof raw.job_id === 'string' ? raw.job_id : null,
    }
  }
  return {
    code: `http_${status}`,
    message: typeof raw === 'string' ? raw : `API request failed (${status})`,
    outcome: status >= 500 ? 'unconfirmed' : 'failed',
    request_id: null,
    job_id: null,
  }
}

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  } catch {
    throw new GenerationApiError(0, {
      code: 'network_error',
      message: 'Generation API request outcome is unknown',
      outcome: 'unconfirmed',
      request_id: null,
      job_id: null,
    })
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!response.ok) throw new GenerationApiError(response.status, normalizeDetail(body, response.status))
  return body as T
}

export function decodeGenerationSnapshot(value: unknown): GenerationSnapshot {
  if (!isRecord(value) || value.version !== 1) {
    const version = isRecord(value) ? String(value.version) : 'unknown'
    throw new Error(`Unsupported generation state version: ${version}`)
  }
  if (!hasRequiredKeys(value, [
    'version', 'epoch', 'revision', 'normal_group_id', 'jobs', 'batches', 'upstream',
  ]) || !isString(value.epoch) || !isInteger(value.revision) ||
      !isNullableString(value.normal_group_id) || !Array.isArray(value.jobs) ||
      !value.jobs.every(isJobView) || !Array.isArray(value.batches) ||
      !value.batches.every(isBatchView) || !isUpstreamView(value.upstream)) {
    throw new Error('Invalid generation state response')
  }
  return value as unknown as GenerationSnapshot
}

export function decodeGenerationEnvelope(value: unknown): GenerationEnvelope {
  if (!hasRequiredKeys(value, ['type', 'version', 'epoch', 'revision', 'data']) ||
      (value.type !== 'GENERATION_SNAPSHOT' && value.type !== 'GENERATION_EVENT') ||
      value.version !== 1 || !isString(value.epoch) || !isInteger(value.revision)) {
    throw new Error('Invalid generation envelope')
  }
  let data: GenerationSnapshot
  try {
    data = decodeGenerationSnapshot(value.data)
  } catch {
    throw new Error('Invalid generation envelope')
  }
  if (value.epoch !== data.epoch || value.revision !== data.revision) {
    throw new Error('Invalid generation envelope')
  }
  return { type: value.type, version: 1, epoch: value.epoch, revision: value.revision, data }
}

export const generationApi = {
  submitBatch: (body: BatchRequest, signal?: AbortSignal): Promise<BatchAccepted> =>
    call('/generation/batches', {
      method: 'POST',
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }),
  getState: async (): Promise<GenerationSnapshot> => decodeGenerationSnapshot(await call<unknown>('/generation/state')),
  getRequest: (requestId: string): Promise<RequestLookup> =>
    call(`/generation/requests/${encodeURIComponent(requestId)}`),
  cancelJob: (jobId: string, onlyUnsubmitted?: boolean, onlyQueued?: boolean): Promise<CancelResult> => {
    if (onlyUnsubmitted && onlyQueued) {
      return Promise.reject(new Error('onlyUnsubmitted and onlyQueued cannot be combined'))
    }
    const guard = onlyQueued ? '?only_queued=true' : onlyUnsubmitted ? '?only_unsubmitted=true' : ''
    return call(`/generation/jobs/${encodeURIComponent(jobId)}/cancel${guard}`, { method: 'POST' })
  },
  cancel: (body: CancelRequest): Promise<CancelOperation> =>
    call('/generation/cancel', { method: 'POST', body: JSON.stringify(body) }),
  getUpstreamQueue: (): Promise<UpstreamQueueView> => call('/generation/upstream-queue'),
  imageAvailability: (identity: ImageIdentity): Promise<ImageAvailability> => {
    const query = new URLSearchParams({
      filename: identity.filename,
      subfolder: identity.subfolder,
      type: identity.type,
    })
    return call(`/comfy/image-availability?${query.toString()}`)
  },
  availability: (jobId: string): Promise<JobView['outputs']> =>
    call(`/generation/images/${encodeURIComponent(jobId)}/availability`),
}
