export type QueueSubmissionFailure = {
  reason: string
  outcome: 'failed' | 'unconfirmed'
}

const UNKNOWN_REASON = '理由を特定できませんでした'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (!reason || /^(?:api\s+error\s*)?\d{3}(?:\s+[\w-]+)?\s*:?$/i.test(reason)) return null
  if (/^(?:http\s*)?\d{3}(?:\s+[\w-]+)?\s*:?$/i.test(reason)) return null
  return reason
}

function explanationStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(explanationStrings)
  if (!isRecord(value)) return []

  const result: string[] = []
  for (const key of ['message', 'details', 'detail', 'description', 'reason', 'exception_message']) {
    if (key in value) result.push(...explanationStrings(value[key]))
  }
  if ('errors' in value) result.push(...explanationStrings(value.errors))
  return result
}

function extractJsonReason(body: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const candidates: unknown[] = []
  const apiError = parsed.error
  if (isRecord(apiError)) {
    candidates.push(...explanationStrings(apiError.message), ...explanationStrings(apiError.details))
  }
  candidates.push(...explanationStrings(parsed.detail))
  if (isRecord(parsed.node_errors)) {
    for (const nodeError of Object.values(parsed.node_errors)) {
      candidates.push(...explanationStrings(nodeError))
    }
  } else if (Array.isArray(parsed.node_errors)) {
    candidates.push(...explanationStrings(parsed.node_errors))
  }

  const reasons = [...new Set(candidates
    .map(normalizeReason)
    .filter((reason): reason is string => reason !== null))]
  return reasons.length > 0 ? reasons.join('\n') : null
}

/** Extracts a user-readable reason from queue submission errors without guessing. */
export function parseQueueSubmissionFailure(error: unknown): QueueSubmissionFailure {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''

  const statusMatch = message.match(/^API error\s+(\d{3}):\s*/i)
  const status = statusMatch ? Number(statusMatch[1]) : null
  const payload = statusMatch ? message.slice(statusMatch[0].length) : message

  let reason: string | null = null
  const trimmedPayload = payload.trim()
  if (trimmedPayload.startsWith('{') || trimmedPayload.startsWith('[')) {
    reason = extractJsonReason(trimmedPayload)
  } else {
    reason = normalizeReason(payload)
  }

  const unconfirmed = status === 502
    || /(?:timed?\s*out|timeout|network\s*(?:error|failure)|failed to fetch|fetch failed|connection (?:reset|refused|lost)|econn(?:reset|refused)|enotfound|err_network)/i.test(message)

  return {
    reason: reason ?? UNKNOWN_REASON,
    outcome: unconfirmed ? 'unconfirmed' : 'failed',
  }
}
