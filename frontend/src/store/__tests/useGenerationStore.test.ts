import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGenerationStore, _resetWebSocketForTesting, resolveNodeTitle } from '../useGenerationStore';
import { getEffectiveParamValues, chipsToString } from '../slices/multiSetSlice';
import type { TagChip } from '../../components/TagChipEditor/useChipParser';
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
    promptMetadataApi: {
      create: vi.fn().mockResolvedValue({ status: 'ok' }),
      get: vi.fn().mockResolvedValue(null),
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

  it('Test 2: handles WS executing (node: null) by clearing currentNode without redundant fetchHistory or fetchQueue', () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      currentNode: { id: '3', name: 'KSampler' },
      nodeProgress: { value: 50, max: 100, percentage: 50, nodeId: '3', nodeName: 'KSampler' },
    });

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    useGenerationStore.getState().initialize();
    fetchHistorySpy.mockClear();
    fetchQueueSpy.mockClear();

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
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();
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

describe('useGenerationStore REQ-189 node title resolution, workflow retention, and queue fallback', () => {
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

  describe('resolveNodeTitle', () => {
    it('returns null for null or undefined workflow / nodeId', () => {
      expect(resolveNodeTitle(null, '3')).toBeNull();
      expect(resolveNodeTitle(undefined, '3')).toBeNull();
      expect(resolveNodeTitle({}, null)).toBeNull();
      expect(resolveNodeTitle({}, undefined)).toBeNull();
    });

    it('returns _meta.title if present', () => {
      const wf = {
        '3': { class_type: 'KSampler', _meta: { title: 'My KSampler Node' } }
      };
      expect(resolveNodeTitle(wf, '3')).toBe('My KSampler Node');
    });

    it('falls back to class_type if _meta.title is absent', () => {
      const wf = {
        '4': { class_type: 'CheckpointLoaderSimple' }
      };
      expect(resolveNodeTitle(wf, '4')).toBe('CheckpointLoaderSimple');
    });

    it('returns null if node ID is not in workflow', () => {
      const wf = {
        '4': { class_type: 'CheckpointLoaderSimple' }
      };
      expect(resolveNodeTitle(wf, '99')).toBeNull();
    });
  });

  it('AC-1: preserves currentWorkflow on isBatchIntermediate queuePrompt and resolves node names in WS progress/executing', async () => {
    const mockWorkflow = {
      '3': { class_type: 'KSampler', _meta: { title: 'KSampler Main' } },
      '4': { class_type: 'CheckpointLoaderSimple' }
    };

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    vi.mocked(comfyApi.queuePrompt).mockResolvedValueOnce({ prompt_id: 'batch-set-job-1' });

    // intermediate queuePrompt (Sets batch generation)
    await useGenerationStore.getState().queuePrompt(mockWorkflow, undefined, { isBatchIntermediate: true, skipQueueFetch: true });

    expect(useGenerationStore.getState().currentWorkflow).toEqual(mockWorkflow);

    // WS executing event for node 3
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: {
          node: '3',
          prompt_id: 'batch-set-job-1',
        },
      }),
    });

    let state = useGenerationStore.getState();
    expect(state.currentNode).toEqual({ id: '3', name: 'KSampler Main' });
    expect(state.nodeProgress?.nodeName).toBe('KSampler Main');

    // WS progress event for node 3
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'progress',
        data: {
          value: 10,
          max: 20,
          node: '3',
          prompt_id: 'batch-set-job-1',
        },
      }),
    });

    state = useGenerationStore.getState();
    expect(state.nodeProgress?.percentage).toBe(50);
    expect(state.nodeProgress?.nodeName).toBe('KSampler Main');
  });

  it('AC-2: does not clear currentWorkflow on executed event when batch or subsequent job is running', () => {
    const mockWorkflow = {
      '3': { class_type: 'KSampler', _meta: { title: 'KSampler' } },
      '9': { class_type: 'SaveImage', _meta: { title: 'Save Image Node' } }
    };

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      currentWorkflow: mockWorkflow,
      activeBatch: [
        { promptId: 'job-1', setName: 'Set 1', status: 'generating' },
        { promptId: 'job-2', setName: 'Set 2', status: 'pending' },
      ],
      isGenerating: true,
    });

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executed',
        data: {
          node: '9',
          prompt_id: 'job-1',
          output: {
            images: [{ filename: 'output_1.png', subfolder: '', type: 'output' }],
          },
        },
      }),
    });

    const state = useGenerationStore.getState();
    expect(state.currentWorkflow).toEqual(mockWorkflow);
    expect(state.isGenerating).toBe(true);
  });

  it('AC-3: resolves node title from queueRunning prompt_json fallback when currentWorkflow is null (other session / reload)', () => {
    const queueWorkflow = {
      '5': { class_type: 'VAEDecode', _meta: { title: 'VAE Decode Primary' } }
    };

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.setState({
      currentWorkflow: null,
      currentNode: null,
      queueRunning: [[0, 'other-session-job', queueWorkflow, { client_id: 'other-client' }, []]],
    });

    useGenerationStore.getState().initialize();
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();

    // executing event without local currentWorkflow
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: {
          node: '5',
          prompt_id: 'other-session-job',
        },
      }),
    });

    let state = useGenerationStore.getState();
    expect(state.currentNode).toEqual({ id: '5', name: 'VAE Decode Primary' });
    expect(state.nodeProgress?.nodeName).toBe('VAE Decode Primary');
    expect(state.currentWorkflow).toEqual(queueWorkflow);

    // progress event also correctly resolves
    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'progress',
        data: {
          value: 5,
          max: 10,
          node: '5',
          prompt_id: 'other-session-job',
        },
      }),
    });

    state = useGenerationStore.getState();
    expect(state.nodeProgress?.nodeName).toBe('VAE Decode Primary');
  });

  it('AC-3 (fetchQueue): auto-re-resolves Unknown currentNode and populates currentWorkflow on fetchQueue', async () => {
    const queueWorkflow = {
      '6': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive Prompt' } }
    };

    vi.mocked(comfyApi.getQueue).mockResolvedValueOnce({
      queue_running: [[0, 'running-job-1', queueWorkflow, { client_id: 'other-client' }, []]],
      queue_pending: [],
    });

    useGenerationStore.setState({
      currentWorkflow: null,
      currentNode: { id: '6', name: 'Unknown' },
      nodeProgress: { value: 0, max: 100, percentage: 0, nodeId: '6', nodeName: 'Unknown' },
    });

    await useGenerationStore.getState().fetchQueue();

    const state = useGenerationStore.getState();
    expect(state.currentWorkflow).toEqual(queueWorkflow);
    expect(state.currentNode).toEqual({ id: '6', name: 'Positive Prompt' });
    expect(state.nodeProgress?.nodeName).toBe('Positive Prompt');
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
});

describe('useGenerationStore REQ-220 promptChips and effectiveParamValues', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState({
      selectedWorkflowId: 1,
      paramValues: {},
      promptChips: {},
      sets: [],
      activeSetId: null,
      openPresetIds: [],
    });
  });

  it('chipsToString converts only enabled chips to comma-separated string', () => {
    const chips: TagChip[] = [
      { id: '1', text: '1girl', enabled: true },
      { id: '2', text: 'solo', enabled: false },
      { id: '3', text: 'smile', enabled: true },
    ];
    expect(chipsToString(chips)).toBe('1girl, smile');
  });

  it('getEffectiveParamValues correctly replaces role with enabled chips only', () => {
    const paramValues = {
      positive: 'default positive prompt',
      negative: 'lowres, bad anatomy',
    };
    const promptChips: Record<string, TagChip[]> = {
      positive: [
        { id: '1', text: 'masterpiece', enabled: true },
        { id: '2', text: 'worst quality', enabled: false },
        { id: '3', text: 'best quality', enabled: true },
      ],
    };

    const effective = getEffectiveParamValues(paramValues, promptChips);
    expect(effective.positive).toBe('masterpiece, best quality');
    expect(effective.negative).toBe('lowres, bad anatomy');
  });

  it('setPromptChips updates promptChips and active set', () => {
    useGenerationStore.getState().initSets(1);
    const chips: TagChip[] = [
      { id: '1', text: '1girl', enabled: true },
      { id: '2', text: 'cat ears', enabled: false },
    ];

    useGenerationStore.getState().setPromptChips('positive', chips);

    const state = useGenerationStore.getState();
    expect(state.promptChips.positive).toEqual(chips);

    const activeSet = state.sets.find((s) => s.id === state.activeSetId);
    expect(activeSet?.promptChips?.positive).toEqual(chips);
  });

  it('preserves promptChips across set addition and switching', () => {
    useGenerationStore.getState().initSets(1);
    const set1Id = useGenerationStore.getState().activeSetId;

    const chips1: TagChip[] = [
      { id: '1', text: 'prompt1', enabled: true },
      { id: '2', text: 'disabled1', enabled: false },
    ];
    useGenerationStore.getState().setPromptChips('positive', chips1);

    // Add set 2
    useGenerationStore.getState().addSet();
    const set2Id = useGenerationStore.getState().activeSetId;
    expect(set2Id).not.toBe(set1Id);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips1);

    // Modify set 2 promptChips
    const chips2: TagChip[] = [
      { id: '3', text: 'prompt2', enabled: true },
    ];
    useGenerationStore.getState().setPromptChips('positive', chips2);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips2);

    // Switch back to set 1
    useGenerationStore.getState().setActiveSetId(set1Id!);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips1);

    // Switch to set 2
    useGenerationStore.getState().setActiveSetId(set2Id!);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips2);
  });

  it('restores promptChips from preset param_values when existing promptChips role array is empty', () => {
    useGenerationStore.getState().initSets(1);
    const presetId = 101;

    // セットに positive: [] が入ってしまっている状態をシミュレート
    useGenerationStore.setState({
      sets: [
        {
          id: presetId,
          name: 'Preset 101',
          paramValues: { positive: '' },
          promptChips: { positive: [] },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
      activeSetId: presetId,
      openPresetIds: [presetId],
      promptChips: { positive: [] },
    });

    const mockPreset: any = {
      id: presetId,
      name: 'Preset 101',
      param_values: { positive: 'solo, smile, 1girl' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
    };

    useGenerationStore.getState().loadPresetData(mockPreset, {});

    const state = useGenerationStore.getState();
    const updatedSet = state.sets.find((s) => s.id === presetId);

    // 空配列で上書きされず、param_values.positive から正規チップが復元されていること
    expect(updatedSet?.promptChips?.positive).toBeDefined();
    expect(updatedSet?.promptChips?.positive?.length).toBe(3);
    expect(updatedSet?.promptChips?.positive?.map((c) => c.text)).toEqual(['solo', 'smile', '1girl']);
    expect(state.promptChips.positive.map((c) => c.text)).toEqual(['solo', 'smile', '1girl']);
  });
});



