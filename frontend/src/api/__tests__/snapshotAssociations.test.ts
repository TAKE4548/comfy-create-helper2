// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotsApi } from '../client'
import type { SnapshotTriggerAssociation } from '../types'

describe('snapshot association PATCH contract', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 5, params: {} }) })))
  afterEach(() => vi.unstubAllGlobals())
  it('preserves separate ID spaces and roles', async () => {
    const triggers: SnapshotTriggerAssociation[] = [{ lora_id: 3, trigger_set_id: 7, role: 'Character' }]
    await snapshotsApi.patch(5, { tag_sets: [{ tag_set_id: 7, role: 'Quality' }], lora_trigger_sets: triggers })
    expect(fetch).toHaveBeenCalledWith('/api/snapshots/5', expect.objectContaining({ method: 'PATCH',
      body: JSON.stringify({ tag_sets: [{ tag_set_id: 7, role: 'Quality' }], lora_trigger_sets: triggers }) }))
  })
  it('preserves empty arrays and omitted fields for legacy callers', async () => {
    await snapshotsApi.patch(5, { tag_sets: [], lora_trigger_sets: [] })
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ tag_sets: [], lora_trigger_sets: [] })
    await snapshotsApi.patch(5, { tag_set_ids: [1], lora_ids: [] })
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)).toEqual({ tag_set_ids: [1], lora_ids: [] })
  })
  it('propagates validation errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'invalid association' } as Response)
    await expect(snapshotsApi.patch(5, { tag_sets: [] })).rejects.toThrow('invalid association')
  })
})
