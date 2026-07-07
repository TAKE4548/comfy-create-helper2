import { describe, it, expect } from 'vitest';
import { getInitialParams, extractGeneralParam, extractLoraStackParams } from '../useWorkflowParams';
import type { Workflow } from '../../../../api/types';

describe('extractGeneralParam', () => {
  it('should return param value when paramName exists in inputs', () => {
    const node = { inputs: { testKey: 'testVal' } };
    expect(extractGeneralParam(node, 'testKey')).toBe('testVal');
  });

  it('should return value input as fallback when target paramName does not exist', () => {
    const node = { inputs: { value: 'fallbackVal' } };
    expect(extractGeneralParam(node, 'testKey')).toBe('fallbackVal');
  });

  it('should return empty string when node or inputs is missing', () => {
    expect(extractGeneralParam(null, 'testKey')).toBe('');
    expect(extractGeneralParam({}, 'testKey')).toBe('');
  });
});

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
    };
    const params = extractLoraStackParams(node, 'MyLora');
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
    });
  });

  it('should parse StandardLoraStack inputs with lora_count correctly', () => {
    const node = {
      inputs: {
        lora_count: 1,
        lora_name_1: 'standardLora.safetensors',
        lora_wt_1: 0.75,
        model_str_1: 0.8,
        clip_str_1: 0.8,
      },
    };
    const params = extractLoraStackParams(node, 'StdLora');
    expect(params).toEqual({
      StdLora_lora_count: '1',
      StdLora_lora_name_1: 'standardLora.safetensors',
      StdLora_lora_wt_1: '0.75',
      StdLora_model_str_1: '0.8',
      StdLora_clip_str_1: '0.8',
    });
  });

  it('should auto-detect lora count if count properties are undefined', () => {
    const node = {
      inputs: {
        lora_1_name: 'lora1',
        lora_name_3: 'lora3',
      },
    };
    const params = extractLoraStackParams(node, 'AutoLora');
    expect(params['AutoLora_lora_count']).toBe('3');
  });

  it('should handle empty or null nodes safely', () => {
    const paramsNull = extractLoraStackParams(null, 'NullLora');
    expect(paramsNull).toEqual({ NullLora_lora_count: '0' });

    const paramsEmpty = extractLoraStackParams({}, 'EmptyLora');
    expect(paramsEmpty).toEqual({ EmptyLora_lora_count: '0' });
  });
});

describe('getInitialParams (Integration)', () => {
  const mockWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    created_at: '',
    json_body: {
      '3': {
        inputs: {
          seed: 12345,
        },
      },
      '4': {
        inputs: {
          value: 'default_val',
        },
      },
      '5': {
        inputs: {
          num_loras: 1,
          lora_1_name: 'my_lora.safetensors',
          lora_1_strength: 0.5,
        },
      },
      '6': {
        inputs: {
          active: true,
        },
      },
    },
    mappings: [
      {
        id: 1,
        master_id: 1,
        node_id: '3',
        role: 'Sampler_Seed',
        param_name: 'seed',
        input_type: 'int',
        display_name: 'Seed Node',
      },
      {
        id: 2,
        master_id: 2,
        node_id: '4',
        role: 'Text_Prompt',
        param_name: 'value',
        input_type: 'string',
        display_name: 'Text Node',
      },
      {
        id: 3,
        master_id: 3,
        node_id: '5',
        role: 'MyLoraStack',
        param_name: null,
        input_type: 'lora_stack',
        display_name: 'LoRA Stack',
      },
      {
        id: 4,
        master_id: 4,
        node_id: '6',
        role: 'Detailer_Enable',
        param_name: 'active',
        input_type: 'boolean',
        display_name: 'Detailer Active',
      },
    ],
  };

  it('should parse and return all parameters including general and lora stack correctly', () => {
    const params = getInitialParams(mockWorkflow);
    expect(params).toEqual({
      Sampler_Seed: '12345',
      Text_Prompt: 'default_val',
      MyLoraStack_lora_count: '1',
      MyLoraStack_lora_name_1: 'my_lora.safetensors',
      MyLoraStack_lora_wt_1: '0.5',
      MyLoraStack_model_str_1: '1.0',
      MyLoraStack_clip_str_1: '1.0',
      Detailer_Enable: 'true',
    });
  });
});

