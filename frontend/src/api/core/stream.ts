import type { SceneSpeechStreamEvent, SceneSpeechProgressEvent, SceneSpeechStreamErrorKind } from '../types'

export class SceneSpeechStreamError extends Error {
  constructor(public readonly kind: SceneSpeechStreamErrorKind, message: string) {
    super(message)
    this.name = 'SceneSpeechStreamError'
  }
}

export function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  return new DOMException('The operation was aborted', 'AbortError')
}

export function parseSceneSpeechEvent(line: string): SceneSpeechStreamEvent {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error('Invalid scene speech stream JSON line')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid scene speech stream event')
  }
  const event = value as Record<string, unknown>
  if (event.type === 'progress') {
    const steps = ['reference', 'vlm', 'style', 'vram']
    const statuses = ['active', 'done', 'error']
    if (!steps.includes(String(event.step)) || !statuses.includes(String(event.status))) {
      throw new Error('Invalid scene speech progress event')
    }
    return event as unknown as SceneSpeechProgressEvent
  }
  if (event.type === 'result') {
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      throw new Error('Invalid scene speech result event')
    }
    return event as unknown as SceneSpeechStreamEvent
  }
  if (event.type === 'error') {
    const kinds: SceneSpeechStreamErrorKind[] = [
      'lm_studio_400', 'connection_refused', 'timeout', 'unknown', 'invalid_request', 'vram_unload_failed',
    ]
    if (!kinds.includes(event.error_kind as SceneSpeechStreamErrorKind) || typeof event.message !== 'string') {
      throw new Error('Invalid scene speech error event')
    }
    return event as unknown as SceneSpeechStreamEvent
  }
  throw new Error('Unknown scene speech stream event type')
}
