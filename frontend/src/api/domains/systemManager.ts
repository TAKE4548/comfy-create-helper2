export type ManagerServiceName = 'backend' | 'frontend' | 'comfy' | 'manager'
export type ManagedServiceName = 'backend' | 'comfy' | 'frontend' | 'fe'
export type ManagerActionName = 'start' | 'stop' | 'restart'

export interface ManagerProcessStatus {
  running: boolean
  status: string
  [key: string]: unknown
}

export interface ManagerStatus {
  fe: ManagerProcessStatus
  be: ManagerProcessStatus
  comfy: ManagerProcessStatus
  action_in_progress?: { service: string; action: string } | null
}

export interface ManagerActionResult {
  status: 'ok' | 'error' | 'timeout'
  action: string
  output?: unknown
  error?: unknown
}

export interface ManagerLogs {
  service: ManagerServiceName
  filename: string
  exists: boolean
  lines: string[]
  content: string
}

const READ_REQUEST_TIMEOUT_MS = 7000
const ACTION_REQUEST_TIMEOUT_MS = 120000

export class ManagerActionOutcomeUnknownError extends Error {
  readonly outcome = 'unconfirmed'

  constructor(message: string) {
    super(message)
    this.name = 'ManagerActionOutcomeUnknownError'
  }
}

class ManagerRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Manager request timed out after ${timeoutMs}ms`)
    this.name = 'ManagerRequestTimeoutError'
  }
}

class ManagerHttpError extends Error {
  constructor(readonly status: number) {
    super(`Manager API HTTP ${status}`)
    this.name = 'ManagerHttpError'
  }
}

function managerBaseUrl(): string {
  return `http://${window.location.hostname}:8899`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProcessStatus(value: unknown): value is ManagerProcessStatus {
  return isRecord(value) && typeof value.running === 'boolean' && typeof value.status === 'string'
}

function decodeStatus(value: unknown): ManagerStatus {
  if (!isRecord(value) || !isProcessStatus(value.fe) || !isProcessStatus(value.be) || !isProcessStatus(value.comfy)) {
    throw new Error('Invalid manager status response')
  }
  const action = value.action_in_progress
  if (action !== undefined && action !== null &&
      (!isRecord(action) || typeof action.service !== 'string' || typeof action.action !== 'string')) {
    throw new Error('Invalid manager action status')
  }
  return value as unknown as ManagerStatus
}

function decodeActionResult(value: unknown): ManagerActionResult {
  if (!isRecord(value) || (value.status !== 'ok' && value.status !== 'error' && value.status !== 'timeout') ||
      typeof value.action !== 'string') {
    throw new Error('Invalid manager action response')
  }
  const result = value as unknown as ManagerActionResult
  if (result.status === 'timeout') {
    throw new ManagerActionOutcomeUnknownError('Manager action timeout; outcome is unconfirmed')
  }
  if (result.status !== 'ok') {
    const detail = typeof result.error === 'string' ? `: ${result.error}` : ''
    throw new Error(`Manager action ${result.status}${detail}`)
  }
  return result
}

function decodeLogs(value: unknown): ManagerLogs {
  const services: ManagerServiceName[] = ['backend', 'frontend', 'comfy', 'manager']
  if (!isRecord(value) || !services.includes(value.service as ManagerServiceName) ||
      typeof value.filename !== 'string' || typeof value.exists !== 'boolean' ||
      !(Number.isInteger(value.lines) && (value.lines as number) >= 0 ||
        Array.isArray(value.lines) && value.lines.every((line) => typeof line === 'string')) ||
      typeof value.content !== 'string') {
    throw new Error('Invalid manager logs response')
  }
  const lines = Array.isArray(value.lines)
    ? value.lines as string[]
    : value.content === '' ? [] : value.content.replace(/\r?\n$/, '').split(/\r?\n/)
  return { service: value.service as ManagerServiceName, filename: value.filename, exists: value.exists, lines, content: value.content }
}

async function requestJson(path: string, init: RequestInit = {}, timeoutMs = READ_REQUEST_TIMEOUT_MS): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${managerBaseUrl()}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ManagerRequestTimeoutError(timeoutMs)
    }
    throw error
  }
  if (!response.ok) throw new ManagerHttpError(response.status)
  try {
    return await response.json()
  } catch {
    throw new Error('Invalid JSON from manager API')
  }
}

export const systemManagerApi = {
  status: async (): Promise<ManagerStatus> => decodeStatus(await requestJson('/api/status')),

  action: async (action: ManagerActionName, service: ManagedServiceName): Promise<ManagerActionResult> => {
    try {
      const value = await requestJson('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, service }),
      }, ACTION_REQUEST_TIMEOUT_MS)
      return decodeActionResult(value)
    } catch (error) {
      if (error instanceof ManagerRequestTimeoutError ||
          error instanceof ManagerHttpError && (error.status === 503 || error.status === 504) ||
          error instanceof TypeError) {
        throw new ManagerActionOutcomeUnknownError(error.message)
      }
      throw error
    }
  },

  logs: async (service: ManagerServiceName, tail = 200): Promise<ManagerLogs> => {
    const query = new URLSearchParams({ service, tail: String(tail) })
    return decodeLogs(await requestJson(`/api/logs?${query.toString()}`))
  },
}
