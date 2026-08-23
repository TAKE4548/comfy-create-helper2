import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../useGenerationStore';
import { comfyApi } from '../../api/client';

vi.mock('../../api/client', () => {
  return {
    configApi: {
      get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }),
    },
    comfyApi: {
      getObjectInfo: vi.fn().mockResolvedValue({}),
      queuePrompt: vi.fn().mockResolvedValue({ prompt_id: 'mock-prompt-id' }),
      getQueue: vi.fn().mockResolvedValue({ queue_running: [], queue_pending: [] }),
      deleteQueue: vi.fn().mockResolvedValue({ status: 'ok' }),
      interrupt: vi.fn().mockResolvedValue({ status: 'interrupted' }),
      getHistory: vi.fn().mockResolvedValue({}),
      deleteHistory: vi.fn().mockResolvedValue({ status: 'ok' }),
    },
  };
});

describe('useGenerationStore REQ-059 preview reset logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should reset previewImage to null when setSelectedImg is called', () => {
    useGenerationStore.setState({
      previewImage: 'some_preview_image.png',
      selectedImg: 'some_selected_image.png',
    });

    useGenerationStore.getState().setSelectedImg('new_selected_image.png');

    const state = useGenerationStore.getState();
    expect(state.selectedImg).toBe('new_selected_image.png');
    expect(state.previewImage).toBeNull();
  });
});

describe('useGenerationStore REQ-061 batch job registration, progress, and cancellation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should handle activeBatch setting and update status', () => {
    useGenerationStore.setState({
      activeBatch: null,
      isGenerating: true,
    });

    const mockBatch = [
      { promptId: 'id-1', setName: 'Set 1', status: 'pending' as const },
      { promptId: 'id-2', setName: 'Set 2', status: 'pending' as const },
    ];

    useGenerationStore.getState().setActiveBatch(mockBatch);
    expect(useGenerationStore.getState().activeBatch).toEqual(mockBatch);

    useGenerationStore.getState().updateBatchJobStatus('id-1', 'generating');
    expect(useGenerationStore.getState().activeBatch?.[0].status).toBe('generating');
    expect(useGenerationStore.getState().isGenerating).toBe(true);

    useGenerationStore.getState().updateBatchJobStatus('id-1', 'completed');
    expect(useGenerationStore.getState().activeBatch?.[0].status).toBe('completed');
    expect(useGenerationStore.getState().isGenerating).toBe(true);

    useGenerationStore.getState().updateBatchJobStatus('id-2', 'failed');
    expect(useGenerationStore.getState().activeBatch?.[1].status).toBe('failed');
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('should detect queue cancellation / clear in fetchQueue', async () => {
    vi.mocked(comfyApi.getQueue).mockResolvedValueOnce({
      queue_running: [],
      queue_pending: [],
    });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      isGenerating: true,
      activeBatch: [
        { promptId: 'id-1', setName: 'Set 1', status: 'pending' as const },
      ],
    });

    await useGenerationStore.getState().fetchQueue();

    const state = useGenerationStore.getState();
    expect(state.activeBatch).toBeNull();
    expect(state.isGenerating).toBe(false);
  });
});

describe('useGenerationStore REQ-073 metadata cache and auto-cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should cache metadata and prune old cache when exceeding 200 items', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValue({ prompt_id: 'mock-prompt-id' });
    vi.mocked(comfyApi.getQueue).mockResolvedValue({ queue_running: [], queue_pending: [] });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const promptId = await useGenerationStore.getState().queuePrompt({ nodes: {} }, {
      paramValues: { test: 'value' },
      appliedAssets: {
        role1: [{ id: 'lora-1', type: 'lora', assetId: 1, name: 'Lora1', enabled: true, tags: ['tag1'] }]
      }
    });

    expect(promptId).toBe('mock-prompt-id');
    const cached = localStorage.getItem('prompt-surgeon-meta-mock-prompt-id');
    expect(cached).toBeDefined();
    const parsed = JSON.parse(cached || '{}');
    expect(parsed.paramValues).toEqual({ test: 'value' });
    expect(parsed.appliedAssets.role1[0].name).toBe('Lora1');

    // Test pruning: insert 205 mock metadata items into localStorage
    localStorage.clear();
    for (let i = 1; i <= 205; i++) {
      localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({
        paramValues: {},
        appliedAssets: {},
        timestamp: i
      }));
    }

    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({ prompt_id: 'id-206' });

    await useGenerationStore.getState().queuePrompt({ nodes: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const keys = Object.keys(localStorage).filter(k => k.startsWith('prompt-surgeon-meta-'));
    expect(keys.length).toBe(200);

    for (let i = 1; i <= 6; i++) {
      expect(localStorage.getItem(`prompt-surgeon-meta-id-${i}`)).toBeNull();
    }
    expect(localStorage.getItem('prompt-surgeon-meta-id-7')).not.toBeNull();
    expect(localStorage.getItem('prompt-surgeon-meta-id-206')).not.toBeNull();
  });
});

describe('useGenerationStore REQ-140 queuePrompt optimization and abort control', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should skip fetchQueue when skipQueueFetch option is true', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValue({ prompt_id: 'mock-prompt-id' });
    vi.mocked(comfyApi.getQueue).mockResolvedValue({ queue_running: [], queue_pending: [] });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().queuePrompt({ nodes: {} }, undefined, { skipQueueFetch: true });

    expect(fetchQueueSpy).not.toHaveBeenCalled();
    fetchQueueSpy.mockRestore();
  });

  it('should call fetchQueue when skipQueueFetch option is falsy', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValue({ prompt_id: 'mock-prompt-id' });
    vi.mocked(comfyApi.getQueue).mockResolvedValue({ queue_running: [], queue_pending: [] });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().queuePrompt({ nodes: {} });

    expect(fetchQueueSpy).toHaveBeenCalledTimes(1);
    fetchQueueSpy.mockRestore();
  });

  it('should abort submission controller when abortSubmission is called', () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');

    useGenerationStore.getState().setSubmissionAbortController(controller);
    expect(useGenerationStore.getState().submissionAbortController).toBe(controller);

    useGenerationStore.getState().abortSubmission();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().submissionAbortController).toBeNull();
  });

  it('should call abortSubmission when cancelJob or cancelAllJobs is called', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const controller1 = new AbortController();
    const abortSpy1 = vi.spyOn(controller1, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller1);

    await useGenerationStore.getState().cancelJob('prompt-1');
    expect(abortSpy1).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().submissionAbortController).toBeNull();

    const controller2 = new AbortController();
    const abortSpy2 = vi.spyOn(controller2, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller2);

    await useGenerationStore.getState().cancelAllJobs();
    expect(abortSpy2).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().submissionAbortController).toBeNull();
  });
});

describe('useGenerationStore REQ-152 batch queueing optimization & cancellation recovery fixes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should not clear activeBatch in fetchQueue when isBatchSubmitting is true (Issue 4)', async () => {
    vi.mocked(comfyApi.getQueue).mockResolvedValue({
      queue_running: [],
      queue_pending: [],
    });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const mockBatch = [
      { promptId: 'pending-set-0-12345', setName: 'Set 1', status: 'pending' as const },
    ];
    useGenerationStore.setState({
      isGenerating: true,
      activeBatch: mockBatch,
      isBatchSubmitting: true,
    });

    await useGenerationStore.getState().fetchQueue();

    const state = useGenerationStore.getState();
    expect(state.activeBatch).toEqual(mockBatch);
    expect(state.isGenerating).toBe(true);

    useGenerationStore.setState({ isBatchSubmitting: false });
    await useGenerationStore.getState().fetchQueue();
    expect(useGenerationStore.getState().activeBatch).toBeNull();
  });

  it('should not show error toast when queuePrompt is aborted with AbortError', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    vi.mocked(comfyApi.queuePrompt).mockRejectedValue(abortError);

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const controller = new AbortController();
    controller.abort();

    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} },
      undefined,
      { signal: controller.signal }
    );

    expect(result).toBeNull();
    expect(setErrorToastSpy).not.toHaveBeenCalled();
  });

  it('should call abortSubmission when cancelGeneration is called', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller);

    await useGenerationStore.getState().cancelGeneration();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().submissionAbortController).toBeNull();
  });

  it('should only update lightweight state when isBatchIntermediate is true', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValue({ prompt_id: 'batch-prompt-id' });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      previewImage: 'existing-preview.png',
      currentWorkflow: { initial: true },
    });

    const result = await useGenerationStore.getState().queuePrompt(
      { updated: true },
      undefined,
      { skipQueueFetch: true, isBatchIntermediate: true }
    );

    expect(result).toBe('batch-prompt-id');
    const state = useGenerationStore.getState();
    expect(state.currentPromptId).toBe('batch-prompt-id');
    expect(state.isGenerating).toBe(true);
    expect(state.previewImage).toBe('existing-preview.png');
    expect(state.currentWorkflow).toEqual({ initial: true });
    expect(localStorage.getItem('prompt-surgeon-meta-batch-prompt-id')).toBeNull();
  });
});

describe('useGenerationStore REQ-162 cancelAllJobs complete queue purge and multi-session sync', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('cancelAllJobs executes deleteQueue with clear:true and interrupt', async () => {
    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [[1, 'pend-1', {}, {}, []]],
      filterOwnSession: true, // even with filterOwnSession: true, should purge clear: true
      isGenerating: true,
      currentPromptId: 'run-1',
    });

    await useGenerationStore.getState().cancelAllJobs();

    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).toHaveBeenCalled();
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['run-1', 'pend-1'] });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
    expect(state.activeBatch).toBeNull();
  });

  it('cancelJob updates status of target job to failed and maintains activeBatch if remaining jobs exist', async () => {
    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'job-1',
      queueRunning: [[0, 'job-1', {}, {}, []]],
      queuePending: [[1, 'job-2', {}, {}, []]],
      activeBatch: [
        { promptId: 'job-1', setName: 'Set A', status: 'generating' },
        { promptId: 'job-2', setName: 'Set A', status: 'pending' },
      ],
    });

    await useGenerationStore.getState().cancelJob('job-1');

    const state = useGenerationStore.getState();
    expect(state.activeBatch).toHaveLength(2);
    expect(state.activeBatch?.[0].status).toBe('failed');
    expect(state.activeBatch?.[1].status).toBe('pending');
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBeNull();
  });

  it('cancelJob clears activeBatch when last unfinished job is cancelled', async () => {
    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'job-2',
      queueRunning: [[0, 'job-2', {}, {}, []]],
      activeBatch: [
        { promptId: 'job-1', setName: 'Set A', status: 'completed' },
        { promptId: 'job-2', setName: 'Set A', status: 'generating' },
      ],
    });

    await useGenerationStore.getState().cancelJob('job-2');

    const state = useGenerationStore.getState();
    expect(state.activeBatch).toBeNull();
    expect(state.isGenerating).toBe(false);
  });

  it('fetchHistory reconciles own session images into batchImages when filterOwnSession is true', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const myClientId = useGenerationStore.getState().clientId;

    useGenerationStore.setState({
      batchImages: ['existing-image.png'],
      filterOwnSession: true,
    });

    const mockHistoryData = {
      'prompt-1': {
        prompt: [1, 'prompt-1', {}, { client_id: myClientId }, []],
        outputs: {
          '9': {
            images: [{ filename: 'my-new-image.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
      'prompt-2': {
        prompt: [2, 'prompt-2', {}, { client_id: 'other-client-id' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'other-image.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    };

    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce(mockHistoryData as any);

    await useGenerationStore.getState().fetchHistory();

    const state = useGenerationStore.getState();
    expect(state.comfyHistoryImages.length).toBe(2);
    expect(state.batchImages).toContain('existing-image.png');
    expect(state.batchImages.some(img => img.includes('my-new-image.png'))).toBe(true);
    expect(state.batchImages.some(img => img.includes('other-image.png'))).toBe(false);
  });

  it('fetchHistory reconciles all images into batchImages when filterOwnSession is false', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const myClientId = useGenerationStore.getState().clientId;

    useGenerationStore.setState({
      batchImages: [],
      filterOwnSession: false,
    });

    const mockHistoryData = {
      'prompt-1': {
        prompt: [1, 'prompt-1', {}, { client_id: myClientId }, []],
        outputs: {
          '9': {
            images: [{ filename: 'my-new-image.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
      'prompt-2': {
        prompt: [2, 'prompt-2', {}, { client_id: 'other-client-id' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'other-image.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    };

    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce(mockHistoryData as any);

    await useGenerationStore.getState().fetchHistory();

    const state = useGenerationStore.getState();
    expect(state.batchImages.some(img => img.includes('my-new-image.png'))).toBe(true);
    expect(state.batchImages.some(img => img.includes('other-image.png'))).toBe(true);
  });
});
