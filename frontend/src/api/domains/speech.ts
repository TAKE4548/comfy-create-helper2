import { request, BASE_URL } from '../core/base'
import { abortError, parseSceneSpeechEvent, SceneSpeechStreamError } from '../core/stream'
import type {
  SceneDraftRequest,
  SceneDraftResponse,
  SceneSpeechStreamOptions,
  SceneSpeechStreamEvent,
  ServerFont,
  SpeechBubblePreset,
  SpeechBubblePresetCreate,
  SpeechBubblePresetUpdate,
  SpeechTonePreset,
  SpeechTonePresetCreate,
  SpeechTonePresetUpdate,
  SpeechToneRewriteRequest,
  SpeechToneRewriteResponse,
  SpeechBatchJob,
  SpeechBatchJobCreate,
  SpeechBatchItemRetryRequest,
} from '../types'

export const sceneSpeechApi = {
  generateStream: async (
    payload: SceneDraftRequest,
    options?: SceneSpeechStreamOptions,
  ): Promise<SceneDraftResponse> => {
    const signal = options?.signal
    if (signal?.aborted) throw abortError(signal)

    const response = await fetch(`${BASE_URL}/speech/scene-draft/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(payload),
      signal,
    })
    if (!response.ok) {
      const detail = typeof response.text === 'function' ? await response.text() : ''
      throw new Error(`API error ${response.status}: ${detail}`)
    }
    if (!response.body) throw new Error('Scene speech stream response has no body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: SceneDraftResponse | undefined
    let receivedResult = false
    const cancelOnAbort = () => {
      void reader.cancel(signal?.reason).catch(() => undefined)
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true })

    const consumeLine = (rawLine: string) => {
      if (receivedResult) throw new Error('Scene speech stream contained data after result')
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!line) throw new Error('Empty scene speech stream line')
      const event: SceneSpeechStreamEvent = parseSceneSpeechEvent(line)
      if (event.type === 'progress') {
        options?.onProgress?.(event)
      } else if (event.type === 'error') {
        throw new SceneSpeechStreamError(event.error_kind, event.message)
      } else {
        receivedResult = true
        result = event.data
      }
    }

    try {
      if (signal?.aborted) throw abortError(signal)
      while (true) {
        const { value, done } = await reader.read()
        if (signal?.aborted) throw abortError(signal)
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf('\n')
        while (newline !== -1) {
          consumeLine(buffer.slice(0, newline))
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
        }
      }
      buffer += decoder.decode()
      if (buffer.length > 0) consumeLine(buffer)
      if (!result) throw new Error('Scene speech stream ended without a result')
      return result
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort)
      await reader.cancel().catch(() => undefined)
    }
  },
}

// 笏笏笏 Workflows 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export const fontsApi = {
  list: () => request<ServerFont[]>('/fonts'),
}


// 笏笏笏 Workflow Presets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export const speechBubblePresetsApi = {
  list: () => request<SpeechBubblePreset[]>('/speech-bubble-presets'),
  getByTagSetId: (tagSetId: number) =>
    request<SpeechBubblePreset | null>(`/speech-bubble-presets/by-tagset/${tagSetId}`),
  create: (data: SpeechBubblePresetCreate) =>
    request<SpeechBubblePreset>('/speech-bubble-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: SpeechBubblePresetUpdate) =>
    request<SpeechBubblePreset>(`/speech-bubble-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/speech-bubble-presets/${id}`, {
      method: 'DELETE',
    }),
}

// 笏笏笏 Speech Tone Presets 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export const speechTonePresetsApi = {
  list: () => request<SpeechTonePreset[]>('/speech-tone-presets'),
  create: (data: SpeechTonePresetCreate) =>
    request<SpeechTonePreset>('/speech-tone-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: SpeechTonePresetUpdate) =>
    request<SpeechTonePreset>(`/speech-tone-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/speech-tone-presets/${id}`, {
      method: 'DELETE',
    }),
  rewrite: (data: SpeechToneRewriteRequest) =>
    request<SpeechToneRewriteResponse>('/speech-tone-presets/rewrite', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// 笏笏笏 ComfyUI Proxy API 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

export const speechBatchApi = {
  createJob: (data: SpeechBatchJobCreate) =>
    request<SpeechBatchJob>('/speech-batch/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getJob: (jobId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}`),
  getActiveJob: () =>
    request<SpeechBatchJob | null>('/speech-batch/jobs/active'),
  cancelJob: (jobId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/cancel`, {
      method: 'POST',
    }),
  cancelItem: (jobId: string, itemId: string) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/items/${itemId}/cancel`, {
      method: 'POST',
    }),
  retryItem: (jobId: string, itemId: string, payload?: SpeechBatchItemRetryRequest) =>
    request<SpeechBatchJob>(`/speech-batch/jobs/${jobId}/items/${itemId}/retry`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
    }),
}

// ─── Prompt Metadata ──────────────────────────────────────────────
