import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '../../api/types'
import { buildGenerationRecord, PROMPT_RECORD_KEY, ASSOCIATIONS_KEY } from '../generationRecord'
import { getMetadataView, resolveRecordedMetadata } from '../promptRecord'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ promptMetadataApi: { get } }))
const wf: Workflow = { id: 1, name: 'Original', created_at: '', json_body: {}, mappings: [
  { id: 1, master_id: 1, node_id: '1', role: 'quality', param_name: 'text', input_type: 'textarea', display_name: 'Quality' },
  { id: 2, master_id: 2, node_id: '2', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
  { id: 3, master_id: 3, node_id: '3', role: 'positive', param_name: null, input_type: 'lora_stack', display_name: 'LoRA' },
] }
const graph = { '1': { inputs: { text: '' } }, '2': { inputs: { seed: 812 } }, '3': { class_type: 'easy loraStack', inputs: { num_loras: 1, lora_1_name: 'frozen.safetensors', lora_1_strength: 0.6, lora_1_model_strength: 0.8, lora_1_clip_strength: 0.4 } } }
const record = () => buildGenerationRecord(wf, graph, graph, {})
const params = () => ({ [PROMPT_RECORD_KEY]: JSON.stringify(record()), quality: '', extra: { x: [false, 0, null] }, [ASSOCIATIONS_KEY]: '{}' })
beforeEach(() => { localStorage.clear(); get.mockReset(); get.mockRejectedValue(new Error('404')) })
describe('getMetadataView', () => {
  it('shows empty prompts, typed extras and actual seed/LoRA strengths without exposing internal keys', () => {
    const view = getMetadataView(params())
    expect(view.fields[0]).toMatchObject({ name: 'Quality', recorded: true, value: '' })
    expect(view.extras).toEqual([{ key: 'extra', name: 'extra', recorded: true, value: { x: [false, 0, null] } }])
    expect(view.actualSeed).toBe('812')
    expect(view.loraRows[0]).toMatchObject({ model: 'frozen.safetensors', weight: '0.6', modelStrength: '0.8', clipStrength: '0.4' })
    expect(view.workflowName).toBe('Original'); expect(view.warning).toBeNull()
  })
  it('preserves every legacy JSON item without promoting legacy seed or workflow labels to generation facts', () => {
    const view = getMetadataView({ seed: 45, arbitrary: [0, false], empty: '', nil: null })
    expect(view.extras.map(p => p.value)).toEqual([45, [0, false], '', null])
    expect(view.actualSeed).toBeNull(); expect(view.workflowName).toBeNull(); expect(view.warning).toBeTruthy()
    expect(getMetadataView({}).warning).toContain('未記録')
  })
  it('does not claim complete history for malformed, unknown or contradictory records', () => {
    for (const invalid of ['{broken', JSON.stringify({ version: 9 }), JSON.stringify({ ...record(), fields: null })]) {
      expect(getMetadataView({ [PROMPT_RECORD_KEY]: invalid, saved: 'kept' }).extras[0].value).toBe('kept')
      expect(getMetadataView({ [PROMPT_RECORD_KEY]: invalid }).warning).toBeTruthy()
    }
    const bad = record(); bad.fields[0].value = null
    const view = getMetadataView({ [PROMPT_RECORD_KEY]: JSON.stringify(bad) })
    expect(view.fields[0].recorded).toBe(false); expect(view.warning).toBeTruthy()
  })
})
describe('resolveRecordedMetadata', () => {
  it('uses valid local generation facts without fetching or requiring assets', async () => {
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: params(), timestamp: 1000 }))
    const found = await resolveRecordedMetadata('p')
    expect(found?.paramValues).toEqual(params()); expect(found?.appliedAssets).toEqual({}); expect(get).not.toHaveBeenCalled()
  })
  it('prefers server generation facts over legacy or corrupt local records', async () => {
    get.mockResolvedValue({ prompt_id: 'p', workflow_id: 1, param_values: params(), applied_assets: null, created_at: 'server-time' })
    localStorage.setItem('prompt-surgeon-meta-p', '{broken')
    expect((await resolveRecordedMetadata('p'))?.metadataSavedAt).toBe('server-time')
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { old: 'local' }, appliedAssets: { old: [] } }))
    expect((await resolveRecordedMetadata('p'))?.paramValues).toEqual(params())
  })
  it('rejects another image ID and falls back to available legacy records without combining assets', async () => {
    localStorage.setItem('prompt-surgeon-meta-p', JSON.stringify({ paramValues: { old: 'local' } }))
    get.mockResolvedValue({ prompt_id: 'other', param_values: params(), applied_assets: { another: [] } })
    expect(await resolveRecordedMetadata('p')).toMatchObject({ paramValues: { old: 'local' }, appliedAssets: {} })
    expect(await resolveRecordedMetadata(null)).toBeNull()
  })
})
