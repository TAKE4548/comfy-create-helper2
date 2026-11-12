// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Workflow, WorkflowMapping, PromptTemplateStructure } from '../../api/types'
import { buildGenerationRecord, PROMPT_RECORD_KEY, type CaptureAssetInput } from '../generationRecord'
import { getMetadataView } from '../promptRecord'
import {
  PROMPT_TEMPLATE_STATE_KEY,
  serializePresetState,
  restorePresetStateFromSanitizedRecord,
  type PromptTemplatePresetState,
} from '../promptTemplateEngine'

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
  it('[REQ-423/AC-3] records field key and value exactly matching noise_seed from injected graph', () => {
    const seed = {
      ...mapping(1, 'int', 'Sampler_Seed'),
      input_name: 'noise_seed',
      param_name: 'seed',
      display_name: 'Noise Seed',
    }
    const injectedGraph = {
      '1': {
        class_type: 'KSamplerAdvanced',
        inputs: { noise_seed: 54321 },
      },
    }
    const record = buildGenerationRecord(workflow([seed]), injectedGraph, injectedGraph, {})
    expect(record.parameters[0]).toMatchObject({
      mapping_id: 1,
      node_id: '1',
      role: 'Sampler_Seed',
      recorded: true,
      value: 54321,
      status: 'submitted',
    })
    expect(record.parameters[0].value).toBe(injectedGraph['1'].inputs.noise_seed)

    // Legacy mapping (empty input_name) should also detect noise_seed in inputs
    const legacySeed = {
      ...mapping(2, 'int', 'Sampler_Seed'),
      node_id: '1',
      input_name: '',
      param_name: 'seed',
      display_name: 'Legacy Seed',
    }
    const recordLegacy = buildGenerationRecord(workflow([legacySeed]), injectedGraph, injectedGraph, {})
    expect(recordLegacy.parameters[0]).toMatchObject({
      mapping_id: 2,
      node_id: '1',
      role: 'Sampler_Seed',
      recorded: true,
      value: 54321,
      status: 'submitted',
    })
  })

  it('[REQ-425/AC-8] records only enabled chip values in prompt_template metadata and strips disabled chips', () => {
    const templateStructure: PromptTemplateStructure = {
      sections: [
        {
          id: 'char_sec',
          name: 'キャラクター',
          is_repeatable: true,
          blocks: [
            { id: 'char_name', label: 'キャラ名' },
            { id: 'upper_clothes', label: '上着' },
          ],
        },
      ],
    }

    const wf: Workflow = {
      id: 10,
      name: 'プロンプト構造ワークフロー',
      created_at: '',
      json_body: {},
      mappings: [mapping(1, 'textarea', 'positive')],
      prompt_template_config: {
        template_id: 1,
        template_snapshot: templateStructure,
        output_groups: [
          {
            id: 'g1',
            name: 'Positive Main',
            target_role: 'positive',
            block_ids: ['char_name', 'upper_clothes'],
            repeat_filter: { mode: 'all' },
          },
        ],
      },
    }

    const presetState: PromptTemplatePresetState = {
      version: 1,
      templateId: 1,
      sections: {
        char_sec: {
          instances: [
            {
              instanceId: 'inst-1',
              blocks: {
                char_name: [{ id: 'c1', text: 'alice', enabled: true }],
                upper_clothes: [
                  { id: 'c2', text: 'shirt', enabled: false }, // disabled chip!
                  { id: 'c3', text: 'coat', enabled: true },
                ],
              },
            },
          ],
        },
      },
    }

    const paramValues = {
      positive: 'alice, coat',
      [PROMPT_TEMPLATE_STATE_KEY]: serializePresetState(presetState),
    }

    const graph = { '1': node('alice, coat') }
    const record = buildGenerationRecord(wf, graph, graph, {}, paramValues)

    expect(record.prompt_template).toBeDefined()
    expect(record.prompt_template?.version).toBe(1)
    expect(record.prompt_template?.template_id).toBe(1)
    expect(record.prompt_template?.sections).toHaveLength(1)

    const sec = record.prompt_template?.sections[0]
    expect(sec?.section_id).toBe('char_sec')
    expect(sec?.instances).toHaveLength(1)

    const blocks = sec?.instances[0]?.blocks
    expect(blocks).toBeDefined()
    expect(blocks?.find((b) => b.block_id === 'char_name')?.value).toBe('alice')
    // Disabled chip 'shirt' MUST NOT be in value, only enabled chip 'coat'
    const clothesVal = blocks?.find((b) => b.block_id === 'upper_clothes')?.value
    expect(clothesVal).toBe('coat')
    expect(clothesVal).not.toContain('shirt')

    // Verify getMetadataView extracts promptTemplate
    const metaView = getMetadataView({
      [PROMPT_RECORD_KEY]: JSON.stringify(record),
    })
    expect(metaView.promptTemplate).toEqual(record.prompt_template)

    // Verify snapshot restoration restores only enabled chips
    const restored = restorePresetStateFromSanitizedRecord(record.prompt_template!)
    expect(restored.version).toBe(1)
    const restoredClothes = restored.sections.char_sec.instances[0].blocks.upper_clothes
    expect(restoredClothes).toHaveLength(1)
    expect(restoredClothes[0].text).toBe('coat')
    expect(restoredClothes[0].enabled).toBe(true)
  })
})
