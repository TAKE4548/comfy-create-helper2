import { describe, it, expect } from 'vitest';
import { getInitialParams } from '../useWorkflowParams';
import type { Workflow } from '../../../../api/types';

describe('getInitialParams', () => {
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
    ],
  };

  it('should parse and return default parameters from workflow json_body', () => {
    const params = getInitialParams(mockWorkflow);
    expect(params).toEqual({
      Sampler_Seed: '12345',
      Text_Prompt: 'default_val',
    });
  });
});
