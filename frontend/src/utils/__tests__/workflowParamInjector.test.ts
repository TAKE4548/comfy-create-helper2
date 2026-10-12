import { describe, it, expect, vi } from 'vitest'
import {
  extractGeneralParam,
  extractLoraStackParams,
  getInitialParams,
  injectLoraStackParams,
  injectGeneralParam,
  injectWorkflowParams,
} from '../workflowParamInjector'
import type { Workflow } from '../../../api/types'
import { setSeedModeForMapping } from '../seedModel'
import { prepareSeedBatch } from '../seedBatch'

describe('workflowParamInjector', () => {
  describe('extractGeneralParam', () => {
    it('should return param value when paramName exists in inputs', () => {
      const node = { inputs: { testKey: 'testVal' } }
      expect(extractGeneralParam(node, 'testKey')).toBe('testVal')
    })

    it('should return value input as fallback when target paramName does not exist', () => {
      const node = { inputs: { value: 'fallbackVal' } }
      expect(extractGeneralParam(node, 'testKey')).toBe('fallbackVal')
    })

    it('should return empty string when node or inputs is missing', () => {
      expect(extractGeneralParam(null, 'testKey')).toBe('')
      expect(extractGeneralParam({}, 'testKey')).toBe('')
    })
  })

  describe('extractLoraStackParams', () => {
    it('should parse EasyLoraStack inputs with num_loras correctly', () => {
      const node = {
        inputs: {
          num_loras: 2,
          lora_1_name: 'loraA.safetensors',
          lora_1_strength: 0.85,
          lora_1_model_strength: 0.9,
          lora_1_clip_strength: 1.0,
          lora_2_name: 'loraB.safetensors',
          lora_2_strength: -0.5,
          lora_2_model_strength: 1.0,
          lora_2_clip_strength: 0.95,
        },
      }
      const params = extractLoraStackParams(node, 'MyLora')
      expect(params).toEqual({
        MyLora_lora_count: '2',
        MyLora_lora_name_1: 'loraA.safetensors',
        MyLora_lora_wt_1: '0.85',
        MyLora_model_str_1: '0.9',
        MyLora_clip_str_1: '1',
        MyLora_lora_name_2: 'loraB.safetensors',
        MyLora_lora_wt_2: '-0.5',
        MyLora_model_str_2: '1',
        MyLora_clip_str_2: '0.95',
      })
    })

    it('should parse StandardLoraStack inputs with lora_count correctly', () => {
      const node = {
        inputs: {
          lora_count: 1,
          lora_name_1: 'standardLora.safetensors',
          lora_wt_1: 0.75,
          model_str_1: 0.8,
          clip_str_1: 0.8,
        },
      }
      const params = extractLoraStackParams(node, 'StdLora')
      expect(params).toEqual({
        StdLora_lora_count: '1',
        StdLora_lora_name_1: 'standardLora.safetensors',
        StdLora_lora_wt_1: '0.75',
        StdLora_model_str_1: '0.8',
        StdLora_clip_str_1: '0.8',
      })
    })

    it('should auto-detect lora count if count properties are undefined', () => {
      const node = {
        inputs: {
          lora_1_name: 'lora1',
          lora_name_3: 'lora3',
        },
      }
      const params = extractLoraStackParams(node, 'AutoLora')
      expect(params['AutoLora_lora_count']).toBe('3')
    })

    it('should handle empty or null nodes safely', () => {
      const paramsNull = extractLoraStackParams(null, 'NullLora')
      expect(paramsNull).toEqual({ NullLora_lora_count: '0' })

      const paramsEmpty = extractLoraStackParams({}, 'EmptyLora')
      expect(paramsEmpty).toEqual({ EmptyLora_lora_count: '0' })
    })
  })

  describe('injectLoraStackParams', () => {
    it('should inject easy loraStack params and reset unused slots and clean standard keys', () => {
      const inputs: Record<string, any> = {
        num_loras: 3,
        lora_1_name: 'old_1.safetensors',
        lora_1_strength: 0.5,
        lora_2_name: 'old_2.safetensors',
        lora_2_strength: 0.6,
        lora_3_name: 'old_3.safetensors',
        lora_3_strength: 0.7,
        lora_count: 3,
        lora_name_1: 'old_1.safetensors',
      }
      const paramValues = {
        LoraRole_lora_count: '1',
        LoraRole_lora_name_1: 'new_1.safetensors',
        LoraRole_lora_wt_1: '0.9',
        LoraRole_model_str_1: '1.0',
        LoraRole_clip_str_1: '1.0',
      }

      injectLoraStackParams(inputs, 'LoraRole', paramValues, 'easy loraStack')

      expect(inputs['num_loras']).toBe(1)
      expect(inputs['lora_1_name']).toBe('new_1.safetensors')
      expect(inputs['lora_1_strength']).toBe(0.9)
      expect(inputs['lora_2_name']).toBe('None')
      expect(inputs['lora_2_strength']).toBe(1.0)
      expect(inputs['lora_3_name']).toBe('None')
      expect(inputs['lora_3_strength']).toBe(1.0)
      expect(inputs['lora_count']).toBeUndefined()
      expect(inputs['lora_name_1']).toBeUndefined()
    })

    it('should inject standard loraStack params and remove exceeding slots and clean easy keys', () => {
      const inputs: Record<string, any> = {
        lora_count: 3,
        lora_name_1: 'old_1.safetensors',
        lora_wt_1: 0.5,
        lora_name_2: 'old_2.safetensors',
        lora_wt_2: 0.6,
        lora_name_3: 'old_3.safetensors',
        lora_wt_3: 0.7,
        lora_2_name: 'leftover_easy.safetensors',
      }
      const paramValues = {
        StdRole_lora_count: '2',
        StdRole_lora_name_1: 'new_1.safetensors',
        StdRole_lora_wt_1: '0.8',
        StdRole_model_str_1: '1.0',
        StdRole_clip_str_1: '1.0',
        StdRole_lora_name_2: 'new_2.safetensors',
        StdRole_lora_wt_2: '0.4',
        StdRole_model_str_2: '1.0',
        StdRole_clip_str_2: '1.0',
      }

      injectLoraStackParams(inputs, 'StdRole', paramValues)

      expect(inputs['lora_count']).toBe(2)
      expect(inputs['lora_name_1']).toBe('new_1.safetensors')
      expect(inputs['lora_wt_1']).toBe(0.8)
      expect(inputs['lora_name_2']).toBe('new_2.safetensors')
      expect(inputs['lora_wt_2']).toBe(0.4)
      expect(inputs['lora_name_3']).toBeUndefined()
      expect(inputs['lora_wt_3']).toBeUndefined()
      expect(inputs['num_loras']).toBeUndefined()
      expect(inputs['lora_2_name']).toBeUndefined()
    })
  })

  describe('injectGeneralParam', () => {
    it('should convert int, float, boolean, and string correctly', () => {
      const inputsInt: Record<string, any> = { steps: 20 }
      injectGeneralParam(inputsInt, 'steps', 'int', '30')
      expect(inputsInt.steps).toBe(30)

      const inputsFloat: Record<string, any> = { cfg: 7.0 }
      injectGeneralParam(inputsFloat, 'cfg', 'float', '8.5')
      expect(inputsFloat.cfg).toBe(8.5)

      const inputsBool: Record<string, any> = { enable: false }
      injectGeneralParam(inputsBool, 'enable', 'boolean', 'true')
      expect(inputsBool.enable).toBe(true)

      const inputsStr: Record<string, any> = { text: '' }
      injectGeneralParam(inputsStr, 'text', 'string', 'masterpiece, best quality')
      expect(inputsStr.text).toBe('masterpiece, best quality')
    })

    it('should fallback to value key if paramName does not exist in inputs but value exists', () => {
      const inputs: Record<string, any> = { value: 'old' }
      injectGeneralParam(inputs, 'non_existent', 'string', 'new_val')
      expect(inputs.value).toBe('new_val')
    })
  })

  describe('injectWorkflowParams', () => {
    const mockWorkflow: Workflow = {
      id: 1,
      name: 'Test Workflow',
      created_at: '',
      json_body: {
        '1': {
          inputs: {
            seed: 12345,
          },
        },
        '2': {
          inputs: {
            text: 'hello',
          },
        },
        '3': {
          class_type: 'easy loraStack',
          inputs: {
            num_loras: 1,
            lora_1_name: 'old.safetensors',
            lora_1_strength: 0.5,
          },
        },
      },
      mappings: [
        {
          id: 1,
          master_id: 1,
          node_id: '1',
          role: 'Sampler_Seed',
          param_name: 'seed',
          input_type: 'int',
          display_name: 'Seed',
        },
        {
          id: 2,
          master_id: 2,
          node_id: '2',
          role: 'Text_Prompt',
          param_name: 'text',
          input_type: 'string',
          display_name: 'Prompt',
        },
        {
          id: 3,
          master_id: 3,
          node_id: '3',
          role: 'MyLora',
          param_name: null,
          input_type: 'lora_stack',
          display_name: 'LoRA Stack',
        },
      ],
    }

    it('should inject parameters without modifying original workflow JSON (immutability)', () => {
      const result = injectWorkflowParams({
        workflow: mockWorkflow,
        paramValues: {
          Text_Prompt: 'updated prompt',
        },
        cloneJson: true,
      })

      expect((result['2'] as any).inputs.text).toBe('updated prompt')
      expect((mockWorkflow.json_body as any)['2'].inputs.text).toBe('hello')
    })

    it('should inject seed with random and fixed modes correctly', () => {
      const fixedResult = injectWorkflowParams({
        workflow: mockWorkflow,
        paramValues: {},
        seedOptions: {
          seedMode: 'fixed',
          seed: 1000,
          index: 2,
        },
      })
      expect((fixedResult['1'] as any).inputs.seed).toBe(1002)

      const randomResult = injectWorkflowParams({
        workflow: mockWorkflow,
        paramValues: {},
        seedOptions: {
          seedMode: 'random',
          seed: 1000,
        },
      })
      expect((randomResult['1'] as any).inputs.seed).toBeGreaterThanOrEqual(0)
    })

    it('injects dedicated seeds as numbers and preserves nested source graph values', () => {
      const dedicatedWorkflow: Workflow = {
        ...mockWorkflow,
        json_body: {
          ...mockWorkflow.json_body,
          '1': { inputs: { seed: 10, nested: { keep: true } } },
          '4': { inputs: { seed: 20 } },
        },
        mappings: [
          { ...mockWorkflow.mappings[0], input_type: 'seed' },
          { ...mockWorkflow.mappings[0], id: 4, master_id: 4, variant_id: 2, node_id: '4', role: 'Sampler_Seed_Rough', input_type: 'seed' },
        ],
      }

      const result = injectWorkflowParams({
        workflow: dedicatedWorkflow,
        paramValues: { Sampler_Seed: '31', Sampler_Seed_Rough: '41' },
        seedOptions: { seedMode: 'fixed', seed: 999 },
        resolvedSeeds: { 'master:1:variant:legacy': 32, 'master:4:variant:2': 42 },
      })

      expect((result['1'] as any).inputs.seed).toBe(32)
      expect((result['4'] as any).inputs.seed).toBe(42)
      expect((result['1'] as any).inputs.seed).not.toBe('32')
      expect((result['1'] as any).inputs.nested.keep).toBe(true)
      expect((dedicatedWorkflow.json_body as any)['1'].inputs.seed).toBe(10)
      expect((dedicatedWorkflow.json_body as any)['1'].inputs.nested.keep).toBe(true)
    })

    it('injects resolved values only into registered noise_seed inputs and validates every seed before mutation', () => {
      const first = { ...mockWorkflow.mappings[0], input_type: 'seed', fallback_param_names: ['noise_seed'] }
      const second = { ...first, id: 4, master_id: 4, node_id: '4', role: 'Sampler_Seed_Rough', param_name: 'seed' }
      const graph = { ...mockWorkflow.json_body, '1': { inputs: { noise_seed: 1 } }, '4': { inputs: { noise_seed: 2 } } }
      const dedicated: Workflow = { ...mockWorkflow, json_body: graph, mappings: [first, second] }
      const original = JSON.stringify(graph)
      const result = injectWorkflowParams({
        workflow: dedicated,
        paramValues: { Sampler_Seed: '11', Sampler_Seed_Rough: '22' },
        resolvedSeeds: { 'master:1:variant:legacy': 11, 'master:4:variant:legacy': 22 },
      })
      expect((result['1'] as any).inputs).toEqual({ noise_seed: 11 })
      expect((result['4'] as any).inputs).toEqual({ noise_seed: 22 })
      expect(JSON.stringify(graph)).toBe(original)

      const invalidGraph = { ...graph, '4': { inputs: { other: 2 } } }
      const invalid: Workflow = { ...dedicated, json_body: invalidGraph }
      const before = JSON.stringify(invalidGraph)
      expect(() => injectWorkflowParams({ workflow: invalid, paramValues: { Sampler_Seed: '11', Sampler_Seed_Rough: '22' }, cloneJson: false })).toThrow(/seed入力/)
      expect(JSON.stringify(invalidGraph)).toBe(before)
    })

    it('reads dedicated seed defaults through fallback inputs and returns empty values for missing or referenced inputs', () => {
      const primary = { ...mockWorkflow.mappings[0], input_type: 'seed', fallback_param_names: ['noise_seed'] }
      const missing = { ...primary, id: 4, master_id: 4, node_id: '4', role: 'missing_seed' }
      const reference = { ...primary, id: 5, master_id: 5, node_id: '5', role: 'reference_seed' }
      const source: Workflow = {
        ...mockWorkflow,
        mappings: [primary, missing, reference],
        json_body: { ...mockWorkflow.json_body, '1': { inputs: { noise_seed: 71 } }, '4': { inputs: { other: 1 } }, '5': { inputs: { noise_seed: ['9', 0] } } },
      }
      expect(getInitialParams(source)).toMatchObject({ Sampler_Seed: '71', missing_seed: '', reference_seed: '' })
    })

    it('maps deterministic random batch draws 11, 22, and 33 to numeric graph inputs', () => {
      const seeds = ['A', 'B', 'C'].map((role, index) => ({
        ...mockWorkflow.mappings[0], id: index + 1, master_id: index + 1, node_id: String(index + 1), role: `seed_${role}`,
        input_type: 'seed', fallback_param_names: ['noise_seed'],
      }))
      const source: Workflow = {
        ...mockWorkflow,
        mappings: seeds,
        json_body: Object.fromEntries(seeds.map(seed => [seed.node_id, { inputs: { noise_seed: 0 } }])),
      }
      let params: Record<string, string> = { seed_A: '1', seed_B: '2', seed_C: '3' }
      seeds.forEach(seed => { params = setSeedModeForMapping(seed, params, 'random') })
      const draw = vi.fn().mockReturnValueOnce(11).mockReturnValueOnce(22).mockReturnValueOnce(33)
      const batch = prepareSeedBatch({ workflow: source, paramValues: params, batchSize: 1, randomUint32: draw })
      const result = injectWorkflowParams({ workflow: source, paramValues: batch[0].actualParamValues, resolvedSeeds: batch[0].seedsBySlot })
      expect(seeds.map(seed => (result[seed.node_id] as any).inputs.noise_seed)).toEqual([11, 22, 33])
      expect(seeds.every(seed => (result[seed.node_id] as any).inputs.seed === undefined)).toBe(true)
    })

    it('requires resolved values for generation and validates saved dedicated seed values', () => {
      const dedicatedWorkflow: Workflow = {
        ...mockWorkflow,
        mappings: [{ ...mockWorkflow.mappings[0], input_type: 'seed' }],
      }
      expect(() => injectWorkflowParams({
        workflow: dedicatedWorkflow,
        paramValues: { Sampler_Seed: '7' },
        resolvedSeeds: {},
      })).toThrow(/resolved seed/i)

      const invalidValues = ['-1', '4294967296', '1.5', 'nope']
      for (const seed of invalidValues) {
        expect(() => injectWorkflowParams({
          workflow: dedicatedWorkflow,
          paramValues: { Sampler_Seed: seed },
        })).toThrow()
      }
    })

    it('uses the value input and restores historical seed roles only through a unique stage suffix', () => {
      const historicalWorkflow: Workflow = {
        ...mockWorkflow,
        json_body: { ...mockWorkflow.json_body, '1': { inputs: { value: 8 } } },
        mappings: [{ ...mockWorkflow.mappings[0], role: 'Sampler_Seed_v2', input_type: 'seed', fallback_param_names: ['value'] }],
      }
      const stage = { suffix: '_v2', previous_suffixes: ['_v1'] } as any
      const result = injectWorkflowParams({
        workflow: historicalWorkflow,
        paramValues: { Sampler_Seed_v1: '19' },
        stages: [stage],
      })
      expect((result['1'] as any).inputs.value).toBe(19)

      const ambiguousWorkflow = {
        ...historicalWorkflow,
        mappings: [
          ...historicalWorkflow.mappings,
          { ...historicalWorkflow.mappings[0], id: 7, master_id: 7, role: 'Sampler_Seed_Final' },
        ],
      }
      expect(() => injectWorkflowParams({
        workflow: ambiguousWorkflow,
        paramValues: { Sampler_Seed_v1: '19' },
        stages: [stage, { suffix: '_Final', previous_suffixes: ['_v1'] } as any],
      })).toThrow(/ambiguous historical role/i)
    })

    it('keeps legacy global seed injection separate from dedicated seed values', () => {
      const dedicatedWorkflow: Workflow = {
        ...mockWorkflow,
        mappings: [
          mockWorkflow.mappings[0],
          { ...mockWorkflow.mappings[0], id: 5, master_id: 5, variant_id: 3, node_id: '4', role: 'Sampler_Seed_Rough', input_type: 'seed' },
        ],
        json_body: { ...mockWorkflow.json_body, '4': { inputs: { seed: 0 } } },
      }
      const result = injectWorkflowParams({
        workflow: dedicatedWorkflow,
        paramValues: { Sampler_Seed: '10', Sampler_Seed_Rough: '77', __seed_modes_v1: '{"version":1}' },
        seedOptions: { seedMode: 'fixed', seed: 100, index: 2 },
        resolvedSeeds: { 'master:5:variant:3': 77 },
      })
      expect((result['1'] as any).inputs.seed).toBe(102)
      expect((result['4'] as any).inputs.seed).toBe(77)
      expect(JSON.stringify(result)).not.toContain('__seed_modes_v1')
    })

    it('retains ordinary float injection while adding dedicated seed injection', () => {
      const workflow: Workflow = {
        ...mockWorkflow,
        json_body: { ...mockWorkflow.json_body, '4': { inputs: { cfg: 1.25 } } },
        mappings: [
          { ...mockWorkflow.mappings[0], input_type: 'seed' },
          { ...mockWorkflow.mappings[1], id: 6, master_id: 6, node_id: '4', role: 'Cfg', param_name: 'cfg', input_type: 'float' },
        ],
      }
      const result = injectWorkflowParams({
        workflow,
        paramValues: { Sampler_Seed: '5', Cfg: '3.75' },
        resolvedSeeds: { 'master:1:variant:legacy': 5 },
      })
      expect((result['4'] as any).inputs.cfg).toBe(3.75)
    })
  })
})
