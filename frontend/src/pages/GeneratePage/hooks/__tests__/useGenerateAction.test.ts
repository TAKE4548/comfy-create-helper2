import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerateAction } from '../useGenerateAction';
import { useGenerationStore } from '../../../../store/useGenerationStore';
import type { Workflow } from '../../../../api/types';

vi.mock('../../../../store/useGenerationStore', () => {
  const store = {
    paramValues: {},
    promptChips: {},
    activeSetId: null,
    batchSize: 1,
    seedMode: 'random',
    seed: 12345,
    sets: [],
    appliedAssets: {},
    bypassProfiles: [],
    paramSyncGroups: [],
    queuePrompt: vi.fn(),
    setActiveBatch: vi.fn(),
    setSubmissionAbortController: vi.fn(),
    setIsBatchSubmitting: vi.fn(),
    fetchQueue: vi.fn(),
    setErrorToast: vi.fn(),
  };
  const hook: any = () => store;
  hook.getState = () => store;
  return {
    useGenerationStore: hook,
  };
});

describe('useGenerateAction', () => {
  let mockStore: any;

  beforeEach(() => {
    mockStore = (useGenerationStore as any)();
    mockStore.paramValues = {};
    mockStore.promptChips = {};
    mockStore.activeSetId = null;
    mockStore.batchSize = 1;
    mockStore.seedMode = 'random';
    mockStore.seed = 12345;
    mockStore.sets = [];
    mockStore.activeBatch = [];
    mockStore.appliedAssets = {};
    mockStore.bypassProfiles = [];
    mockStore.paramSyncGroups = [];
    mockStore.queuePrompt.mockReset();
    mockStore.setActiveBatch.mockReset();
    mockStore.setSubmissionAbortController.mockReset();
    mockStore.setIsBatchSubmitting.mockReset();
    mockStore.fetchQueue.mockReset();
    mockStore.setErrorToast.mockReset();
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

  describe('handleGenerateSets REQ-140 batch queueing and abort control', () => {
    it('should pass skipQueueFetch: true to queuePrompt and call fetchQueue once after all sets are queued', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
        { id: '2', name: 'Set B', checked: false, batchSize: 1, seedMode: 'random', seed: 200, paramValues: {}, appliedAssets: {} },
        { id: '3', name: 'Set C', checked: true, batchSize: 1, seedMode: 'random', seed: 300, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt.mockResolvedValue('prompt-id-123');

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setSubmissionAbortController).toHaveBeenCalled();
      // 2 jobs for Set A + 1 job for Set C = 3 calls
      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(3);
      expect(mockStore.queuePrompt.mock.calls[0][2]).toMatchObject({
        skipQueueFetch: true,
        signal: expect.any(AbortSignal),
        isBatchIntermediate: true,
      });
      expect(mockStore.queuePrompt.mock.calls[1][2]).toMatchObject({
        skipQueueFetch: true,
        signal: expect.any(AbortSignal),
        isBatchIntermediate: true,
      });
      expect(mockStore.queuePrompt.mock.calls[2][2]).toMatchObject({
        skipQueueFetch: true,
        signal: expect.any(AbortSignal),
        isBatchIntermediate: true,
      });

      // Initial placeholder batch + per prompt updates + final batch
      expect(mockStore.setActiveBatch).toHaveBeenCalled();
      expect(mockStore.fetchQueue).toHaveBeenCalledTimes(1);
    });

    it('should abort queueing loop when abort controller is aborted mid-execution', async () => {
      let capturedController: AbortController | null = null;
      mockStore.setSubmissionAbortController.mockImplementation((controller: AbortController) => {
        capturedController = controller;
      });

      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 3, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      let callCount = 0;
      mockStore.queuePrompt.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Abort after first job is submitted
          capturedController?.abort();
        }
        return `prompt-id-${callCount}`;
      });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      // Only 1 job should have been submitted because loop aborts before index 1
      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      expect(mockStore.fetchQueue).not.toHaveBeenCalled();
    });
  });

  describe('handleGenerateSets REQ-152 batch queueing optimization & cancellation recovery fixes', () => {
    it('should pass signal and isBatchIntermediate: true to queuePrompt (Issue 2 & Issue 3)', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 1, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt.mockResolvedValue('prompt-1');

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({
          skipQueueFetch: true,
          signal: expect.any(AbortSignal),
          isBatchIntermediate: true,
        })
      );
    });

    it('should not overwrite setActiveBatch and not call fetchQueue in finally when aborted (Issue 1)', async () => {
      let capturedController: AbortController | null = null;
      mockStore.setSubmissionAbortController.mockImplementation((controller: AbortController) => {
        capturedController = controller;
      });

      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      mockStore.queuePrompt.mockImplementation(async () => {
        capturedController?.abort();
        return 'prompt-1';
      });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      expect(mockStore.fetchQueue).not.toHaveBeenCalled();
    });

    it('should immediately return and skip subsequent batch updates when aborted right after queuePrompt (Issue 1 & 2)', async () => {
      let capturedController: AbortController | null = null;
      mockStore.setSubmissionAbortController.mockImplementation((controller: AbortController) => {
        capturedController = controller;
      });

      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      mockStore.queuePrompt.mockImplementation(async () => {
        // simulate aborting during fetch
        capturedController?.abort();
        return null;
      });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      expect(mockStore.setErrorToast).not.toHaveBeenCalled();
      expect(mockStore.fetchQueue).not.toHaveBeenCalled();
    });

    it('should call setIsBatchSubmitting(true) on start and setIsBatchSubmitting(false) in finally (Issue 4)', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 1, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt.mockResolvedValue('prompt-1');

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setIsBatchSubmitting).toHaveBeenCalledWith(true);
      expect(mockStore.setIsBatchSubmitting).toHaveBeenCalledWith(false);
      expect(mockStore.setIsBatchSubmitting).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleGenerateSets REQ-141 instant pending rendering & ComfyUI error handling', () => {
    it('should initialize activeBatch with pending jobs for all checked sets immediately and keep fixed length array during execution', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set 1', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
        { id: '2', name: 'Set 2', checked: true, batchSize: 1, seedMode: 'random', seed: 200, paramValues: {}, appliedAssets: {} },
      ];

      let callIndex = 0;
      mockStore.queuePrompt.mockImplementation(async () => {
        callIndex++;
        return `real-prompt-${callIndex}`;
      });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      // Check initial call to setActiveBatch
      expect(mockStore.setActiveBatch).toHaveBeenCalled();
      const firstCallBatch = mockStore.setActiveBatch.mock.calls[0][0];
      expect(firstCallBatch).toHaveLength(3);
      expect(firstCallBatch[0].setName).toBe('Set 1');
      expect(firstCallBatch[0].status).toBe('pending');
      expect(firstCallBatch[0].promptId).toMatch(/^pending-Set 1-0-/);
      expect(firstCallBatch[1].setName).toBe('Set 1');
      expect(firstCallBatch[1].status).toBe('pending');
      expect(firstCallBatch[1].promptId).toMatch(/^pending-Set 1-1-/);
      expect(firstCallBatch[2].setName).toBe('Set 2');
      expect(firstCallBatch[2].status).toBe('pending');
      expect(firstCallBatch[2].promptId).toMatch(/^pending-Set 2-0-/);

      // Every setActiveBatch call should maintain array length of 3
      mockStore.setActiveBatch.mock.calls.forEach((call: any[]) => {
        expect(call[0]).toHaveLength(3);
      });

      // After first job queued: job 0 promptId updated to real-prompt-1
      const callAfterJob0 = mockStore.setActiveBatch.mock.calls[1][0];
      expect(callAfterJob0[0].promptId).toBe('real-prompt-1');
      expect(callAfterJob0[1].promptId).toMatch(/^pending-Set 1-1-/);
      expect(callAfterJob0[2].promptId).toMatch(/^pending-Set 2-0-/);

      // Final batch should have all real prompt IDs
      const finalCallBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalCallBatch[0].promptId).toBe('real-prompt-1');
      expect(finalCallBatch[1].promptId).toBe('real-prompt-2');
      expect(finalCallBatch[2].promptId).toBe('real-prompt-3');
    });

    it('aggregates a set failure reason into a persistent toast and marks the job failed', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set Fail', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      // Job 0 succeeds, Job 1 returns null (failure)
      mockStore.queuePrompt
        .mockResolvedValueOnce('prompt-success')
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'Node input is missing', outcome: 'failed' });
          return null;
        });
      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '[Set Fail] (2/2) のキュー投入に失敗しました: Node input is missing',
        type: 'error',
        persistent: true,
      });

      // Check final activeBatch has status: 'failed' for second job
      const finalBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalBatch).toHaveLength(2);
      expect(finalBatch[0].promptId).toBe('prompt-success');
      expect(finalBatch[0].status).toBe('pending');
      expect(finalBatch[1].status).toBe('failed');
    });

    it('uses the thrown queuePrompt error when the failure callback was not invoked', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set Error', checked: true, batchSize: 1, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      mockStore.queuePrompt.mockRejectedValueOnce(new Error('Network error'));

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '[Set Error] (1/1) のキュー投入を確認できませんでした: Network error',
        type: 'error',
        persistent: true,
      });

      const finalBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalBatch).toHaveLength(1);
      expect(finalBatch[0].status).toBe('failed');
    });

    it('aggregates failures from multiple sets into one toast with matching reasons', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set A', checked: true, batchSize: 1, seedMode: 'random', seed: 10, paramValues: {}, appliedAssets: {} },
        { id: '2', name: 'Set B', checked: true, batchSize: 1, seedMode: 'random', seed: 20, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'A failed', outcome: 'failed' });
          return null;
        })
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'B timed out', outcome: 'unconfirmed' });
          return null;
        });
      mockStore.fetchQueue.mockRejectedValueOnce(new Error('Refresh failed'));

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setErrorToast).toHaveBeenCalledTimes(1);
      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '[Set A] (1/1) のキュー投入に失敗しました: A failed\n[Set B] (1/1) のキュー投入を確認できませんでした: B timed out',
        type: 'error',
        persistent: true,
      });
      const finalBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalBatch.map((job: any) => job.status)).toEqual(['failed', 'failed']);
    });

    it('shows every failed item reason once and emits no success notification when all items fail', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set Alpha', checked: true, batchSize: 1, seedMode: 'random', seed: 10, paramValues: {}, appliedAssets: {} },
        { id: '2', name: 'Set Beta', checked: true, batchSize: 1, seedMode: 'random', seed: 20, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'Alpha rejected', outcome: 'failed' });
          return null;
        })
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'Beta unavailable', outcome: 'failed' });
          return null;
        });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
      expect(mockStore.setErrorToast).toHaveBeenCalledTimes(1);
      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '[Set Alpha] (1/1) のキュー投入に失敗しました: Alpha rejected\n[Set Beta] (1/1) のキュー投入に失敗しました: Beta unavailable',
        type: 'error',
        persistent: true,
      });
      expect(mockStore.setErrorToast.mock.calls.every(([toast]: any[]) => toast.type === 'error')).toBe(true);
      const finalBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalBatch.map((job: any) => job.status)).toEqual(['failed', 'failed']);
    });

    it('shows the unknown-reason fallback when a submission returns null without a reason', async () => {
      mockStore.sets = [
        { id: '1', name: 'Set Unknown', checked: true, batchSize: 1, seedMode: 'random', seed: 10, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt.mockResolvedValueOnce(null);

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '[Set Unknown] (1/1) のキュー投入に失敗しました: 理由を特定できませんでした',
        type: 'error',
        persistent: true,
      });
    });

    it('does not notify when the submission is cancelled', async () => {
      let controller: AbortController | null = null;
      mockStore.setSubmissionAbortController.mockImplementation((value: AbortController) => { controller = value; });
      mockStore.sets = [
        { id: '1', name: 'Set Cancel', checked: true, batchSize: 1, seedMode: 'random', seed: 10, paramValues: {}, appliedAssets: {} },
      ];
      mockStore.queuePrompt.mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
        controller?.abort();
        options.onSubmissionFailure({ reason: 'Cancelled', outcome: 'failed' });
        return null;
      });

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.setErrorToast).not.toHaveBeenCalled();
    });

    it('passes the submission failure callback and omits the index for one generation request', async () => {
      mockStore.batchSize = 1;
      mockStore.queuePrompt.mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
        options.onSubmissionFailure({ reason: 'Invalid workflow', outcome: 'failed' });
        return null;
      });

      const { handleGenerate } = useGenerateAction(baseWorkflow);
      await handleGenerate();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '生成のキュー投入に失敗しました: Invalid workflow',
        type: 'error',
        persistent: true,
      });
    });

    it('includes the batch position when a single-generation batch has multiple requests', async () => {
      mockStore.batchSize = 2;
      mockStore.queuePrompt
        .mockResolvedValueOnce('prompt-1')
        .mockImplementationOnce(async (_wf: unknown, _metadata: unknown, options: any) => {
          options.onSubmissionFailure({ reason: 'Rejected', outcome: 'failed' });
          return null;
        });

      const { handleGenerate } = useGenerateAction(baseWorkflow);
      await handleGenerate();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: '生成 (2/2)のキュー投入に失敗しました: Rejected',
        type: 'error',
        persistent: true,
      });
    });
  });

  describe('handleGenerate REQ-154 abort control', () => {
    it('should create AbortController and abort single generation loop when cancelled', async () => {
      let capturedController: AbortController | null = null;
      mockStore.setSubmissionAbortController.mockImplementation((controller: AbortController) => {
        capturedController = controller;
      });

      mockStore.batchSize = 4;
      let count = 0;
      mockStore.queuePrompt.mockImplementation(async () => {
        count++;
        if (count === 2) {
          capturedController?.abort();
        }
        return `prompt-${count}`;
      });

      const { handleGenerate } = useGenerateAction(baseWorkflow);
      await handleGenerate();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
      expect(mockStore.setIsBatchSubmitting).toHaveBeenCalledWith(true);
      expect(mockStore.setIsBatchSubmitting).toHaveBeenCalledWith(false);
    });
  });

  describe('handleGenerateSets REQ-154 activeBatch merging on additional submission', () => {
    it('should merge new batch jobs into existing activeBatch array', async () => {
      mockStore.activeBatch = [
        { promptId: 'existing-1', setName: 'Set Old', status: 'generating' },
        { promptId: 'existing-2', setName: 'Set Old', status: 'pending' },
      ];

      mockStore.sets = [
        { id: '1', name: 'Set New', checked: true, batchSize: 2, seedMode: 'random', seed: 100, paramValues: {}, appliedAssets: {} },
      ];

      mockStore.queuePrompt
        .mockResolvedValueOnce('new-prompt-1')
        .mockResolvedValueOnce('new-prompt-2');

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      // First call to setActiveBatch should have length 4 (2 old + 2 new placeholders)
      const firstBatch = mockStore.setActiveBatch.mock.calls[0][0];
      expect(firstBatch).toHaveLength(4);
      expect(firstBatch[0].promptId).toBe('existing-1');
      expect(firstBatch[1].promptId).toBe('existing-2');
      expect(firstBatch[2].promptId).toMatch(/^pending-Set New-0-/);
      expect(firstBatch[3].promptId).toMatch(/^pending-Set New-1-/);

      // Final call should have real prompt IDs for new jobs
      const finalBatch = mockStore.setActiveBatch.mock.calls[mockStore.setActiveBatch.mock.calls.length - 1][0];
      expect(finalBatch).toHaveLength(4);
      expect(finalBatch[2].promptId).toBe('new-prompt-1');
      expect(finalBatch[3].promptId).toBe('new-prompt-2');
    });
  });

  describe('REQ-195-T2 single batch queuePrompt optimization', () => {
    it('handleGenerate passes skipQueueFetch: true to queuePrompt and calls fetchQueue once in finally', async () => {
      mockStore.batchSize = 3;
      mockStore.queuePrompt.mockResolvedValue('prompt-id');

      const { handleGenerate } = useGenerateAction(baseWorkflow);
      await handleGenerate();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(3);
      for (let i = 0; i < 3; i++) {
        expect(mockStore.queuePrompt.mock.calls[i][2]).toMatchObject({
          skipQueueFetch: true,
        });
      }
      expect(mockStore.fetchQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('REQ-220: promptChips effectiveParamValues derivation', () => {
    it('handleGenerate injects only enabled chips as effective param values', async () => {
      mockStore.batchSize = 1;
      mockStore.queuePrompt.mockResolvedValue('prompt-id');
      mockStore.paramValues = {
        Main_Positive_Prompt: 'raw positive text',
      };
      mockStore.promptChips = {
        Main_Positive_Prompt: [
          { id: '1', text: 'masterpiece', enabled: true },
          { id: '2', text: 'worst quality', enabled: false },
          { id: '3', text: '1girl', enabled: true },
        ],
      };

      const { handleGenerate } = useGenerateAction(baseWorkflow);
      await handleGenerate();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const payloadMetadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(payloadMetadata.paramValues.Main_Positive_Prompt).toBe('masterpiece, 1girl');
    });

    it('handleGenerateSets injects only enabled chips for set items', async () => {
      mockStore.queuePrompt.mockResolvedValue('prompt-id');
      mockStore.sets = [
        {
          id: 'set-1',
          name: 'Set 1',
          checked: true,
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          appliedAssets: {},
          paramValues: {
            Main_Positive_Prompt: 'raw fallback',
          },
          promptChips: {
            Main_Positive_Prompt: [
              { id: '1', text: 'solo', enabled: false },
              { id: '2', text: 'smile', enabled: true },
            ],
          },
        },
      ];

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const payloadMetadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(payloadMetadata.paramValues.Main_Positive_Prompt).toBe('smile');
    });
  });

  describe('Bypass safety & schema verification', () => {
    const bypassWorkflow: Workflow = {
      ...baseWorkflow,
      json_body: {
        '3': {
          class_type: 'KSampler',
          inputs: { seed: 123 },
        },
        '4': {
          class_type: 'PassThrough',
          inputs: { input_val: ['3', 0] },
        },
      },
    };

    it('blocks handleGenerate and sets error toast when active bypass profile exists but comfyObjectInfo is empty', async () => {
      mockStore.bypassProfiles = [
        {
          id: 1,
          workflow_id: 1,
          name: 'Bypass Node 4',
          is_enabled: true,
          bypassed_node_ids: ['4'],
          created_at: '',
        },
      ];

      const { handleGenerate } = useGenerateAction(bypassWorkflow, {});
      await handleGenerate();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。',
        type: 'error',
      });
      expect(mockStore.queuePrompt).not.toHaveBeenCalled();
    });

    it('blocks handleGenerateSets and sets error toast without starting batch when active bypass profile exists but comfyObjectInfo is empty', async () => {
      mockStore.bypassProfiles = [
        {
          id: 1,
          workflow_id: 1,
          name: 'Bypass Node 4',
          is_enabled: true,
          bypassed_node_ids: ['4'],
          created_at: '',
        },
      ];
      mockStore.sets = [
        {
          id: 'set-1',
          name: 'Set 1',
          checked: true,
          batchSize: 1,
          seedMode: 'fixed',
          seed: 100,
          appliedAssets: {},
          paramValues: {},
        },
      ];

      const { handleGenerateSets } = useGenerateAction(bypassWorkflow, {});
      await handleGenerateSets();

      expect(mockStore.setErrorToast).toHaveBeenCalledWith({
        message: 'ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。',
        type: 'error',
      });
      expect(mockStore.queuePrompt).not.toHaveBeenCalled();
      expect(mockStore.setActiveBatch).not.toHaveBeenCalled();
    });

    it('applies bypass and removes bypassed nodes when comfyObjectInfo is provided', async () => {
      mockStore.bypassProfiles = [
        {
          id: 1,
          workflow_id: 1,
          name: 'Bypass Node 4',
          is_enabled: true,
          bypassed_node_ids: ['4'],
          created_at: '',
        },
      ];
      const mockComfyObjectInfo = {
        PassThrough: {
          input: { required: { input_val: ['IMAGE'] } },
          output: ['IMAGE'],
        },
      };
      mockStore.queuePrompt.mockResolvedValueOnce('prompt-bypass');

      const { handleGenerate } = useGenerateAction(bypassWorkflow, mockComfyObjectInfo);
      await handleGenerate();

      expect(mockStore.setErrorToast).not.toHaveBeenCalled();
      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const queuedPayload = mockStore.queuePrompt.mock.calls[0][0];
      expect(queuedPayload['4']).toBeUndefined();
    });

    it('calls onBeforeGenerate callback and reflects active set params during handleGenerateSets', async () => {
      const onBeforeGenerate = vi.fn();
      mockStore.sets = [
        {
          id: 1,
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 42,
          checked: true,
          paramValues: {
            Resolution_Selector: 'old_value',
          },
        },
      ];
      mockStore.activeSetId = 1;
      mockStore.paramValues = {
        Resolution_Selector: 'updated_value_within_1sec',
      };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow, {}, { onBeforeGenerate });
      await handleGenerateSets();

      expect(onBeforeGenerate).toHaveBeenCalledTimes(1);
      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(metadata.paramValues.Resolution_Selector).toBe('updated_value_within_1sec');
    });
  });

  describe('REQ-277: Real-time parameter reflection and active set synchronization', () => {
    it('Scenario 1: reflects latest paramValues immediately upon handleGenerateSets even when store was updated right before click', async () => {
      mockStore.sets = [
        {
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 100,
          checked: true,
          paramValues: {
            prompt: 'stale prompt in set',
          },
        },
      ];
      mockStore.activeSetId = 'set-1';
      // Store state updated immediately before handleGenerateSets execution
      mockStore.paramValues = {
        prompt: 'fresh user typed prompt',
      };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(metadata.paramValues.prompt).toBe('fresh user typed prompt');
    });

    it('Scenario 2: does not merge current paramValues when activeSetId is null (no active set)', async () => {
      mockStore.sets = [
        {
          id: 'set-fallback-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
          paramValues: {
            sampler: 'euler',
            steps: '20',
          },
        },
      ];
      mockStore.activeSetId = null; // Unset / unsynced
      mockStore.paramValues = {
        sampler: 'dpmpp_2m',
        steps: '30',
      };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(metadata.paramValues.sampler).toBe('euler');
      expect(metadata.paramValues.steps).toBe('20');
    });

    it('Scenario 3: handles type mismatch between activeSetId (string) and setItem.id (number)', async () => {
      mockStore.sets = [
        {
          id: 42, // numeric id
          name: 'Set 42',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 999,
          checked: true,
          paramValues: {
            cfg: '7.0',
          },
        },
      ];
      mockStore.activeSetId = '42'; // string id
      mockStore.paramValues = {
        cfg: '8.5',
      };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(metadata.paramValues.cfg).toBe('8.5');
    });

    it('Scenario 4: merges latest values into active set while preserving distinct values in non-active set', async () => {
      mockStore.sets = [
        {
          id: 'set-active',
          name: 'Active Set',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 1,
          checked: true,
          paramValues: {
            prompt: 'original active prompt',
            negative: 'original negative',
          },
        },
        {
          id: 'set-inactive',
          name: 'Inactive Set',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 2,
          checked: true,
          paramValues: {
            prompt: 'distinct inactive prompt',
            negative: 'distinct inactive negative',
          },
        },
      ];
      mockStore.activeSetId = 'set-active';
      mockStore.paramValues = {
        prompt: 'updated active prompt',
        negative: 'updated active negative',
      };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);

      // Call 0 (active set)
      const call0Metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(call0Metadata.paramValues.prompt).toBe('updated active prompt');
      expect(call0Metadata.paramValues.negative).toBe('updated active negative');

      // Call 1 (inactive set)
      const call1Metadata = mockStore.queuePrompt.mock.calls[1][1];
      expect(call1Metadata.paramValues.prompt).toBe('distinct inactive prompt');
      expect(call1Metadata.paramValues.negative).toBe('distinct inactive negative');
    });

    it('RT-1: does not corrupt multiple sets when activeSetId does not match any set', async () => {
      mockStore.sets = [
        {
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 1,
          checked: true,
          paramValues: { prompt: 'set 1 prompt' },
        },
        {
          id: 'set-2',
          name: 'Set 2',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 2,
          checked: true,
          paramValues: { prompt: 'set 2 prompt' },
        },
      ];
      mockStore.activeSetId = 'non-existent-id';
      mockStore.paramValues = { prompt: 'orphaned input' };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
      expect(mockStore.queuePrompt.mock.calls[0][1].paramValues.prompt).toBe('set 1 prompt');
      expect(mockStore.queuePrompt.mock.calls[1][1].paramValues.prompt).toBe('set 2 prompt');
    });

    it('RT-2: handleGenerate single generation also fetches latest paramValues from store at trigger time', async () => {
      mockStore.batchSize = 1;
      mockStore.paramValues = {
        prompt: 'original input',
      };

      const { handleGenerate } = useGenerateAction(baseWorkflow);

      // Simulate state update happening right before user clicks generate
      mockStore.paramValues = {
        prompt: 'latest prompt right before click',
      };

      await handleGenerate();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      expect(metadata.paramValues.prompt).toBe('latest prompt right before click');
    });

    it('RT-3: does not overwrite checked set when activeSetId points to a different (unchecked) set', async () => {
      mockStore.sets = [
        {
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 1,
          checked: false,
          paramValues: { prompt: 'set 1 prompt' },
        },
        {
          id: 'set-2',
          name: 'Set 2',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 2,
          checked: true,
          paramValues: { prompt: 'set 2 original prompt' },
        },
      ];
      // activeSetId points to set-1 which is unchecked
      mockStore.activeSetId = 'set-1';
      mockStore.paramValues = { prompt: 'newly typed prompt in UI' };

      const { handleGenerateSets } = useGenerateAction(baseWorkflow);
      await handleGenerateSets();

      expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
      const metadata = mockStore.queuePrompt.mock.calls[0][1];
      // set-2 is checked, but NOT active, so its original values must remain intact
      expect(metadata.paramValues.prompt).toBe('set 2 original prompt');
      expect(metadata.paramValues.prompt).not.toBe('newly typed prompt in UI');
    });

    // 抜け道防止 5 大ルール (AL-1〜AL-5) 準拠テストスイート
    describe('Strict Anti-Loophole wfJson Verification (AL-1 ~ AL-5)', () => {
      const realisticWorkflow: Workflow = {
        id: 1,
        name: 'Realistic KSampler Workflow',
        created_at: '',
        json_body: {
          '3': {
            class_type: 'KSampler',
            inputs: {
              seed: 1000,
              steps: 20,
              cfg: 7.0,
              sampler_name: 'euler',
              scheduler: 'normal',
            },
          },
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'prompt' },
          },
        },
        mappings: [
          { id: 1, master_id: 1, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
          { id: 2, master_id: 2, node_id: '3', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
          { id: 3, master_id: 3, node_id: '3', role: 'Sampler_cfg', param_name: 'cfg', input_type: 'float', display_name: 'CFG' },
          { id: 4, master_id: 4, node_id: '3', role: 'Sampler_Scheduler', param_name: 'scheduler', input_type: 'select_scheduler', display_name: 'Scheduler' },
          { id: 5, master_id: 5, node_id: '6', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
        ],
      };

      it('Scenario 1: injects latest parameter values into wfJson inputs on immediate generation [AL-1, AL-2, AL-3, AL-4]', async () => {
        mockStore.sets = [{
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 100,
          checked: true,
          paramValues: { Sampler_Steps: '20', Sampler_cfg: '7.0', Sampler_Scheduler: 'normal' },
        }];
        mockStore.activeSetId = 'set-1';

        // AL-1: 最新ストア状態の更新
        mockStore.paramValues = {
          Sampler_Steps: '40',
          Sampler_cfg: '8.5',
          Sampler_Scheduler: 'karras',
        };

        // AL-4: onBeforeGenerate で先行オートセーブが走る協調動作をシミュレート
        const onBeforeGenerate = vi.fn(() => {
          const latest = (useGenerationStore as any).getState();
          mockStore.sets[0].paramValues = { ...latest.paramValues };
        });

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow, {}, { onBeforeGenerate });
        await handleGenerateSets();

        expect(onBeforeGenerate).toHaveBeenCalledTimes(1);
        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);

        // AL-2: 第1引数 wfJson を直接検証し、初期値フォールバックの偽陽性を二重アサートで遮断
        const injectedWfJson = mockStore.queuePrompt.mock.calls[0][0];
        expect(injectedWfJson['3'].inputs.steps).not.toBe(20);
        expect(injectedWfJson['3'].inputs.steps).toBe(40);
        expect(injectedWfJson['3'].inputs.cfg).not.toBe(7.0);
        expect(injectedWfJson['3'].inputs.cfg).toBe(8.5);
        expect(injectedWfJson['3'].inputs.scheduler).not.toBe('normal');
        expect(injectedWfJson['3'].inputs.scheduler).toBe('karras');

        // メタデータも正しく最新値になっていること
        const metadata = mockStore.queuePrompt.mock.calls[0][1];
        expect(metadata.paramValues.Sampler_Steps).toBe('40');
      });

      it('Scenario 2: does not inject screen params into wfJson when activeSetId is null (no active set) [AL-1, AL-2]', async () => {
        mockStore.sets = [{
          id: 'set-single',
          name: 'Single Set',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 100,
          checked: true,
          paramValues: { Sampler_Steps: '20', Sampler_cfg: '7.0', Sampler_Scheduler: 'normal' },
        }];
        mockStore.activeSetId = null; // unset
        mockStore.paramValues = {
          Sampler_Steps: '35',
          Sampler_cfg: '9.0',
          Sampler_Scheduler: 'karras',
        };

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow);
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
        const injectedWfJson = mockStore.queuePrompt.mock.calls[0][0];
        expect(injectedWfJson['3'].inputs.steps).toBe(20);
        expect(injectedWfJson['3'].inputs.steps).not.toBe(35);
        expect(injectedWfJson['3'].inputs.cfg).toBe(7.0);
        expect(injectedWfJson['3'].inputs.cfg).not.toBe(9.0);
      });

      it('Scenario 3: preserves inactive set parameters without contamination from active set [AL-5]', async () => {
        mockStore.sets = [
          {
            id: 'set-1',
            name: 'Set 1 (Active)',
            batchSize: 1,
            seedMode: 'fixed',
            seed: 1,
            checked: true,
            paramValues: { Sampler_Steps: '20', Sampler_cfg: '7.0', Sampler_Scheduler: 'normal' },
          },
          {
            id: 'set-2',
            name: 'Set 2 (Inactive)',
            batchSize: 1,
            seedMode: 'fixed',
            seed: 2,
            checked: true,
            paramValues: { Sampler_Steps: '50', Sampler_cfg: '12.0', Sampler_Scheduler: 'exponential' },
          },
        ];
        mockStore.activeSetId = 'set-1';
        mockStore.paramValues = {
          Sampler_Steps: '35',
          Sampler_cfg: '8.5',
          Sampler_Scheduler: 'karras',
        };

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow);
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);

        // Call 0 (Active set): 最新の変更値が wfJson に注入される
        const call0Wf = mockStore.queuePrompt.mock.calls[0][0];
        expect(call0Wf['3'].inputs.steps).toBe(35);
        expect(call0Wf['3'].inputs.cfg).toBe(8.5);
        expect(call0Wf['3'].inputs.scheduler).toBe('karras');

        // Call 1 (Inactive set): 非アクティブセットの独自値が保持され、アクティブセットの値で汚染されない
        const call1Wf = mockStore.queuePrompt.mock.calls[1][0];
        expect(call1Wf['3'].inputs.steps).not.toBe(35);
        expect(call1Wf['3'].inputs.steps).toBe(50);
        expect(call1Wf['3'].inputs.cfg).not.toBe(8.5);
        expect(call1Wf['3'].inputs.cfg).toBe(12.0);
        expect(call1Wf['3'].inputs.scheduler).not.toBe('karras');
        expect(call1Wf['3'].inputs.scheduler).toBe('exponential');
      });

      it('Scenario 4: continuous editing without reload propagates each update to wfJson inputs on consecutive generations (Phenomenon 5 prevention)', async () => {
        mockStore.sets = [{
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'fixed',
          seed: 100,
          checked: true,
          paramValues: { Sampler_Steps: '20' },
        }];
        mockStore.activeSetId = 'set-1';

        // 1回目編集: Steps=35
        mockStore.paramValues = { Sampler_Steps: '35' };
        const { handleGenerateSets } = useGenerateAction(realisticWorkflow);
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
        const wf1 = mockStore.queuePrompt.mock.calls[0][0];
        expect(wf1['3'].inputs.steps).not.toBe(20);
        expect(wf1['3'].inputs.steps).toBe(35);

        // 2回目連続編集: リロードなしで Steps=50 にさらに変更
        mockStore.queuePrompt.mockClear();
        mockStore.paramValues = { Sampler_Steps: '50' };
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
        const wf2 = mockStore.queuePrompt.mock.calls[0][0];
        expect(wf2['3'].inputs.steps).not.toBe(35);
        expect(wf2['3'].inputs.steps).toBe(50);
      });
    });

    describe('REQ-279: In-memory synchronous flush and race condition fix', () => {
      const realisticWorkflow: Workflow = {
        id: 1,
        name: 'Realistic KSampler Workflow',
        created_at: '',
        json_body: {
          '3': {
            class_type: 'KSampler',
            inputs: {
              seed: 1000,
              steps: 20,
              cfg: 7.0,
              sampler_name: 'euler',
              scheduler: 'normal',
            },
          },
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'prompt' },
          },
        },
        mappings: [
          { id: 1, master_id: 1, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
          { id: 2, master_id: 2, node_id: '3', role: 'Sampler_Steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
          { id: 3, master_id: 3, node_id: '3', role: 'Sampler_cfg', param_name: 'cfg', input_type: 'float', display_name: 'CFG' },
          { id: 4, master_id: 4, node_id: '3', role: 'Sampler_Scheduler', param_name: 'scheduler', input_type: 'select_scheduler', display_name: 'Scheduler' },
          { id: 5, master_id: 5, node_id: '6', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
        ],
      };

      it('TC-SYNC-1: verifies synchronous parameter injection on immediate generation before async HTTP completion [AL-1]', async () => {
        mockStore.sets = [{
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
          paramValues: { Sampler_Steps: '20' },
          appliedAssets: {},
          promptChips: {},
        }];
        mockStore.activeSetId = 'set-1';
        mockStore.paramValues = { Sampler_Steps: '40' };

        // Simulates flushAutoSave running synchronously before queuePrompt while async HTTP remains unresolved
        const onBeforeGenerate = vi.fn(() => {
          mockStore.sets[0].paramValues = { ...mockStore.paramValues };
        });

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow, {}, { onBeforeGenerate });
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(1);
        const payload = mockStore.queuePrompt.mock.calls[0][0];
        expect(payload['3'].inputs.steps).toBe(40);
        expect(payload['3'].inputs.steps).not.toBe(20);
      });

      it('TC-SYNC-2: does not overwrite any set when activeSetId is null, and only overwrites active set when specified [AL-2]', async () => {
        const setA = {
          id: 'set-1',
          name: 'Set 1',
          paramValues: { Sampler_Steps: '20', Sampler_cfg: '7.0' },
          appliedAssets: {},
          promptChips: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 42,
          checked: true,
        };
        const setB = {
          id: 'set-2',
          name: 'Set 2',
          paramValues: { Sampler_Steps: '20', Sampler_cfg: '7.0' },
          appliedAssets: {},
          promptChips: {},
          batchSize: 1,
          seedMode: 'random' as const,
          seed: 42,
          checked: true,
        };

        // 1. When activeSetId is null, neither set should be overwritten by screen paramValues
        mockStore.sets = [setA, setB];
        mockStore.activeSetId = null;
        mockStore.paramValues = { Sampler_cfg: '8.5' };

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow);
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
        const call0 = mockStore.queuePrompt.mock.calls[0][0];
        const call1 = mockStore.queuePrompt.mock.calls[1][0];
        expect(call0['3'].inputs.cfg).toBe(7.0);
        expect(call1['3'].inputs.cfg).toBe(7.0);

        // 2. When activeSetId is explicitly set-1, only Set 1 receives screen paramValues
        mockStore.queuePrompt.mockClear();
        mockStore.activeSetId = 'set-1';
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(2);
        const callActive0 = mockStore.queuePrompt.mock.calls[0][0];
        const callActive1 = mockStore.queuePrompt.mock.calls[1][0];
        expect(callActive0['3'].inputs.cfg).toBe(8.5);
        expect(callActive1['3'].inputs.cfg).toBe(7.0);
      });

      it('TC-SYNC-3: immediately reflects updated batchSize and seed without delay [AL-3]', async () => {
        mockStore.sets = [{
          id: 'set-1',
          name: 'Set 1',
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
          paramValues: {},
          appliedAssets: {},
          promptChips: {},
        }];
        mockStore.activeSetId = 'set-1';
        mockStore.batchSize = 3;
        mockStore.seedMode = 'fixed';
        mockStore.seed = 12345;

        const { handleGenerateSets } = useGenerateAction(realisticWorkflow);
        await handleGenerateSets();

        expect(mockStore.queuePrompt).toHaveBeenCalledTimes(3);
        const lastBatchCall = mockStore.setActiveBatch.mock.calls[0][0];
        expect(lastBatchCall).toHaveLength(3);
        const call0 = mockStore.queuePrompt.mock.calls[0][0];
        expect(call0['3'].inputs.seed).toBe(12345);
      });
    });
  });
});
