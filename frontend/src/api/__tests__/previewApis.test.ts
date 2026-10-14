import { afterEach, describe, expect, it, vi } from 'vitest'
import { llmPromptsApi, translateApi } from '../domains/translation'
import { snapshotsApi } from '../domains/snapshots'

function mockFetchResponse(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('preview APIs', () => {
  it('sends one Playground request with the supplied unsaved values', async () => {
    const response = { rendered_prompt: 'unsaved system', result: 'preview', token_limit: null }
    const fetchMock = mockFetchResponse(response)
    const payload = {
      system_prompt: 'unsaved system',
      text: 'draft text',
      variables: { role: 'wizard' },
      model: null,
      llm_params: { temperature: 0.2 },
    }

    await expect(llmPromptsApi.playground(payload)).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/llm-prompts/playground', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload),
    }))
  })

  it('gets and saves dictionary rules through their typed GET/PUT routes', async () => {
    const saved = { rules: [{ source: 'NYC', replacement: 'New York' }] }
    const fetchMock = mockFetchResponse(saved)

    await expect(translateApi.getDictionary()).resolves.toEqual(saved)
    await expect(translateApi.saveDictionary(saved.rules)).resolves.toEqual(saved)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/translate/dictionary', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/translate/dictionary', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify(saved),
    }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps legacy detection arguments and adds optional sensitivity overrides', async () => {
    const response = { candidates: [{
      id: 1, x: 2, y: 3, w: 40, h: 30, area: 1200,
      aspect_ratio: 1.33, mean_brightness: 222, status: 'PASS',
    }] }
    const fetchMock = mockFetchResponse(response)
    const roi = { x: 1, y: 2, w: 3, h: 4 }

    await expect(snapshotsApi.detectBubbleDebug(9, roi)).resolves.toEqual(response)
    await expect(snapshotsApi.detectBubbleDebug(9, roi, { min_area: 250, min_brightness: 60 })).resolves.toEqual(response)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/snapshots/9/detect-bubble-debug', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ roi }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/snapshots/9/detect-bubble-debug', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ roi, min_area: 250, min_brightness: 60 }),
    }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
