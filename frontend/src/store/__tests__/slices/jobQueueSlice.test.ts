import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGenerationStore, _resetWebSocketForTesting } from '../../useGenerationStore';
import { comfyApi } from '../../../api/client';

vi.mock('../../../api/client', () => {
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
    promptMetadataApi: {
      create: vi.fn().mockResolvedValue({ status: 'ok' }),
      get: vi.fn().mockResolvedValue(null),
    },
  };
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
    expect(state.currentWorkflow).toEqual({ updated: true });
    // REQ-227: isBatchIntermediate の場合もメタデータは無条件でキャッシュ・永続化される
    expect(localStorage.getItem('prompt-surgeon-meta-batch-prompt-id')).toBeDefined();
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
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['run-1'] });

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

  it('fetchHistory dispatches comfy-job-event with allImages and ownImages in detail', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const mockHistoryData = {
      'prompt-1': {
        prompt: [1, 'prompt-1', {}, { client_id: useGenerationStore.getState().clientId }, []],
        outputs: {
          '9': { images: [{ filename: 'my-img.png', subfolder: '', type: 'output' }] },
        },
        status: { completed: true },
      },
    };
    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce(mockHistoryData as any);

    await useGenerationStore.getState().fetchHistory();

    const dispatchedEvent = dispatchSpy.mock.calls.find(
      ([event]) => (event as CustomEvent).detail?.type === 'history-fetched'
    )?.[0] as CustomEvent;

    expect(dispatchedEvent).toBeDefined();
    expect(dispatchedEvent.detail.allImages).toBeDefined();
    expect(dispatchedEvent.detail.allImages.length).toBeGreaterThan(0);
    expect(dispatchedEvent.detail.ownImages).toBeDefined();

    dispatchSpy.mockRestore();
  });
});

describe('useGenerationStore REQ-166 queue clear vs cancel all separation and execution_interrupted handling', () => {
  let createdWsList: any[] = [];

  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    createdWsList = [];

    class MockWebSocket {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string | Blob | ArrayBuffer }) => void) | null = null;
      binaryType: string = '';
      url: string;

      constructor(url: string) {
        this.url = url;
        createdWsList.push(this);
      }

      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });
  });

  it('clearPendingQueue purges pending queue without calling interrupt and filters pending jobs from activeBatch', async () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller);

    useGenerationStore.setState({
      queueRunning: [[0, 'running-id-1', {}, {}, []]],
      queuePending: [
        [1, 'pending-id-1', {}, {}, []],
        [2, 'pending-id-2', {}, {}, []],
      ],
      isGenerating: true,
      currentPromptId: 'running-id-1',
      activeBatch: [
        { promptId: 'running-id-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'pending-id-1', setName: 'Set 2', status: 'pending' },
        { promptId: 'pending-id-2', setName: 'Set 3', status: 'pending' },
      ],
    });

    await useGenerationStore.getState().clearPendingQueue();

    expect(abortSpy).toHaveBeenCalled();
    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).not.toHaveBeenCalled();
    expect(comfyApi.deleteHistory).not.toHaveBeenCalled();

    const state = useGenerationStore.getState();
    expect(state.queuePending).toEqual([]);
    expect(state.activeBatch).toEqual([
      { promptId: 'running-id-1', setName: 'Set 1', status: 'generating' },
    ]);
  });

  it('cancelAllJobs aborts submission, clears queue, calls interrupt, deletes history and resets generation state', async () => {
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller);

    useGenerationStore.setState({
      queueRunning: [[0, 'running-id-1', {}, {}, []]],
      queuePending: [[1, 'pending-id-1', {}, {}, []]],
      isGenerating: true,
      currentPromptId: 'running-id-1',
      activeClientId: 'client-1',
      activeBatch: [
        { promptId: 'running-id-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'pending-id-1', setName: 'Set 2', status: 'pending' },
      ],
    });

    await useGenerationStore.getState().cancelAllJobs();

    expect(abortSpy).toHaveBeenCalled();
    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).toHaveBeenCalled();
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['running-id-1'] });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
    expect(state.activeClientId).toBeNull();
    expect(state.activeBatch).toBeNull();
  });

  it('handles WS execution_interrupted by resetting generation state and dispatching event', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'interrupted-id',
      progress: { value: 10, max: 20, percentage: 50 },
      activeBatch: [
        { promptId: 'interrupted-id', setName: 'Set 1', status: 'generating' },
      ],
    });

    const eventSpy = vi.fn();
    window.addEventListener('comfy-job-event', eventSpy);

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'execution_interrupted',
        data: {
          prompt_id: 'interrupted-id',
        },
      }),
    });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.progress).toBeNull();
    expect(state.currentPromptId).toBeNull();
    expect(state.activeBatch).toBeNull();

    expect(eventSpy).toHaveBeenCalled();
    const eventDetail = eventSpy.mock.calls[0][0].detail;
    expect(eventDetail).toEqual({
      type: 'execution_interrupted',
      promptId: 'interrupted-id',
    });

    window.removeEventListener('comfy-job-event', eventSpy);
  });
});

describe('useGenerationStore REQ-167 history merge order and batch intermediate prompt ID persistence', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });
  });

  it('fetchHistory merges new images to the beginning (front) of batchImages and calls getHistory(200)', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const myClientId = useGenerationStore.getState().clientId;

    useGenerationStore.setState({
      batchImages: ['http://localhost:8188/view?filename=old-image.png&subfolder=&type=output&t=prompt-old'],
      selectedImg: null,
      filterOwnSession: true,
    });

    const mockHistoryData = {
      'prompt-new': {
        prompt: [1, 'prompt-new', {}, { client_id: myClientId }, []],
        outputs: {
          '9': {
            images: [{ filename: 'new-image.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    };

    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce(mockHistoryData as any);

    await useGenerationStore.getState().fetchHistory();

    expect(comfyApi.getHistory).toHaveBeenCalledWith(200);
    const state = useGenerationStore.getState();
    expect(state.batchImages).toHaveLength(2);
    expect(state.batchImages[0]).toContain('new-image.png');
    expect(state.batchImages[1]).toContain('old-image.png');
    expect(state.selectedImg).toContain('new-image.png');
  });

  it('queuePrompt saves CURRENT_PROMPT_ID to localStorage even when isBatchIntermediate is true', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({ prompt_id: 'batch-inter-prompt-1' });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const promptId = await useGenerationStore.getState().queuePrompt(
      { nodes: {} },
      undefined,
      { isBatchIntermediate: true, skipQueueFetch: true }
    );

    expect(promptId).toBe('batch-inter-prompt-1');
    expect(localStorage.getItem('prompt-surgeon-current-prompt-id')).toBe('batch-inter-prompt-1');
  });
});

describe('useGenerationStore Coordinated Clean Shutdown & Abort handling', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    useGenerationStore.setState({ isGenerating: false, currentPromptId: null, activeBatch: null });
  });

  it('should immediately return null and skip API call if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} },
      undefined,
      { signal: controller.signal }
    );

    expect(result).toBeNull();
    expect(comfyApi.queuePrompt).not.toHaveBeenCalled();
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('should return null and not set isGenerating or save to localStorage if aborted before response', async () => {
    const controller = new AbortController();

    vi.mocked(comfyApi.queuePrompt).mockImplementation(async () => {
      // Abort during API execution
      controller.abort();
      return { prompt_id: 'aborted-prompt-1' };
    });

    useGenerationStore.setState({ isGenerating: false, currentPromptId: null });

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} },
      undefined,
      { signal: controller.signal }
    );

    expect(result).toBeNull();
    expect(useGenerationStore.getState().isGenerating).toBe(false);
    expect(useGenerationStore.getState().currentPromptId).toBeNull();
    expect(localStorage.getItem('prompt-surgeon-current-prompt-id')).toBeNull();
  });

  it('cancelAllJobs waits for in-flight queuePrompt before calling deleteQueue and interrupt', async () => {
    let apiCompleted = false;
    const executionOrder: string[] = [];

    vi.mocked(comfyApi.queuePrompt).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      apiCompleted = true;
      executionOrder.push('queuePrompt_finished');
      return { prompt_id: 'in-flight-prompt' };
    });

    vi.mocked(comfyApi.deleteQueue).mockImplementation(async () => {
      executionOrder.push('deleteQueue');
      return {} as any;
    });

    vi.mocked(comfyApi.interrupt).mockImplementation(async () => {
      executionOrder.push('interrupt');
      return {} as any;
    });

    // Start queuePrompt in background
    const queuePromise = useGenerationStore.getState().queuePrompt({ nodes: {} });

    // While queuePrompt is in flight, invoke cancelAllJobs
    const cancelPromise = useGenerationStore.getState().cancelAllJobs();

    await Promise.all([queuePromise, cancelPromise]);

    expect(apiCompleted).toBe(true);
    expect(executionOrder).toEqual(['queuePrompt_finished', 'deleteQueue', 'interrupt']);
    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).toHaveBeenCalled();

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
  });
});

describe('useGenerationStore REQ-182 interrupt resilience & abort responsiveness', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    useGenerationStore.setState({ isGenerating: false, currentPromptId: null, activeBatch: null });
  });

  it('cancelAllJobs guarantees interrupt execution even if deleteQueue fails', async () => {
    vi.mocked(comfyApi.deleteQueue).mockRejectedValueOnce(new Error('Network error on deleteQueue'));
    vi.mocked(comfyApi.interrupt).mockResolvedValueOnce({ status: 'interrupted' });

    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [[1, 'pend-1', {}, {}, []]],
      isGenerating: true,
      currentPromptId: 'run-1',
    });

    await useGenerationStore.getState().cancelAllJobs();

    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).toHaveBeenCalledTimes(1);

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
  });
});

describe('useGenerationStore REQ-190 cancel/clear communication optimization & fetchHistory deduplication', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    useGenerationStore.setState({
      isGenerating: false,
      currentPromptId: null,
      activeBatch: null,
      queueRunning: [],
      queuePending: [],
      filterOwnSession: false,
      batchImages: [],
      comfyHistoryImages: [],
    });
  });

  it('AC-1: cancelJob for pending job optimistically removes job, calls deleteQueue, does not call deleteHistory/interrupt or fetchQueue', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [
        [1, 'pend-1', {}, {}, []],
        [2, 'pend-2', {}, {}, []],
      ],
      currentPromptId: 'run-1',
      isGenerating: true,
      activeBatch: [
        { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'pend-1', setName: 'Set 2', status: 'pending' },
        { promptId: 'pend-2', setName: 'Set 3', status: 'pending' },
      ],
    });

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().cancelJob('pend-1');

    // Optimistic removal
    expect(useGenerationStore.getState().queuePending).toEqual([
      [2, 'pend-2', {}, {}, []],
    ]);
    expect(useGenerationStore.getState().activeBatch).toEqual([
      { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
      { promptId: 'pend-1', setName: 'Set 2', status: 'failed' },
      { promptId: 'pend-2', setName: 'Set 3', status: 'pending' },
    ]);

    // Comfy API calls
    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ delete: ['pend-1'] });
    expect(comfyApi.interrupt).not.toHaveBeenCalled();
    expect(comfyApi.deleteHistory).not.toHaveBeenCalled();

    // No trailing fetchQueue synchronous call
    expect(fetchQueueSpy).not.toHaveBeenCalled();
  });

  it('AC-1 & AC-2: cancelJob for running job calls interrupt and deleteHistory, optimistically updates state, does not call fetchQueue', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [[1, 'pend-1', {}, {}, []]],
      currentPromptId: 'run-1',
      isGenerating: true,
      activeBatch: [
        { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'pend-1', setName: 'Set 2', status: 'pending' },
      ],
    });

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().cancelJob('run-1');

    expect(comfyApi.interrupt).toHaveBeenCalled();
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['run-1'] });
    expect(comfyApi.deleteQueue).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();

    const state = useGenerationStore.getState();
    expect(state.currentPromptId).toBeNull();
    expect(state.activeBatch?.[0].status).toBe('failed');
  });

  it('AC-2: clearPendingQueue optimistically clears queuePending, calls deleteQueue({ clear: true }), avoids deleteHistory and fetchQueue', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [
        [1, 'pend-1', {}, {}, []],
        [2, 'pend-2', {}, {}, []],
      ],
      currentPromptId: 'run-1',
      isGenerating: true,
      activeBatch: [
        { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'pend-1', setName: 'Set 2', status: 'pending' },
      ],
    });

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().clearPendingQueue();

    expect(useGenerationStore.getState().queuePending).toEqual([]);
    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.deleteHistory).not.toHaveBeenCalled();
    expect(comfyApi.interrupt).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();
    expect(useGenerationStore.getState().activeBatch).toEqual([
      { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
    ]);
  });

  it('AC-2: cancelAllJobs optimistically clears all queue and generation state, avoids trailing fetchQueue', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [[1, 'pend-1', {}, {}, []]],
      currentPromptId: 'run-1',
      isGenerating: true,
      activeClientId: 'client-1',
      activeBatch: [{ promptId: 'run-1', setName: 'Set 1', status: 'generating' }],
    });

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().cancelAllJobs();

    const state = useGenerationStore.getState();
    expect(state.queuePending).toEqual([]);
    expect(state.activeBatch).toBeNull();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
    expect(state.activeClientId).toBeNull();

    expect(comfyApi.deleteQueue).toHaveBeenCalledWith({ clear: true });
    expect(comfyApi.interrupt).toHaveBeenCalled();
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['run-1'] });
    expect(fetchQueueSpy).not.toHaveBeenCalled();
  });

  it('AC-3: fetchHistory reuses in-flight promise when called multiple times concurrently', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    await new Promise((resolve) => setTimeout(resolve, 20));

    vi.mocked(comfyApi.getHistory).mockClear();

    let resolveApi!: (value: any) => void;
    const historyPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });

    vi.mocked(comfyApi.getHistory).mockImplementation(() => historyPromise as any);

    // Trigger 3 parallel fetchHistory calls
    const p1 = useGenerationStore.getState().fetchHistory();
    const p2 = useGenerationStore.getState().fetchHistory();
    const p3 = useGenerationStore.getState().fetchHistory();

    expect(comfyApi.getHistory).toHaveBeenCalledTimes(1);

    // Resolve API
    resolveApi({
      'prompt-100': {
        prompt: [1, 'prompt-100', {}, { client_id: 'my-client' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'out-100.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    });

    await Promise.all([p1, p2, p3]);

    expect(comfyApi.getHistory).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().comfyHistoryImages.length).toBe(1);

    // Subsequent call after resolution should invoke getHistory again
    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce({} as any);
    await useGenerationStore.getState().fetchHistory();
    expect(comfyApi.getHistory).toHaveBeenCalledTimes(2);
  });
});

describe('useGenerationStore REQ-195-T1 ComfyUI history optimization (200 items), redundant request elimination & blob cleanup', () => {
  let createdWsList: any[] = [];
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    _resetWebSocketForTesting();
    createdWsList = [];

    class MockWebSocket {
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string | Blob | ArrayBuffer }) => void) | null = null;
      binaryType: string = '';
      url: string;

      constructor(url: string) {
        this.url = url;
        createdWsList.push(this);
      }

      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    });

    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn();
    }
    if (!globalThis.URL.revokeObjectURL) {
      globalThis.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('AC-1 & AC-8: fetchHistory requests 200 items and preserves up to 200 images', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const mockHistoryData: Record<string, any> = {};
    for (let i = 1; i <= 210; i++) {
      mockHistoryData[`prompt-${i}`] = {
        prompt: [i, `prompt-${i}`, {}, { client_id: 'other-client' }, []],
        outputs: {
          '9': {
            images: [{ filename: `img-${i}.png`, subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      };
    }

    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce(mockHistoryData);

    await useGenerationStore.getState().fetchHistory();

    expect(comfyApi.getHistory).toHaveBeenCalledWith(200);
    const state = useGenerationStore.getState();
    expect(state.comfyHistoryImages.length).toBe(200);
    expect(state.batchImages.length).toBe(200);
  });

  it('AC-2 & AC-3: WebSocket events do NOT trigger redundant fetchHistory or fetchQueue', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');
    fetchHistorySpy.mockClear();
    fetchQueueSpy.mockClear();

    // 1. execution_start
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'execution_start',
        data: { prompt_id: 'test-prompt-1' },
      }),
    });
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();

    // 2. executing (node: null)
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: { node: null, prompt_id: 'test-prompt-1' },
      }),
    });
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();

    // 3. executed
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executed',
        data: {
          prompt_id: 'test-prompt-1',
          output: { images: [{ filename: 'out1.png', subfolder: '', type: 'output' }] },
        },
      }),
    });
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();

    // 4. execution_complete
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'execution_complete',
        data: { prompt_id: 'test-prompt-1' },
      }),
    });
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();

    // 5. execution_error
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'execution_error',
        data: { prompt_id: 'test-prompt-error' },
      }),
    });
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();
  });

  it('AC-5: blob objectURL is properly revoked when receiving new blob, clearing preview, or setting selected image', () => {
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:http://localhost/first-blob')
      .mockReturnValueOnce('blob:http://localhost/second-blob');

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    // First blob message
    const blob1 = new Blob(['preview1'], { type: 'image/png' });
    wsInstance.onmessage?.({ data: blob1 });
    expect(useGenerationStore.getState().previewImage).toBe('blob:http://localhost/first-blob');
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    // Second blob message -> should revoke previous blob
    const blob2 = new Blob(['preview2'], { type: 'image/png' });
    wsInstance.onmessage?.({ data: blob2 });
    expect(useGenerationStore.getState().previewImage).toBe('blob:http://localhost/second-blob');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/first-blob');

    // clearPreview -> should revoke current blob
    useGenerationStore.getState().clearPreview();
    expect(useGenerationStore.getState().previewImage).toBeNull();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/second-blob');

    // Set blob again and call setSelectedImg
    useGenerationStore.setState({ previewImage: 'blob:http://localhost/third-blob' });
    useGenerationStore.getState().setSelectedImg('http://localhost:8188/view?filename=img.png');
    expect(useGenerationStore.getState().previewImage).toBeNull();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/third-blob');

    revokeObjectURLSpy.mockRestore();
    createObjectURLSpy.mockRestore();
  });

  describe('REQ-264: previewAutoFollow state, actions and localStorage persistence', () => {
    it('initializes previewAutoFollow from localStorage or defaults to true', () => {
      expect(useGenerationStore.getState().previewAutoFollow).toBe(true);
    });

    it('updates previewAutoFollow via setPreviewAutoFollow and persists to localStorage', () => {
      useGenerationStore.getState().setPreviewAutoFollow(false);
      expect(useGenerationStore.getState().previewAutoFollow).toBe(false);
      expect(localStorage.getItem('prompt-surgeon-preview-auto-follow')).toBe('false');

      useGenerationStore.getState().setPreviewAutoFollow(true);
      expect(useGenerationStore.getState().previewAutoFollow).toBe(true);
      expect(localStorage.getItem('prompt-surgeon-preview-auto-follow')).toBe('true');
    });

    it('toggles previewAutoFollow via togglePreviewAutoFollow and persists to localStorage', () => {
      useGenerationStore.setState({ previewAutoFollow: true });
      useGenerationStore.getState().togglePreviewAutoFollow();
      expect(useGenerationStore.getState().previewAutoFollow).toBe(false);
      expect(localStorage.getItem('prompt-surgeon-preview-auto-follow')).toBe('false');

      useGenerationStore.getState().togglePreviewAutoFollow();
      expect(useGenerationStore.getState().previewAutoFollow).toBe(true);
      expect(localStorage.getItem('prompt-surgeon-preview-auto-follow')).toBe('true');
    });
  });
});

describe('useGenerationStore REQ-307-T2 queue submission failure reporting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(comfyApi.queuePrompt).mockReset();
  });

  it('reports an explicit ComfyUI rejection once through the callback and suppresses the legacy toast', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({ error: { message: 'Missing required input' } } as any);
    const callback = vi.fn();
    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(result).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: 'Missing required input', outcome: 'failed' });
    expect(setErrorToastSpy).not.toHaveBeenCalled();
  });

  it('preserves error details and node_errors from a realistic 2xx rejection response', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({
      error: { message: 'Prompt execution failed', details: 'Node 12 has invalid input' },
      node_errors: { 12: { errors: [{ message: 'Node 12 has invalid input' }] } },
    } as any);
    const callback = vi.fn();

    await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      reason: 'Prompt execution failed\nNode 12 has invalid input',
      outcome: 'failed',
    });
  });

  it('preserves legacy string data.error values as the failure reason', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({ error: 'Queue rejected by ComfyUI' } as any);
    const callback = vi.fn();

    await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: 'Queue rejected by ComfyUI', outcome: 'failed' });
  });

  it('reports HTTP 400 response details and preserves the legacy toast when no callback is supplied', async () => {
    vi.mocked(comfyApi.queuePrompt).mockRejectedValueOnce(new Error('API error 400: {"error":{"message":"Invalid workflow"}}'));
    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    await useGenerationStore.getState().queuePrompt({ nodes: {} });

    expect(setErrorToastSpy).toHaveBeenCalledTimes(1);
    expect(setErrorToastSpy).toHaveBeenCalledWith({ message: 'Invalid workflow', type: 'error' });
  });

  it('passes the normalized HTTP 400 reason to the callback', async () => {
    vi.mocked(comfyApi.queuePrompt).mockRejectedValueOnce(new Error('API error 400: {"detail":"Node 12 input is invalid"}'));
    const callback = vi.fn();

    await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: 'Node 12 input is invalid', outcome: 'failed' });
  });

  it('reports an unknown reason when the successful response has no prompt_id', async () => {
    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({} as any);
    const callback = vi.fn();

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(result).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: '理由を特定できませんでした', outcome: 'failed' });
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('does not let a throwing failure callback change the failed submission result', async () => {
    vi.mocked(comfyApi.queuePrompt).mockRejectedValueOnce(new Error('queue rejected'));
    const callback = vi.fn(() => { throw new Error('callback failed') });
    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(result).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(setErrorToastSpy).not.toHaveBeenCalled();
  });

  it('does not report an aborted request through the callback or legacy toast', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    vi.mocked(comfyApi.queuePrompt).mockRejectedValueOnce(abortError);
    const callback = vi.fn();
    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(result).toBeNull();
    expect(callback).not.toHaveBeenCalled();
    expect(setErrorToastSpy).not.toHaveBeenCalled();
  });
});

