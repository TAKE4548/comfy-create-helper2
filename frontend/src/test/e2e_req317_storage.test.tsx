import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../api/types'
import { promptMetadataApi } from '../api/client'
import { generationApi } from '../api/domains/generation'
import { useGenerationStore } from '../store/useGenerationStore'
import { useBrowserStorageUsage } from '../hooks/useBrowserStorageUsage'
import { buildGenerationRecord, PROMPT_RECORD_KEY } from '../utils/generationRecord'

vi.mock('../api/client', () => ({
  configApi: { get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }) },
  promptMetadataApi: { create: vi.fn(), get: vi.fn() },
}))

const bytes = (storage: Storage) => Object.keys(storage).reduce((sum, key) => sum + (key.length + (storage.getItem(key)?.length ?? 0)) * 2, 0)

describe('REQ-317 storage cache and monitor integration', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(generationApi, 'submitBatch').mockResolvedValue({
      batch_id: '00000000-0000-4000-8000-000000000002',
      job_ids: ['00000000-0000-4000-8000-000000000001'],
      epoch: 'test-epoch', revision: 1,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    useGenerationStore.setState({ isGenerating: false })
  })

  it('keeps 30 recent records after generation and reports the changed local usage on the next monitor cycle', async () => {
    for (let i = 1; i <= 30; i += 1) {
      localStorage.setItem(`prompt-surgeon-meta-old-${i}`, JSON.stringify({ timestamp: i, paramValues: { old: i } }))
    }
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useBrowserStorageUsage())
    const initialBytes = bytes(localStorage)
    expect(result.current.localStorage).toEqual({ status: 'ok', bytes: initialBytes })

    const workflow: Workflow = { id: 7, name: 'Recorded', created_at: '', json_body: {}, mappings: [
      { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
    ] }
    const graph = { '1': { inputs: { text: 'new generated prompt' } } }
    const record = buildGenerationRecord(workflow, graph, graph, {})
    const queued = await useGenerationStore.getState().queuePrompt({}, {
      workflowId: 7, appliedAssets: {}, paramValues: { [PROMPT_RECORD_KEY]: JSON.stringify(record) },
    }, { skipQueueFetch: true })

    expect(queued).toBe('00000000-0000-4000-8000-000000000001')
    expect(localStorage.getItem('prompt-surgeon-meta-old-1')).toBeNull()
    expect(localStorage.getItem('prompt-surgeon-meta-old-30')).not.toBeNull()
    expect(localStorage.getItem('prompt-surgeon-meta-00000000-0000-4000-8000-000000000001')).not.toBeNull()
    expect(Object.keys(localStorage).filter(key => key.startsWith('prompt-surgeon-meta-'))).toHaveLength(30)

    const afterGenerationBytes = bytes(localStorage)
    expect(afterGenerationBytes).not.toBe(initialBytes)
    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current.localStorage).toEqual({ status: 'ok', bytes: afterGenerationBytes })
    expect(result.current.sessionStorage).toEqual({ status: 'ok', bytes: bytes(sessionStorage) })
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1)
    expect(generationApi.submitBatch).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'normal',
      items: [expect.objectContaining({ param_values: { [PROMPT_RECORD_KEY]: JSON.stringify(record) } })],
    }), undefined)
    expect(promptMetadataApi.create).not.toHaveBeenCalled()
    unmount()
  })
})
