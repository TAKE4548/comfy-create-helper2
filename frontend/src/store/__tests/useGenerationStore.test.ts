import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore, _resetWebSocketForTesting } from '../useGenerationStore';
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

describe('useGenerationStore REQ-164 multi-session WebSocket, history sync, and startup reconciliation', () => {
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

  it('Test 1: handles WS executing (node: "3") for other session job by setting isGenerating and currentNode', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      isGenerating: false,
      currentNode: null,
      currentPromptId: null,
      activeClientId: null,
      queueRunning: [[0, 'job-other-1', {}, { client_id: 'other-session-client' }, []]],
    });

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: {
          node: '3',
          prompt_id: 'job-other-1',
        },
      }),
    });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('job-other-1');
    expect(state.activeClientId).toBe('other-session-client');
    expect(state.currentNode).toEqual({ id: '3', name: 'Unknown' });
    expect(state.nodeProgress).toEqual({
      value: 0,
      max: 100,
      percentage: 0,
      nodeId: '3',
      nodeName: 'Unknown',
    });
  });

  it('Test 2: handles WS executing (node: null) by clearing currentNode and calling fetchHistory and fetchQueue', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      currentNode: { id: '3', name: 'KSampler' },
      nodeProgress: { value: 50, max: 100, percentage: 50, nodeId: '3', nodeName: 'KSampler' },
    });

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: {
          node: null,
          prompt_id: 'job-other-1',
        },
      }),
    });

    const state = useGenerationStore.getState();
    expect(state.currentNode).toBeNull();
    expect(state.nodeProgress).toBeNull();
    expect(fetchHistorySpy).toHaveBeenCalled();
    expect(fetchQueueSpy).toHaveBeenCalled();
  });

  it('Test 3: reconcileState and initialize load all sessions history and queue without early return', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    localStorage.setItem('prompt-surgeon-current-prompt-id', 'last-prompt-id');
    useGenerationStore.setState({
      currentPromptId: 'last-prompt-id',
      comfyHistoryImages: [],
      queueRunning: [],
      isGenerating: false,
    });

    const mockHistoryRes = {
      'last-prompt-id': {
        prompt: [1, 'last-prompt-id', {}, { client_id: 'my-client' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'last-img.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    };

    const mockQueueRes = {
      queue_running: [[0, 'running-other-id', {}, { client_id: 'other-session' }, []]],
      queue_pending: [],
    };

    const mockAllHistory = {
      'last-prompt-id': {
        prompt: [1, 'last-prompt-id', {}, { client_id: 'my-client' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'last-img.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
      'other-prompt-id': {
        prompt: [2, 'other-prompt-id', {}, { client_id: 'other-session' }, []],
        outputs: {
          '9': {
            images: [{ filename: 'other-img.png', subfolder: '', type: 'output' }],
          },
        },
        status: { completed: true },
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('last-prompt-id')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockHistoryRes),
        });
      }
      if (url.includes('queue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockQueueRes),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    vi.mocked(comfyApi.getHistory).mockResolvedValue(mockAllHistory as any);
    vi.mocked(comfyApi.getQueue).mockResolvedValue(mockQueueRes as any);

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    useGenerationStore.getState().initialize();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchHistorySpy).toHaveBeenCalled();
    expect(fetchQueueSpy).toHaveBeenCalled();

    const state = useGenerationStore.getState();
    expect(state.comfyHistoryImages.length).toBe(2);
    expect(state.comfyHistoryImages.some(img => img.includes('last-img.png'))).toBe(true);
    expect(state.comfyHistoryImages.some(img => img.includes('other-img.png'))).toBe(true);
    expect(state.queueRunning.length).toBe(1);
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('running-other-id');
    expect(state.activeClientId).toBe('other-session');
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
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['pending-id-1', 'pending-id-2'] });

    const state = useGenerationStore.getState();
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
    expect(comfyApi.deleteHistory).toHaveBeenCalledWith({ delete: ['running-id-1', 'pending-id-1'] });

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

  it('fetchHistory merges new images to the beginning (front) of batchImages and calls getHistory(100)', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
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

    expect(comfyApi.getHistory).toHaveBeenCalledWith(100);
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

describe('useGenerationStore REQ-181 WebSocket status event optimization', () => {
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

  it('handles WS status event by calling fetchQueue and NOT calling fetchHistory', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    // Clear initial calls from initialize/reconcileState
    fetchHistorySpy.mockClear();
    fetchQueueSpy.mockClear();

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'status',
        data: {
          status: {
            exec_info: { queue_remaining: 1 },
          },
        },
      }),
    });

    expect(fetchQueueSpy).toHaveBeenCalledTimes(1);
    expect(fetchHistorySpy).not.toHaveBeenCalled();
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
