import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerateAction } from '../useGenerateAction';
import { useGenerationStore } from '../../../../store/useGenerationStore';
import type { Workflow } from '../../../../api/types';

vi.mock('../../../../store/useGenerationStore', () => {
  const store = {
    paramValues: {},
    batchSize: 1,
    seedMode: 'random',
    seed: 12345,
    queuePrompt: vi.fn(),
  };
  return {
    useGenerationStore: () => store,
  };
});

describe('useGenerateAction', () => {
  let mockStore: any;

  beforeEach(() => {
    mockStore = useGenerationStore();
    mockStore.paramValues = {};
    mockStore.batchSize = 1;
    mockStore.seedMode = 'random';
    mockStore.seed = 12345;
    mockStore.queuePrompt.mockReset();
  });

  const baseWorkflow: Workflow = {
    id: 1,
    name: 'Test Workflow',
    created_at: '',
    json_body: {
      '3': {
        inputs: {
          seed: 0,
        },
      },
      '4': {
        inputs: {
          value: 0,
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
    ],
  };

  it('should use seedNode.param_name when present in node inputs', async () => {
    mockStore.seedMode = 'fixed';
    mockStore.seed = 1000;
    mockStore.batchSize = 3;

    const { handleGenerate } = useGenerateAction(baseWorkflow);
    await handleGenerate();

    expect(mockStore.queuePrompt).toHaveBeenCalledTimes(3);
    expect(mockStore.queuePrompt.mock.calls[0][0]['3'].inputs['seed']).toBe(1000);
    expect(mockStore.queuePrompt.mock.calls[1][0]['3'].inputs['seed']).toBe(1001);
    expect(mockStore.queuePrompt.mock.calls[2][0]['3'].inputs['seed']).toBe(1002);
  });

  it('should fallback to value when param_name is not present but value exists in node inputs', async () => {
    const valueFallbackWorkflow: Workflow = {
      ...baseWorkflow,
      mappings: [
        {
          id: 1,
          master_id: 1,
          node_id: '4', // maps to node '4' which has 'value' instead of 'seed'
          role: 'Sampler_Seed',
          param_name: 'seed',
          input_type: 'int',
          display_name: 'Value Node',
        },
      ],
    };

    mockStore.seedMode = 'fixed';
    mockStore.seed = 2000;
    mockStore.batchSize = 2;

    const { handleGenerate } = useGenerateAction(valueFallbackWorkflow);
    await handleGenerate();

    expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
    expect(mockStore.queuePrompt.mock.calls[0][0]['4'].inputs['value']).toBe(2000);
    expect(mockStore.queuePrompt.mock.calls[1][0]['4'].inputs['value']).toBe(2001);
  });

  it('should shuffle (randomize) seeds for each batch when seedMode is random', async () => {
    mockStore.seedMode = 'random';
    mockStore.batchSize = 3;

    const { handleGenerate } = useGenerateAction(baseWorkflow);
    await handleGenerate();

    expect(mockStore.queuePrompt).toHaveBeenCalledTimes(3);
    const s1 = mockStore.queuePrompt.mock.calls[0][0]['3'].inputs['seed'];
    const s2 = mockStore.queuePrompt.mock.calls[1][0]['3'].inputs['seed'];
    const s3 = mockStore.queuePrompt.mock.calls[2][0]['3'].inputs['seed'];

    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s2).toBeGreaterThanOrEqual(0);
    expect(s3).toBeGreaterThanOrEqual(0);
    // Random seeds should generally be different
    expect(s1).not.toBe(s2);
    expect(s2).not.toBe(s3);
  });

  it('should inject boolean params correctly as true/false booleans', async () => {
    const booleanWorkflow: Workflow = {
      ...baseWorkflow,
      json_body: {
        '3': {
          inputs: {
            active: false,
          },
        },
      },
      mappings: [
        {
          id: 1,
          master_id: 1,
          node_id: '3',
          role: 'Detailer_Enable',
          param_name: 'active',
          input_type: 'boolean',
          display_name: 'Detailer Active',
        },
      ],
    };

    mockStore.paramValues = {
      'Detailer_Enable': 'true',
    };

    const { handleGenerate } = useGenerateAction(booleanWorkflow);
    await handleGenerate();

    expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
    expect(mockStore.queuePrompt.mock.calls[0][0]['3'].inputs['active']).toBe(true);
  });

  it('should inject lora_stack params and delete exceeding node keys', async () => {
    const loraStackWorkflow: Workflow = {
      id: 2,
      name: 'Lora Stack Workflow',
      created_at: '',
      json_body: {
        '15': {
          inputs: {
            lora_count: 2,
            lora_name_1: 'test_a.safetensors',
            lora_wt_1: 0.8,
            model_str_1: 1.0,
            clip_str_1: 1.0,
            lora_name_2: 'test_b.safetensors',
            lora_wt_2: 0.5,
            model_str_2: 1.0,
            clip_str_2: 1.0,
            lora_name_3: 'test_c.safetensors',
            lora_wt_3: 0.9,
          },
        },
      },
      mappings: [
        {
          id: 2,
          master_id: 2,
          node_id: '15',
          role: 'Lora_Stack',
          param_name: 'lora_stack',
          input_type: 'lora_stack',
          display_name: 'LoRA Stack Node',
        },
      ],
    };

    mockStore.paramValues = {
      'Lora_Stack_lora_count': '2',
      'Lora_Stack_lora_name_1': 'new_a.safetensors',
      'Lora_Stack_lora_wt_1': '0.7',
      'Lora_Stack_model_str_1': '1.0',
      'Lora_Stack_clip_str_1': '1.0',
      'Lora_Stack_lora_name_2': 'new_b.safetensors',
      'Lora_Stack_lora_wt_2': '0.6',
      'Lora_Stack_model_str_2': '1.0',
      'Lora_Stack_clip_str_2': '1.0',
    };

    const { handleGenerate } = useGenerateAction(loraStackWorkflow);
    await handleGenerate();

    const nodeInputs = mockStore.queuePrompt.mock.calls[0][0]['15'].inputs;
    expect(nodeInputs['lora_count']).toBe(2);
    expect(nodeInputs['lora_name_1']).toBe('new_a.safetensors');
    expect(nodeInputs['lora_wt_1']).toBe(0.7);
    expect(nodeInputs['lora_name_2']).toBe('new_b.safetensors');
    expect(nodeInputs['lora_wt_2']).toBe(0.6);
    expect(nodeInputs['lora_name_3']).toBeUndefined();
    expect(nodeInputs['lora_wt_3']).toBeUndefined();
  });

  it('should inject easy lora_stack params and reset unused slots', async () => {
    const easyLoraStackWorkflow: Workflow = {
      id: 3,
      name: 'Easy Lora Stack Workflow',
      created_at: '',
      json_body: {
        '16': {
          class_type: 'easy loraStack',
          inputs: {
            num_loras: 3,
            lora_1_name: 'test_a.safetensors',
            lora_1_strength: 0.8,
            lora_1_model_strength: 1.0,
            lora_1_clip_strength: 1.0,
            lora_2_name: 'test_b.safetensors',
            lora_2_strength: 0.5,
            lora_2_model_strength: 1.0,
            lora_2_clip_strength: 1.0,
            lora_3_name: 'test_c.safetensors',
            lora_3_strength: 0.9,
            lora_3_model_strength: 1.0,
            lora_3_clip_strength: 1.0,
            // Mixed standard keys to test cleanup
            lora_count: 3,
            lora_name_1: 'test_a.safetensors',
          },
        },
      },
      mappings: [
        {
          id: 3,
          master_id: 3,
          node_id: '16',
          role: 'Lora_Stack',
          param_name: 'lora_stack',
          input_type: 'lora_stack',
          display_name: 'LoRA Stack Node',
        },
      ],
    };

    mockStore.paramValues = {
      'Lora_Stack_lora_count': '2',
      'Lora_Stack_lora_name_1': 'new_a.safetensors',
      'Lora_Stack_lora_wt_1': '0.7',
      'Lora_Stack_model_str_1': '1.0',
      'Lora_Stack_clip_str_1': '1.0',
      'Lora_Stack_lora_name_2': 'new_b.safetensors',
      'Lora_Stack_lora_wt_2': '0.6',
      'Lora_Stack_model_str_2': '1.0',
      'Lora_Stack_clip_str_2': '1.0',
    };

    const { handleGenerate } = useGenerateAction(easyLoraStackWorkflow);
    await handleGenerate();

    const nodeInputs = mockStore.queuePrompt.mock.calls[0][0]['16'].inputs;
    expect(nodeInputs['num_loras']).toBe(2);
    expect(nodeInputs['lora_1_name']).toBe('new_a.safetensors');
    expect(nodeInputs['lora_1_strength']).toBe(0.7);
    expect(nodeInputs['lora_2_name']).toBe('new_b.safetensors');
    expect(nodeInputs['lora_2_strength']).toBe(0.6);
    // Unused slots reset to None/1.0
    expect(nodeInputs['lora_3_name']).toBe('None');
    expect(nodeInputs['lora_3_strength']).toBe(1.0);
    // Standard keys cleaned up
    expect(nodeInputs['lora_count']).toBeUndefined();
    expect(nodeInputs['lora_name_1']).toBeUndefined();
  });

  it('should fallback to workflow default values if paramValues in store is missing a role key', async () => {
    const ckptWorkflow: Workflow = {
      id: 4,
      name: 'Checkpoint Workflow',
      created_at: '',
      json_body: {
        '1': {
          inputs: {
            ckpt_name: 'v1-5-pruned.safetensors',
          },
        },
      },
      mappings: [
        {
          id: 10,
          master_id: 10,
          node_id: '1',
          role: 'Checkpoint_Name',
          param_name: 'ckpt_name',
          input_type: 'string',
          display_name: 'Checkpoint',
        },
      ],
    };

    // Store has empty paramValues (simulating a preset missing the new mapping key)
    mockStore.paramValues = {};

    const { handleGenerate } = useGenerateAction(ckptWorkflow);
    await handleGenerate();

    const nodeInputs = mockStore.queuePrompt.mock.calls[0][0]['1'].inputs;
    expect(nodeInputs['ckpt_name']).toBe('v1-5-pruned.safetensors');
  });
});
