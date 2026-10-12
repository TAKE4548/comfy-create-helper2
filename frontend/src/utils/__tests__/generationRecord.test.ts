import { describe, expect, it } from 'vitest'
import type { Workflow, WorkflowMapping } from '../../api/types'
import { buildGenerationRecord, PROMPT_RECORD_KEY, type CaptureAssetInput } from '../generationRecord'

const mapping = (id: number, type: string, role: string | null = `role-${id}`): WorkflowMapping => ({
  id, master_id: id, node_id: String(id), role, input_type: type, param_name: 'text', display_name: '同名欄',
})
const workflow = (mappings: WorkflowMapping[]): Workflow => ({ id: 7, name: '生成時', created_at: '', json_body: {}, mappings })
const node = (value: unknown) => ({ class_type: 'TestNode', inputs: { text: value } })

describe('buildGenerationRecord', () => {
  it('preserves each field, long text, empty values and frozen labels without combining identical names', () => {
    const text = '(花:1.2)\n' + '光'.repeat(2200) + '末尾'
    const wf = workflow([mapping(1, 'textarea'), mapping(2, 'textarea'), mapping(3, 'textarea', 'negative')])
    const graph = { '1': node(text), '2': node(''), '3': node('bad anatomy') }
    const result = buildGenerationRecord(wf, graph, graph, {})
    wf.name = '変更後'; wf.mappings[0].display_name = '変更後'
    expect(result.workflow_name).toBe('生成時')
    expect(result.fields.map(f => f.value)).toEqual([text, '', 'bad anatomy'])
    expect(result.fields.map(f => f.mapping_id)).toEqual([1, 2, 3])
    expect(result.fields[0].display_name).toBe('同名欄')
    expect(result.completeness).toBe('complete')
    expect(result.queued_at).toBeNull()
  })
  it('distinguishes bypassed prompts from missing nodes and non-string prompt values', () => {
    const wf = workflow([mapping(1, 'textarea'), mapping(2, 'textarea'), mapping(3, 'textarea')])
    const record = buildGenerationRecord(wf, { '1': node('bypassed'), '3': node(0) }, {}, {})
    expect(record.fields[0]).toMatchObject({ recorded: true, value: 'bypassed', status: 'bypassed' })
    expect(record.fields[1]).toMatchObject({ recorded: false, value: null, status: 'missing' })
    expect(record.fields[2].recorded).toBe(false)
    expect(record.completeness).toBe('partial')
  })
  it('captures actual submitted seed/default values and every JSON value including roleless mappings', () => {
    const maps = ['int', 'boolean', 'select', 'select', 'select', 'select'].map((t, i) => mapping(i + 1, t, null))
    maps[0].role = 'Sampler_Seed'; maps[0].param_name = null
    const graph = { '1': { inputs: { seed: 4271 } }, '2': node(false), '3': node(0), '4': node(null), '5': node([]), '6': node({ x: ['2', 0] }) }
    const record = buildGenerationRecord(workflow(maps), {}, graph, {})
    expect(record.parameters.map(p => p.value)).toEqual([4271, false, 0, null, [], { x: ['2', 0] }])
    expect(record.parameters.every(p => p.recorded)).toBe(true)
    ;(graph['6'].inputs.text as { x: unknown[] }).x.push('changed')
    expect(record.parameters[5].value).toEqual({ x: ['2', 0] })
  })
  it('captures a dedicated seed from its resolved submitted input while preserving its declared primary', () => {
    const seed = mapping(1, 'seed', 'detail_seed')
    seed.param_name = 'seed'
    seed.fallback_param_names = ['noise_seed']
    const record = buildGenerationRecord(workflow([seed]), {}, { '1': { class_type: 'KSampler', inputs: { noise_seed: 8361 } } }, {})
    expect(record.parameters[0]).toMatchObject({ param_name: 'seed', recorded: true, value: 8361, status: 'submitted' })
  })
  it('returns bypassed or missing for unavailable dedicated seed inputs without throwing', () => {
    const bypass = mapping(1, 'seed', 'seed-bypass')
    bypass.param_name = 'seed'; bypass.fallback_param_names = ['noise_seed']
    const missing = mapping(2, 'seed', 'seed-missing')
    missing.param_name = 'seed'; missing.fallback_param_names = ['noise_seed']
    const record = buildGenerationRecord(workflow([bypass, missing]), { '1': node(42) }, { '2': { inputs: {} } }, {})
    expect(record.parameters[0]).toMatchObject({ recorded: false, value: null, status: 'bypassed' })
    expect(record.parameters[1]).toMatchObject({ recorded: false, value: null, status: 'missing' })
    const empty = buildGenerationRecord(workflow([missing]), {}, {}, {})
    expect(empty.parameters[0]).toMatchObject({ recorded: false, value: null, status: 'missing' })
  })
  it('keeps graph references and separate LoRA model/clip strengths, without fabricating bypassed parameters', () => {
    const lora = mapping(1, 'lora_stack'); const ref = mapping(2, 'select'); const bypass = mapping(3, 'float')
    const graph = { '1': { class_type: 'LoRALoader', inputs: { model: ['7', 0], strength_model: 0.8, strength_clip: 0.5 } }, '2': node(['1', 0]) }
    const record = buildGenerationRecord(workflow([lora, ref, bypass]), { '3': node(0.7) }, graph, {})
    expect(record.parameters[0].value).toEqual(graph['1'].inputs)
    expect(record.parameters[1].value_kind).toBe('graph-reference')
    expect(record.parameters[2]).toMatchObject({ recorded: false, status: 'bypassed' })
  })
  it('freezes enabled assets and distinguishes known, default, historical and generic origins', () => {
    const asset = (id: number, extra: Partial<CaptureAssetInput> = {}): CaptureAssetInput => ({ id: String(id), type: 'lora', assetId: id, name: 'LoRA', enabled: true, tags: ['word'], ...extra })
    const assets = { character: [asset(1, { triggerSetId: 42, triggerSetName: 'selected' }), asset(2, { triggerSetId: null }), asset(3), asset(4, { type: 'tagset' }), asset(5, { enabled: false })] }
    const record = buildGenerationRecord(workflow([]), {}, {}, assets)
    assets.character[0].tags.push('edited')
    expect(record.assets.map(a => a.origin)).toEqual(['lora-trigger', 'none', 'unknown', 'generic-tagset'])
    expect(record.assets[0]).toMatchObject({ role: 'character', trigger_set_id: 42, trigger_set_name: 'selected', tags: ['word'] })
  })
  it('rejects reserved role collisions and does not claim completeness for duplicate mapping IDs', () => {
    expect(() => buildGenerationRecord(workflow([mapping(1, 'textarea', PROMPT_RECORD_KEY)]), {}, {}, {})).toThrow()
    const wf = workflow([mapping(1, 'textarea'), mapping(1, 'textarea')]); const graph = { '1': node('text') }
    expect(buildGenerationRecord(wf, graph, graph, {}).completeness).toBe('partial')
  })
})
