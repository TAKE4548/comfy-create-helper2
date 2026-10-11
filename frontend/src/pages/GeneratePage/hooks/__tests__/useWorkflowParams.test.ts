import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getInitialParams, extractGeneralParam, extractLoraStackParams, useWorkflowParams, healLegacyParamKeys } from '../useWorkflowParams';
import { useGenerationStore } from '../../../../store/useGenerationStore';
import { LS_KEYS } from '../../../../utils/localStorageKeys';
import type { Workflow } from '../../../../api/types';
import { PROMPT_RECORD_KEY, ASSOCIATIONS_KEY } from '../../../../utils/generationRecord';
import { SEED_MODES_KEY, readSeedSettings } from '../../../../utils/seedModel';

it('REQ-316 excludes both reserved keys from restored inputs, including unknown records', () => {
  const source = { Quality: '', Sampler_Seed: 42, [PROMPT_RECORD_KEY]: '{broken', [ASSOCIATIONS_KEY]: '{"version":99}' };
  const { result } = renderHook(() => useWorkflowParams(undefined, null), { wrapper: createWrapper() });
  act(() => result.current.loadSnapshotParams(source));
  expect(useGenerationStore.getState().paramValues).toEqual({ Quality: '', Sampler_Seed: '42' });
  expect(useGenerationStore.getState().seed).toBe(42);
  expect(useGenerationStore.getState().seedMode).toBe('fixed');
  expect(source[PROMPT_RECORD_KEY]).toBe('{broken');
});

describe('REQ-350 dedicated seed initialization', () => {
  const seedWorkflow: Workflow = {
    id: 350,
    name: 'Seed Workflow',
    created_at: '',
    json_body: {
      '10': { inputs: { seed: 123 } },
      '11': { inputs: { seed: 456 } },
    },
    mappings: [
      { id: 10, master_id: 10, node_id: '10', variant_id: 1, role: 'MainSeed', param_name: 'seed', input_type: 'seed', display_name: 'Main Seed' },
      { id: 11, master_id: 11, node_id: '11', variant_id: 1, role: 'RoughSeed', param_name: 'seed', input_type: 'seed', display_name: 'Rough Seed' },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState({ paramValues: {}, sets: [], activeSetId: null });
  });

  it('uses graph seed defaults while preserving existing role values and valid modes', () => {
    const mapping = seedWorkflow.mappings[0];
    const params = { MainSeed: '0', RoughSeed: '456', [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes: { 'master:10:variant:1': 'random' } }) };
    useGenerationStore.setState({ paramValues: params });

    renderHook(() => useWorkflowParams(seedWorkflow, 350), { wrapper: createWrapper() });

    const values = useGenerationStore.getState().paramValues;
    expect(values.MainSeed).toBe('0');
    expect(values.RoughSeed).toBe('456');
    expect(readSeedSettings(mapping, values)).toEqual({ mode: 'random', seed: 0 });
  });

  it('restores snapshot dedicated seeds as fixed and excludes mode metadata from ordinary params', () => {
    const { result } = renderHook(() => useWorkflowParams(seedWorkflow, 350), { wrapper: createWrapper() });
    act(() => result.current.loadSnapshotParams({ MainSeed: 0, RoughSeed: 99, Sampler_Seed: 77, [SEED_MODES_KEY]: 'invalid', [PROMPT_RECORD_KEY]: '{}' }));

    const values = useGenerationStore.getState().paramValues;
    expect(values[SEED_MODES_KEY]).toBeDefined();
    expect(values[SEED_MODES_KEY]).not.toBe('invalid');
    expect(values[PROMPT_RECORD_KEY]).toBeUndefined();
    expect(readSeedSettings(seedWorkflow.mappings[0], values)).toEqual({ mode: 'fixed', seed: 0 });
    expect(readSeedSettings(seedWorkflow.mappings[1], values)).toEqual({ mode: 'fixed', seed: 99 });
    expect(useGenerationStore.getState().seed).toBe(77);
    expect(useGenerationStore.getState().seedMode).toBe('fixed');
  });

  it('resets dedicated seed values to graph defaults in fixed mode', () => {
    useGenerationStore.setState({ paramValues: { MainSeed: '999', RoughSeed: '999' } });
    const { result } = renderHook(() => useWorkflowParams(seedWorkflow, 350), { wrapper: createWrapper() });
    act(() => result.current.handleResetDefaultParams());

    const values = useGenerationStore.getState().paramValues;
    expect(readSeedSettings(seedWorkflow.mappings[0], values)).toEqual({ mode: 'fixed', seed: 123 });
    expect(readSeedSettings(seedWorkflow.mappings[1], values)).toEqual({ mode: 'fixed', seed: 456 });
  });
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
};

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

describe('useWorkflowParams hook - remapping backfill', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState({
      paramValues: {},
      sets: [],
    });
  });

  it('should complement missing role keys in all sets when workflow has new roles', () => {
    useGenerationStore.setState({
      sets: [
        {
          id: 'set-1',
          name: 'Set 1',
          paramValues: { Text_Prompt: 'existing prompt' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 1,
          checked: true,
        },
      ],
    });

    const mockWorkflow: Workflow = {
      id: 1,
      name: 'Test Workflow',
      created_at: '',
      json_body: {
        '1': { inputs: { ckpt_name: 'v1-5-pruned.safetensors' } },
        '2': { inputs: { text: 'hello' } },
      },
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'Checkpoint_Name', param_name: 'ckpt_name', input_type: 'string', display_name: 'Checkpoint' },
        { id: 2, master_id: 2, node_id: '2', role: 'Text_Prompt', param_name: 'text', input_type: 'string', display_name: 'Prompt' },
      ],
    };

    renderHook(() => useWorkflowParams(mockWorkflow, 1), { wrapper: createWrapper() });

    const updatedSets = useGenerationStore.getState().sets;
    expect(updatedSets[0].paramValues).toEqual({
      Checkpoint_Name: 'v1-5-pruned.safetensors',
      Text_Prompt: 'existing prompt',
    });
  });

  it('should merge missing keys into active set params if new roles exist', () => {
    const mockWorkflow: Workflow = {
      id: 1,
      name: 'Test Workflow',
      created_at: '',
      json_body: {
        '1': { inputs: { ckpt_name: 'default.safetensors' } },
        '2': { inputs: { text: 'default prompt' } },
      },
      mappings: [
        { id: 1, master_id: 1, node_id: '1', role: 'Checkpoint_Name', param_name: 'ckpt_name', input_type: 'string', display_name: 'Checkpoint' },
        { id: 2, master_id: 2, node_id: '2', role: 'Text_Prompt', param_name: 'text', input_type: 'string', display_name: 'Prompt' },
      ],
    };

    useGenerationStore.setState({
      activeSetId: 'set-1',
      sets: [
        {
          id: 'set-1',
          name: 'Set 1',
          paramValues: { Text_Prompt: 'saved prompt' },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 1,
          checked: true,
        },
      ],
    });

    renderHook(() => useWorkflowParams(mockWorkflow, 1), { wrapper: createWrapper() });

    const activeParams = useGenerationStore.getState().paramValues;
    expect(activeParams).toEqual({
      Checkpoint_Name: 'default.safetensors',
      Text_Prompt: 'saved prompt',
    });

    // Single LocalStorage key is no longer written
    expect(localStorage.getItem(LS_KEYS.PARAMS_PREFIX + '1')).toBeNull();
  });

  describe('healLegacyParamKeys', () => {
    it('should promote "Resolution Selecto" to "Resolution Selector"', () => {
      const input = {
        'Resolution Selecto': '1:1 (Square)',
        'Prompt_Core': 'masterpiece',
      };
      const result = healLegacyParamKeys(input);
      expect(result).toEqual({
        'Resolution Selector': '1:1 (Square)',
        'Prompt_Core': 'masterpiece',
      });
      expect(result['Resolution Selecto']).toBeUndefined();
    });

    it('should not overwrite existing "Resolution Selector"', () => {
      const input = {
        'Resolution Selector': '16:9 (Landscape)',
        'Resolution Selecto': '1:1 (Square)',
      };
      const result = healLegacyParamKeys(input);
      expect(result['Resolution Selector']).toBe('16:9 (Landscape)');
    });
  });
});
