import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGenerationStore, _resetWebSocketForTesting } from '../../useGenerationStore';
import { projectQueue } from '../../slices/jobQueueSlice';
import { comfyApi, promptMetadataApi } from '../../../api/client';
import { generationApi } from '../../../api/domains/generation';
import { GenerationApiError } from '../../../api/domains/generation';
import { PROMPT_RECORD_KEY } from '../../../utils/generationRecord';
import { LS_KEYS } from '../../../utils/localStorageKeys';
import { systemWsService } from '../../services/systemWsService';

vi.mock('../../../api/domains/generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/domains/generation')>();
  return {
    ...actual,
    generationApi: {
    submitBatch: vi.fn().mockResolvedValue({ batch_id: 'batch-1', job_ids: ['mock-prompt-id'], epoch: 'epoch-1', revision: 1 }),
    getRequest: vi.fn().mockResolvedValue({ batch_id: 'batch-1', job_ids: ['mock-prompt-id'] }),
    getState: vi.fn().mockResolvedValue({ version: 1, epoch: 'epoch-1', revision: 1, normal_group_id: null, jobs: [], batches: [], upstream: { http_ready: true, ws_connected: true, failure_since: null } }),
    getUpstreamQueue: vi.fn().mockResolvedValue({ running: [], pending: [] }),
    cancelJob: vi.fn().mockResolvedValue({ job_id: 'mock-prompt-id', prompt_id: null, status: 'cancelled', outcome: 'cancelled', message: 'cancelled' }),
    cancel: vi.fn().mockResolvedValue({ mode: 'all', scope: 'all', message: 'accepted', items: [], upstream_clear: 'confirmed', upstream_interrupt: 'confirmed', epoch: 'epoch-1', revision: 1 }),
    releaseJobs: vi.fn().mockResolvedValue({ items: [], epoch: 'epoch-1', revision: 1 }),
    },
  };
});

const resetGenerationApiMocks = () => {
  vi.mocked(generationApi.submitBatch).mockReset().mockResolvedValue({ batch_id: 'batch-1', job_ids: ['mock-prompt-id'], epoch: 'epoch-1', revision: 1 });
  vi.mocked(generationApi.getRequest).mockReset().mockResolvedValue({ batch_id: 'batch-1', job_ids: ['mock-prompt-id'] });
  vi.mocked(generationApi.getState).mockReset().mockResolvedValue({ version: 1, epoch: 'epoch-1', revision: 1, normal_group_id: null, jobs: [], batches: [], upstream: { http_ready: true, ws_connected: true, failure_since: null } });
  vi.mocked(generationApi.getUpstreamQueue).mockReset().mockResolvedValue({ running: [], pending: [] });
  vi.mocked(generationApi.cancelJob).mockReset().mockResolvedValue({ job_id: 'mock-prompt-id', prompt_id: null, status: 'cancelled', outcome: 'cancelled', message: 'cancelled' });
  vi.mocked(generationApi.cancel).mockReset().mockResolvedValue({ mode: 'all', scope: 'all', message: 'accepted', items: [], upstream_clear: 'confirmed', upstream_interrupt: 'confirmed', epoch: 'epoch-1', revision: 1 });
  vi.mocked(generationApi.releaseJobs).mockReset().mockResolvedValue({ items: [], epoch: 'epoch-1', revision: 1 });
};

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
    expect(state.activeBatch).toEqual([{ promptId: 'id-1', setName: 'Set 1', status: 'pending' }]);
    expect(state.isGenerating).toBe(true);
  });
});
describe('useGenerationStore REQ-073 metadata cache and auto-cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
  });

  it('keeps the 29 newest existing entries plus the newly queued metadata within the 30 item limit', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValue({ batch_id: 'b', job_ids: ['mock-prompt-id'], epoch: 'e', revision: 1 });
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

    // Existing cache is larger than the limit before the next successful submission.
    localStorage.clear();
    for (let i = 1; i <= 200; i++) {
      localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({
        paramValues: {},
        appliedAssets: {},
        timestamp: i
      }));
    }

    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['id-206'], epoch: 'e', revision: 1 });

    await useGenerationStore.getState().queuePrompt({ nodes: {} });
    const keys = Object.keys(localStorage).filter(k => k.startsWith('prompt-surgeon-meta-'));
    expect(keys.length).toBe(30);

    for (let i = 1; i <= 171; i++) {
      expect(localStorage.getItem(`prompt-surgeon-meta-id-${i}`)).toBeNull();
    }
    expect(localStorage.getItem('prompt-surgeon-meta-id-172')).not.toBeNull();
    expect(localStorage.getItem('prompt-surgeon-meta-id-206')).not.toBeNull();
  });

  it('updates an existing prompt ID without counting it as a second cache entry', async () => {
    for (let i = 1; i <= 30; i++) {
      localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({ timestamp: i, paramValues: { old: 'yes' } }));
    }
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['id-30'], epoch: 'e', revision: 1 });

    await useGenerationStore.getState().queuePrompt({}, { paramValues: { updated: 'yes' } }, { skipQueueFetch: true });

    const keys = Object.keys(localStorage).filter((key) => key.startsWith('prompt-surgeon-meta-'));
    expect(keys).toHaveLength(30);
    expect(JSON.parse(localStorage.getItem('prompt-surgeon-meta-id-30')!).paramValues).toEqual({ updated: 'yes' });
    expect(localStorage.getItem('prompt-surgeon-meta-id-1')).not.toBeNull();
  });
});

describe('useGenerationStore REQ-140 queuePrompt optimization and abort control', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
  });

  it('should skip fetchQueue when skipQueueFetch option is true', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValue({ batch_id: 'b', job_ids: ['mock-prompt-id'], epoch: 'e', revision: 1 });
    vi.mocked(comfyApi.getQueue).mockResolvedValue({ queue_running: [], queue_pending: [] });

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().queuePrompt({ nodes: {} }, undefined, { skipQueueFetch: true });

    expect(fetchQueueSpy).not.toHaveBeenCalled();
    fetchQueueSpy.mockRestore();
  });

  it('should call fetchQueue when skipQueueFetch option is falsy', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValue({ batch_id: 'b', job_ids: ['mock-prompt-id'], epoch: 'e', revision: 1 });
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
    resetGenerationApiMocks();
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
    expect(useGenerationStore.getState().activeBatch).toEqual(mockBatch);
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
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['batch-prompt-id'], epoch: 'e', revision: 1 });

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
    resetGenerationApiMocks();
  });

  it('cancelAllJobs executes deleteQueue with clear:true and interrupt', async () => {
    useGenerationStore.setState({
      queueRunning: [[0, 'run-1', {}, {}, []]],
      queuePending: [[1, 'pend-1', {}, {}, []]],
      filterOwnSession: true,
      activeBatch: null,
      isGenerating: true,
      currentPromptId: 'run-1',
    });

    await useGenerationStore.getState().cancelAllJobs();

    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'all', scope: 'all' });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('run-1');
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
    expect(state.activeBatch?.[0].status).toBe('generating');
    expect(state.activeBatch?.[1].status).toBe('pending');
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('job-1');
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
    expect(state.activeBatch).toEqual([
      { promptId: 'job-1', setName: 'Set A', status: 'completed' },
      { promptId: 'job-2', setName: 'Set A', status: 'generating' },
    ]);
    expect(state.isGenerating).toBe(true);
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

  it('fetchHistory keeps foreign history visible but never merges it into batchImages when filterOwnSession is false', async () => {
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
    expect(state.batchImages.some(img => img.includes('other-image.png'))).toBe(false);
    expect(state.comfyHistoryImages.some(img => img.includes('other-image.png'))).toBe(true);
  });

  it('fetchHistory dispatches all history separately from the actual own image collection', async () => {
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
      'prompt-2': {
        prompt: [2, 'prompt-2', {}, { client_id: 'other-session' }, []],
        outputs: { '9': { images: [{ filename: 'other-img.png', subfolder: '', type: 'output' }] } },
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
    expect(dispatchedEvent.detail.ownImages.some((url: string) => url.includes('my-img.png'))).toBe(true);
    expect(dispatchedEvent.detail.ownImages.some((url: string) => url.includes('other-img.png'))).toBe(false);

    dispatchSpy.mockRestore();
  });
});

describe('useGenerationStore REQ-166 queue clear vs cancel all separation and execution_interrupted handling', () => {
  let createdWsList: any[] = [];

  beforeEach(() => {
    _resetWebSocketForTesting();
    systemWsService.resetForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    createdWsList = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
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
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'queued', scope: 'all' });

    const state = useGenerationStore.getState();
    expect(state.queuePending).toEqual([]);
    expect(state.activeBatch).toHaveLength(3);
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
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'all', scope: 'all' });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('running-id-1');
    expect(state.activeClientId).toBe('client-1');
    expect(state.activeBatch).toHaveLength(2);
  });

  it('applies backend terminal snapshots to clear active generation state', () => {
    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'interrupted-id',
      progress: { value: 10, max: 20, percentage: 50 },
      generationSnapshot: {
        version: 1, epoch: 'interrupt-epoch', revision: 1, normal_group_id: null, batches: [],
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
        jobs: [{ job_id: 'interrupted-id', request_id: 'request-interrupted', prompt_id: 'prompt-interrupted', session_id: useGenerationStore.getState().clientId, scope: 'normal', batch_id: 'batch-interrupted', normal_group_id: null, project_id: null, status: 'running', started_at: null, finished_at: null, node: null, outputs: [], failure: null }],
      },
      activeBatch: [
        { promptId: 'interrupted-id', setName: 'Set 1', status: 'generating' },
      ],
    });

    const eventSpy = vi.fn();
    window.addEventListener('comfy-job-event', eventSpy);

    useGenerationStore.getState().initialize({ force: true });
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();
    expect(wsInstance.url).toContain('/api/ws');

    wsInstance.onmessage?.({
      data: JSON.stringify({
        type: 'GENERATION_EVENT', version: 1, epoch: 'interrupt-epoch', revision: 2,
        data: {
          version: 1, epoch: 'interrupt-epoch', revision: 2, normal_group_id: null, batches: [],
          upstream: { http_ready: true, ws_connected: true, failure_since: null },
          jobs: [{ job_id: 'interrupted-id', request_id: 'request-interrupted', prompt_id: 'prompt-interrupted', session_id: useGenerationStore.getState().clientId, scope: 'normal', batch_id: 'batch-interrupted', normal_group_id: null, project_id: null, status: 'cancelled', started_at: null, finished_at: null, node: null, outputs: [], failure: null }],
        },
      }),
    });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.progress).toBeNull();
    expect(state.currentPromptId).toBeNull();
    expect(state.generationSnapshot?.jobs[0].status).toBe('cancelled');
    expect(eventSpy).not.toHaveBeenCalled();

    window.removeEventListener('comfy-job-event', eventSpy);
  });
});

describe('useGenerationStore REQ-167 history merge order and batch intermediate prompt ID persistence', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
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
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['batch-inter-prompt-1'], epoch: 'e', revision: 1 });

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
    resetGenerationApiMocks();
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
    expect(generationApi.submitBatch).not.toHaveBeenCalled();
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('should return null and not set isGenerating or save to localStorage if aborted before response', async () => {
    const controller = new AbortController();

    for (let i = 1; i <= 30; i++) {
      localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({ timestamp: i }));
    }

    vi.mocked(generationApi.submitBatch).mockImplementationOnce(async () => {
      controller.abort();
      return { batch_id: 'b', job_ids: ['aborted-job-1'], epoch: 'e', revision: 1 };
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
    expect(Object.keys(localStorage).filter((key) => key.startsWith('prompt-surgeon-meta-'))).toHaveLength(30);
  });

  it('cancelAllJobs waits for in-flight queuePrompt before calling deleteQueue and interrupt', async () => {
    let apiCompleted = false;
    const executionOrder: string[] = [];

    vi.mocked(generationApi.submitBatch).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      apiCompleted = true;
      executionOrder.push('batch_accepted');
      return { batch_id: 'b', job_ids: ['in-flight-job'], epoch: 'e', revision: 1 };
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
    expect(executionOrder).toEqual(['batch_accepted']);
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'all', scope: 'all' });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('in-flight-job');
  });
});

describe('useGenerationStore REQ-182 interrupt resilience & abort responsiveness', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
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

    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'all', scope: 'all' });

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('run-1');
  });
});

describe('useGenerationStore REQ-190 cancel/clear communication optimization & fetchHistory deduplication', () => {
  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
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
    expect(useGenerationStore.getState().queuePending).toEqual([]);
    expect(useGenerationStore.getState().activeBatch).toHaveLength(3);

    // Comfy API calls
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'single', scope: 'all', target: { prompt_id: 'pend-1' } });

    // No trailing fetchQueue synchronous call
    expect(fetchQueueSpy).toHaveBeenCalledOnce();
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

    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'single', scope: 'all', target: { prompt_id: 'run-1' } });
    expect(fetchQueueSpy).toHaveBeenCalledOnce();

    const state = useGenerationStore.getState();
    expect(state.currentPromptId).toBe('run-1');
    expect(state.activeBatch?.[0].status).toBe('generating');
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
    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'queued', scope: 'all' });
    expect(fetchQueueSpy).toHaveBeenCalledOnce();
    expect(useGenerationStore.getState().activeBatch).toEqual([
      { promptId: 'run-1', setName: 'Set 1', status: 'generating' },
      { promptId: 'pend-1', setName: 'Set 2', status: 'pending' },
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
    expect(state.activeBatch).toEqual([{ promptId: 'run-1', setName: 'Set 1', status: 'generating' }]);
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBe('run-1');
    expect(state.activeClientId).toBe('client-1');

    expect(generationApi.cancel).toHaveBeenCalledWith({ mode: 'all', scope: 'all' });
    expect(fetchQueueSpy).toHaveBeenCalledOnce();
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
    systemWsService.resetForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    _resetWebSocketForTesting();
    createdWsList = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 0;
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
    expect(state.batchImages.length).toBe(0);
  });

  it('AC-2 & AC-3: backend WebSocket snapshots do NOT trigger redundant fetchHistory or fetchQueue', () => {
    useGenerationStore.getState().initialize({ force: true });
    const wsInstance = createdWsList[0];
    expect(wsInstance).toBeDefined();
    expect(wsInstance.url).toContain('/api/ws');

    const fetchHistorySpy = vi.spyOn(useGenerationStore.getState(), 'fetchHistory');
    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');
    fetchHistorySpy.mockClear();
    fetchQueueSpy.mockClear();

    for (const revision of [1, 2, 3, 4, 5]) {
      const data = {
        version: 1, epoch: 'ws-test-epoch', revision, normal_group_id: null,
        batches: [], upstream: { http_ready: true, ws_connected: true, failure_since: null },
        jobs: [],
      };
      wsInstance.onmessage?.({
        data: JSON.stringify({ type: 'GENERATION_EVENT', version: 1, epoch: 'ws-test-epoch', revision, data }),
      });
    }
    expect(fetchHistorySpy).not.toHaveBeenCalled();
    expect(fetchQueueSpy).not.toHaveBeenCalled();
  });

  it('AC-5: preview blob objectURL is revoked when clearing preview or selecting an image', () => {
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    useGenerationStore.setState({ previewImage: 'blob:http://localhost/first-blob' });
    expect(useGenerationStore.getState().previewImage).toBe('blob:http://localhost/first-blob');
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    useGenerationStore.getState().clearPreview();
    expect(useGenerationStore.getState().previewImage).toBeNull();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/first-blob');

    // Set blob again and call setSelectedImg
    useGenerationStore.setState({ previewImage: 'blob:http://localhost/third-blob' });
    useGenerationStore.getState().setSelectedImg('http://localhost:8188/view?filename=img.png');
    expect(useGenerationStore.getState().previewImage).toBeNull();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/third-blob');

    revokeObjectURLSpy.mockRestore();
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

describe('REQ-316 queue metadata persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    localStorage.clear();
  });
  const metadata = () => ({ workflowId: 7, appliedAssets: {}, paramValues: {
    Quality: 'original', [PROMPT_RECORD_KEY]: JSON.stringify({ version: 1, workflow_id: 7,
      workflow_name: 'Frozen workflow', fields: [], parameters: [], assets: [], queued_at: null,
      completeness: 'complete' }),
  } });
  it('freezes metadata before batch submission and keeps the reserved record unchanged until prompt confirmation', async () => {
    const source = metadata();
    vi.mocked(generationApi.submitBatch).mockImplementationOnce(async (payload) => {
      source.paramValues.Quality = 'changed';
      useGenerationStore.setState({ selectedWorkflowId: 99 });
      expect(payload.items[0].param_values.Quality).toBe('original');
      return { batch_id: 'b', job_ids: ['recorded'], epoch: 'e', revision: 1 };
    });
    expect(await useGenerationStore.getState().queuePrompt({}, source, { skipQueueFetch: true })).toBe('recorded');
    const local = JSON.parse(localStorage.getItem('prompt-surgeon-meta-recorded')!);
    expect(local.paramValues.Quality).toBe('original');
    expect(local.workflowId).toBe(7);
    expect(JSON.parse(local.paramValues[PROMPT_RECORD_KEY]).queued_at).toBeNull();
    expect(JSON.parse(local.paramValues[PROMPT_RECORD_KEY]).prompt_id).toBeUndefined();
    expect(JSON.parse(source.paramValues[PROMPT_RECORD_KEY]).queued_at).toBeNull();
    expect(promptMetadataApi.create).not.toHaveBeenCalled();
  });
  it.each(['prompt-surgeon-current-prompt-id', 'prompt-surgeon-meta-recorded'])('keeps server acceptance successful when localStorage key %s cannot be stored', async (key) => {
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['recorded'], epoch: 'e', revision: 1 });
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (name === key) throw new Error('storage full');
      original.call(this, name, value);
    });
    const failure = vi.fn();
    expect(await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true, onSubmissionFailure: failure })).toBe('recorded');
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
    expect(promptMetadataApi.create).not.toHaveBeenCalled();
  });
  it('keeps accepted job state when the old metadata endpoint would have failed', async () => {
    vi.mocked(promptMetadataApi.create).mockRejectedValueOnce(new Error('server unavailable'));
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['recorded'], epoch: 'e', revision: 1 });
    const toast = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');
    expect(await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })).toBe('recorded');
    expect(localStorage.getItem('prompt-surgeon-meta-recorded')).not.toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(promptMetadataApi.create).not.toHaveBeenCalled();
  });
  it('continues server acceptance when cache pruning throws', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['recorded'], epoch: 'e', revision: 1 });
    for (let i = 1; i <= 30; i++) localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({ timestamp: i }));
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('enumeration failed'); });
    expect(await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true })).toBe('recorded');
    expect(localStorage.getItem('prompt-surgeon-current-prompt-id')).toBe('recorded');
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1);
  });
  it('prunes old local metadata before caching the newly accepted job', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: ['recorded'], epoch: 'e', revision: 1 });
    for (let i = 1; i <= 30; i++) localStorage.setItem(`prompt-surgeon-meta-id-${i}`, JSON.stringify({ timestamp: i }));
    await useGenerationStore.getState().queuePrompt({}, metadata(), { skipQueueFetch: true });
    expect(localStorage.getItem('prompt-surgeon-meta-recorded')).not.toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.startsWith('prompt-surgeon-meta-'))).toHaveLength(30);
  });
});

describe('useGenerationStore REQ-307-T2 queue submission failure reporting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    vi.mocked(generationApi.submitBatch).mockReset().mockResolvedValue({ batch_id: 'b', job_ids: ['mock-prompt-id'], epoch: 'e', revision: 1 });
  });

  it('reports an explicit ComfyUI rejection once through the callback and suppresses the legacy toast', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('Missing required input'));
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
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('Prompt execution failed\nNode 12 has invalid input'));
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
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('Queue rejected by ComfyUI'));
    const callback = vi.fn();

    await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: 'Queue rejected by ComfyUI', outcome: 'failed' });
  });

  it('reports HTTP 400 response details and preserves the legacy toast when no callback is supplied', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('Invalid workflow'));
    const setErrorToastSpy = vi.spyOn(useGenerationStore.getState(), 'setErrorToast');

    await useGenerationStore.getState().queuePrompt({ nodes: {} });

    expect(setErrorToastSpy).toHaveBeenCalledTimes(1);
    expect(setErrorToastSpy).toHaveBeenCalledWith({ message: 'Invalid workflow', type: 'error' });
  });

  it('passes the normalized HTTP 400 reason to the callback', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('Node 12 input is invalid'));
    const callback = vi.fn();

    await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: 'Node 12 input is invalid', outcome: 'failed' });
  });

  it('reports an unknown reason when the successful response has no prompt_id', async () => {
    vi.mocked(generationApi.submitBatch).mockResolvedValueOnce({ batch_id: 'b', job_ids: [], epoch: 'e', revision: 1 });
    const callback = vi.fn();

    const result = await useGenerationStore.getState().queuePrompt(
      { nodes: {} }, undefined, { onSubmissionFailure: callback }
    );

    expect(result).toBeNull();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ reason: '受付応答にjob_idがありません', outcome: 'unconfirmed' });
    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });

  it('does not let a throwing failure callback change the failed submission result', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new Error('queue rejected'));
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
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(abortError);
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

describe('REQ-333 T16 session identity and retry-safe acceptance', () => {
  const managedSnapshot = (epoch: string, revision: number, jobId: string, status: 'queued' | 'running' = 'running') => ({
    version: 1 as const,
    epoch,
    revision,
    normal_group_id: null,
    batches: [{ batch_id: `batch-${jobId}`, scope: 'normal' as const, project_id: null }],
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
    jobs: [{
      job_id: jobId, request_id: `request-${jobId}`, prompt_id: `prompt-${jobId}`,
      session_id: 'persistent-session', scope: 'normal' as const, batch_id: `batch-${jobId}`,
      normal_group_id: null, project_id: null, status, started_at: null, finished_at: null,
      node: null, outputs: [], failure: null,
    }],
  });

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve: (value: T) => resolve(value) };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    localStorage.clear();
    useGenerationStore.setState({ clientId: 'persistent-session', generationSnapshot: null, batchImages: [], filterOwnSession: true });
  });

  it('generates a UUIDv4 request id on HTTP LAN when crypto.randomUUID is unavailable', async () => {
    const cryptoMock = {
      getRandomValues: (bytes: Uint8Array) => { bytes.fill(0x11); return bytes },
    } as unknown as Crypto;
    vi.stubGlobal('crypto', cryptoMock);
    await useGenerationStore.getState().queuePrompt({}, undefined, { skipQueueFetch: true });
    const requestId = vi.mocked(generationApi.submitBatch).mock.calls[0][0].request_id;
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    vi.unstubAllGlobals();
  });

  it('looks up the same request id once after an unconfirmed submit and never reposts', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new GenerationApiError(0, {
      code: 'network_error', message: 'acceptance uncertain', outcome: 'unconfirmed', request_id: null, job_id: null,
    }));
    vi.mocked(generationApi.getRequest).mockResolvedValueOnce({ batch_id: 'recovered-batch', job_ids: ['recovered-job'] });
    const result = await useGenerationStore.getState().queuePrompt({}, undefined, { skipQueueFetch: true });
    expect(result).toBe('recovered-job');
    const requestId = vi.mocked(generationApi.submitBatch).mock.calls[0][0].request_id;
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1);
    expect(generationApi.getRequest).toHaveBeenCalledTimes(1);
    expect(generationApi.getRequest).toHaveBeenCalledWith(requestId);
  });

  it('keeps a lost-acceptance outcome unconfirmed when the one-time lookup returns not found', async () => {
    vi.mocked(generationApi.submitBatch).mockRejectedValueOnce(new GenerationApiError(0, {
      code: 'network_error', message: 'acceptance uncertain', outcome: 'unconfirmed', request_id: null, job_id: null,
    }));
    vi.mocked(generationApi.getRequest).mockRejectedValueOnce(new GenerationApiError(404, {
      code: 'not_found', message: 'request not found', outcome: 'failed', request_id: null, job_id: null,
    }));
    const failure = vi.fn();
    expect(await useGenerationStore.getState().queuePrompt({}, undefined, { skipQueueFetch: true, onSubmissionFailure: failure })).toBeNull();
    expect(generationApi.submitBatch).toHaveBeenCalledTimes(1);
    expect(generationApi.getRequest).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledWith({ reason: 'acceptance uncertain', outcome: 'unconfirmed' });
  });

  it('does not let a delayed older HTTP snapshot overwrite a newer WebSocket revision or its queue projection', async () => {
    const oldResponse = deferred<any>();
    const upstreamResponse = deferred<any>();
    vi.mocked(generationApi.getState).mockReturnValueOnce(oldResponse.promise);
    vi.mocked(generationApi.getUpstreamQueue).mockReturnValueOnce(upstreamResponse.promise);
    useGenerationStore.setState({
      generationSnapshot: managedSnapshot('epoch-live', 5, 'live-job'),
      queueRunning: [[0, 'live-job', { job_id: 'live-job' }, { client_id: 'persistent-session' }, []]],
      queuePending: [[0, 'live-pending', {}, {}, []]],
      systemStats: { vram_safe: false, vram_free_gb: 2, vram_min_free_gb: 6 } as any,
    });

    const refresh = useGenerationStore.getState().fetchQueue();
    oldResponse.resolve(managedSnapshot('epoch-live', 4, 'stale-job'));
    upstreamResponse.resolve({ running: [], pending: [] });
    await refresh;

    const state = useGenerationStore.getState();
    expect(state.generationSnapshot?.revision).toBe(5);
    expect(state.generationSnapshot?.jobs[0].job_id).toBe('live-job');
    expect(state.queueRunning[0][1]).toBe('live-job');
    expect(state.queuePending[0][1]).toBe('live-pending');
    expect(state.systemStats).toMatchObject({ vram_safe: false, vram_free_gb: 2 });
    expect(state.generationSyncing).toBe(false);
  });

  it('rejects a late response from an epoch retired by the current WebSocket snapshot', async () => {
    const oldResponse = deferred<any>();
    const upstreamResponse = deferred<any>();
    const oldEpoch = `t16-old-${Date.now()}`;
    const currentEpoch = `${oldEpoch}-current`;
    useGenerationStore.setState({ generationSnapshot: managedSnapshot(oldEpoch, 8, 'old-job') });
    vi.mocked(generationApi.getState).mockReturnValueOnce(oldResponse.promise);
    vi.mocked(generationApi.getUpstreamQueue).mockReturnValueOnce(upstreamResponse.promise);

    const refresh = useGenerationStore.getState().fetchQueue();
    const currentSnapshot = managedSnapshot(currentEpoch, 1, 'current-job');
    expect(useGenerationStore.getState().applyGenerationSnapshot(currentSnapshot)).toBe(true);
    oldResponse.resolve(managedSnapshot(oldEpoch, 9, 'late-old-job'));
    upstreamResponse.resolve({ running: [], pending: [] });
    await refresh;

    const state = useGenerationStore.getState();
    expect(state.generationSnapshot?.epoch).toBe(currentEpoch);
    expect(state.generationSnapshot?.jobs[0].job_id).toBe('current-job');
    expect(state.generationSyncing).toBe(false);
  });

  it('uses managed session ownership for history and preserves history key in proxy t parameter', async () => {
    const own = 'persistent-session';
    useGenerationStore.setState({
      generationSnapshot: {
        version: 1, epoch: 'e', revision: 1, normal_group_id: null, batches: [],
        upstream: { http_ready: true, ws_connected: true, failure_since: null },
        jobs: [
          { job_id: 'managed-own', request_id: 'r1', prompt_id: 'history-own', session_id: own, scope: 'normal', batch_id: 'b', normal_group_id: null, project_id: null, status: 'succeeded', started_at: null, finished_at: null, node: null, outputs: [], failure: null },
          { job_id: 'managed-other', request_id: 'r2', prompt_id: 'history-other', session_id: 'other-session', scope: 'normal', batch_id: 'b', normal_group_id: null, project_id: null, status: 'succeeded', started_at: null, finished_at: null, node: null, outputs: [], failure: null },
        ],
      },
    });
    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce({
      'history-own': { prompt: [1, 'history-own', {}, { client_id: 'be-bridge-id' }, []], status: { completed: true }, outputs: { n: { images: [{ filename: 'own.png', subfolder: 'out', type: 'output' }] } } },
      'history-other': { prompt: [2, 'history-other', {}, { client_id: own }, []], status: { completed: true }, outputs: { n: { images: [{ filename: 'other.png', subfolder: 'out', type: 'output' }] } } },
      'legacy-own': { prompt: [3, 'legacy-own', {}, { client_id: own }, []], status: { completed: true }, outputs: { n: { images: [{ filename: 'legacy.png', subfolder: 'out', type: 'output' }] } } },
    } as any);
    await useGenerationStore.getState().fetchHistory();
    const state = useGenerationStore.getState();
    expect(state.batchImages.some((url) => url.includes('own.png'))).toBe(true);
    expect(state.batchImages.some((url) => url.includes('other.png'))).toBe(false);
    expect(state.batchImages.some((url) => url.includes('legacy.png'))).toBe(true);
    expect(state.comfyHistoryImages).toContain('/api/comfy/view?filename=own.png&subfolder=out&type=output&t=history-own');
  });

  it('removes positively identified foreign history from cached batch images while preserving unclassified cache', async () => {
    const oldForeignUrl = 'http://localhost:8188/view?filename=foreign.png&subfolder=out&type=output&t=foreign-history';
    const unknownCachedUrl = 'legacy-cache-without-image-identity';
    useGenerationStore.setState({
      clientId: 'persistent-session',
      filterOwnSession: false,
      batchImages: [oldForeignUrl, unknownCachedUrl],
    });
    vi.mocked(comfyApi.getHistory).mockResolvedValueOnce({
      'own-history': {
        prompt: [1, 'own-history', {}, { client_id: 'persistent-session' }, []],
        status: { completed: true },
        outputs: { n: { images: [{ filename: 'own.png', subfolder: 'out', type: 'output' }] } },
      },
      'foreign-history': {
        prompt: [2, 'foreign-history', {}, { client_id: 'other-session' }, []],
        status: { completed: true },
        outputs: { n: { images: [{ filename: 'foreign.png', subfolder: 'out', type: 'output' }] } },
      },
    } as any);

    await useGenerationStore.getState().fetchHistory();

    const state = useGenerationStore.getState();
    expect(state.filterOwnSession).toBe(false);
    expect(state.batchImages.some((url) => url.includes('own.png'))).toBe(true);
    expect(state.batchImages.some((url) => url.includes('foreign.png'))).toBe(false);
    expect(state.batchImages).toContain(unknownCachedUrl);
    expect(state.comfyHistoryImages.some((url) => url.includes('foreign.png'))).toBe(true);
  });

  it('preserves selection and selected-image storage through preserveSelection history fetch', async () => {
    let resolveHistory!: (value: Record<string, unknown>) => void;
    const historyResult = new Promise<Record<string, unknown>>((resolve) => { resolveHistory = resolve; });
    const initialSelection = '/api/comfy/view?filename=initial.png&subfolder=&type=output&t=initial';
    const clickedWhilePending = '/api/comfy/view?filename=clicked.png&subfolder=&type=output&t=clicked';
    localStorage.setItem(LS_KEYS.SELECTED_IMG, initialSelection);
    useGenerationStore.setState({
      clientId: 'persistent-session',
      selectedImg: initialSelection,
      filterOwnSession: true,
    });
    vi.mocked(comfyApi.getHistory).mockReturnValueOnce(historyResult as Promise<any>);
    const storedSelectionWrite = vi.spyOn(Storage.prototype, 'setItem');

    const fetch = useGenerationStore.getState().fetchHistory({ preserveSelection: true });
    await Promise.resolve();
    useGenerationStore.getState().setSelectedImg(clickedWhilePending);
    storedSelectionWrite.mockClear();
    resolveHistory({
      'history-own': {
        prompt: [1, 'history-own', {}, { client_id: 'persistent-session' }, []],
        status: { completed: true },
        outputs: { n: { images: [{ filename: 'result.png', subfolder: '', type: 'output' }] } },
      },
    });
    await fetch;

    expect(useGenerationStore.getState().selectedImg).toBe(clickedWhilePending);
    expect(localStorage.getItem(LS_KEYS.SELECTED_IMG)).toBe(clickedWhilePending);
    expect(storedSelectionWrite).not.toHaveBeenCalledWith(LS_KEYS.SELECTED_IMG, expect.any(String));
    storedSelectionWrite.mockRestore();
  });
});

describe('REQ-335 unconfirmed projection and release', () => {
  const makeJob = (overrides: Record<string, unknown>): any => ({
    job_id: 'job-x', request_id: 'req-x', prompt_id: null, session_id: 'other', scope: 'normal',
    batch_id: 'batch-x', normal_group_id: 'group-x', project_id: null, status: 'queued',
    started_at: null, finished_at: null, node: null, outputs: [], failure: null, preview_url: null,
    ...overrides,
  });
  const makeSnap = (jobs: any[], revision = 1, epoch = 'epoch-1'): any => ({
    version: 1, epoch, revision, normal_group_id: null, jobs, batches: [],
    upstream: { http_ready: true, ws_connected: true, failure_since: null },
  });

  beforeEach(() => {
    _resetWebSocketForTesting();
    localStorage.clear();
    vi.restoreAllMocks();
    resetGenerationApiMocks();
    useGenerationStore.setState({
      generationSnapshot: null,
      isGenerating: false, currentPromptId: null, activeBatch: null,
      queueRunning: [], queuePending: [], filterOwnSession: false, batchImages: [], comfyHistoryImages: [],
    });
  });

  it('[REQ-335/AC-1] projectQueue does not place unconfirmed jobs in queuePending and exposes upstream items of unconfirmed prompts', () => {
    const snap = makeSnap([makeJob({ job_id: 'u-1', prompt_id: 'p-1', status: 'unconfirmed' })]);
    const upstream: any = { running: [], pending: [{ prompt_id: 'p-1', client_id: null }] };
    const projected = projectQueue(snap, upstream);
    expect(projected.pending.map((row: any) => row[1])).toEqual(['p-1']);
    expect(projected.pending.some((row: any) => row[1] === 'u-1')).toBe(false);
  });

  it('[REQ-335/AC-1] projectQueue treats released jobs like unconfirmed for projection', () => {
    const snap = makeSnap([makeJob({ job_id: 'r-1', prompt_id: 'p-r', status: 'released' })]);
    const upstream: any = { running: [], pending: [{ prompt_id: 'p-r', client_id: null }] };
    const projected = projectQueue(snap, upstream);
    expect(projected.pending.map((row: any) => row[1])).toEqual(['p-r']);
  });

  it('[REQ-335/AC-2] cancelJob propagates unconfirmed outcome without treating it as success', async () => {
    const snap = makeSnap([makeJob({ job_id: 'u-2', prompt_id: 'p-2', status: 'unconfirmed' })]);
    useGenerationStore.setState({ generationSnapshot: snap });
    vi.mocked(generationApi.cancelJob).mockResolvedValueOnce({ job_id: 'u-2', prompt_id: 'p-2', status: 'unconfirmed', outcome: 'unconfirmed', message: 'unknown' } as any);
    vi.mocked(generationApi.getState).mockResolvedValueOnce(snap);
    const result = await useGenerationStore.getState().cancelJob('u-2');
    expect(result.outcome).toBe('unconfirmed');
    const after = useGenerationStore.getState().generationSnapshot;
    expect(after?.jobs.find((job) => job.job_id === 'u-2')?.status).toBe('unconfirmed');
  });

  it('[REQ-335/AC-3] releaseUnconfirmed sends only given ids then refetches state', async () => {
    vi.mocked(generationApi.getState).mockClear();
    await useGenerationStore.getState().releaseUnconfirmed(['a', 'a', 'b']);
    expect(generationApi.releaseJobs).toHaveBeenCalledTimes(1);
    expect(generationApi.releaseJobs).toHaveBeenCalledWith({ job_ids: ['a', 'b'], session_id: useGenerationStore.getState().clientId });
    expect(generationApi.getState).toHaveBeenCalledTimes(1);
  });

  it('[REQ-335/AC-3] releaseUnconfirmed with empty ids does not call the API', async () => {
    await useGenerationStore.getState().releaseUnconfirmed([]);
    expect(generationApi.releaseJobs).not.toHaveBeenCalled();
  });

  it('[REQ-335/AC-3] releaseUnconfirmed splits 51 ids into two requests', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    await useGenerationStore.getState().releaseUnconfirmed(ids);
    expect(generationApi.releaseJobs).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generationApi.releaseJobs).mock.calls[0][0].job_ids).toHaveLength(50);
    expect(vi.mocked(generationApi.releaseJobs).mock.calls[1][0].job_ids).toHaveLength(1);
  });

  it('[REQ-335/AC-4] fetchQueue does not keep activeBatch open for an unconfirmed item', async () => {
    useGenerationStore.setState({
      isGenerating: true, isBatchSubmitting: false,
      activeBatch: [
        { promptId: 'ok', setName: 'Set 1', status: 'pending' },
        { promptId: 'unc', setName: 'Set 2', status: 'pending' },
      ],
    });
    vi.mocked(generationApi.getState).mockResolvedValueOnce(makeSnap([
      makeJob({ job_id: 'ok', prompt_id: 'ok', status: 'succeeded' }),
      makeJob({ job_id: 'unc', status: 'unconfirmed' }),
    ], 1, 'ac4-epoch'));
    await useGenerationStore.getState().fetchQueue();
    expect(useGenerationStore.getState().activeBatch).toBeNull();
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('[REQ-335/AC-5] unconfirmed that gains a prompt_id and becomes running moves to the running queue', async () => {
    vi.mocked(generationApi.getState)
      .mockResolvedValueOnce(makeSnap([makeJob({ job_id: 'u-5', prompt_id: null, status: 'unconfirmed' })], 1, 'ac5-epoch'))
      .mockResolvedValueOnce(makeSnap([makeJob({ job_id: 'u-5', prompt_id: 'p-5', status: 'running' })], 2, 'ac5-epoch'));
    await useGenerationStore.getState().fetchQueue();
    await useGenerationStore.getState().fetchQueue();
    const state = useGenerationStore.getState();
    expect(state.queueRunning.map((row: any) => row[2].prompt_id)).toContain('p-5');
    expect(state.queuePending).toEqual([]);
  });
});
