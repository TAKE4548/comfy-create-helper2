import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../useGenerationStore';

vi.mock('../../api/client', () => {
  return {
    configApi: {
      get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }),
    },
  };
});

describe('useGenerationStore REQ-059 preview reset logic', () => {
  beforeEach(() => {
    // Clear localStorage values
    localStorage.clear();
  });

  it('should reset previewImage to null when setSelectedImg is called', () => {
    // Set initial state
    useGenerationStore.setState({
      previewImage: 'some_preview_image.png',
      selectedImg: 'some_selected_image.png',
    });

    // Call action
    useGenerationStore.getState().setSelectedImg('new_selected_image.png');

    // Assert
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
    // Mock global fetch to return queue response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        queue_running: [],
        queue_pending: [],
      }),
    });
    (globalThis as any).fetch = mockFetch;

    // Set localStorage comfyUrl and initialize store to set module-level comfyUrl
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      isGenerating: true,
      activeBatch: [
        { promptId: 'id-1', setName: 'Set 1', status: 'pending' as const },
      ],
    });

    await useGenerationStore.getState().fetchQueue();

    // Since 'id-1' is pending but not in the queue, activeBatch should reset to null
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
    // Mock global fetch for ComfyUI prompt API and fetchQueue API
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'mock-prompt-id' }),
        });
      }
      if (url.endsWith('/queue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    // Call queuePrompt with metadata
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
        timestamp: i // Monotonically increasing timestamps
      }));
    }

    // Prepare mock fetch to return prompt_id: id-206
    const mockFetchPrune = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'id-206' }),
        });
      }
      if (url.endsWith('/queue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetchPrune;

    // Trigger queuePrompt which will prune the items
    await useGenerationStore.getState().queuePrompt({ nodes: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Check that we have exactly 200 items starting with 'prompt-surgeon-meta-'
    const keys = Object.keys(localStorage).filter(k => k.startsWith('prompt-surgeon-meta-'));
    expect(keys.length).toBe(200);

    // Oldest items (like id-1, id-2, etc.) should have been removed
    // Since we had 205, plus the new one 'id-206' makes 206, so we delete 6 oldest items (id-1 to id-6)
    for (let i = 1; i <= 6; i++) {
      expect(localStorage.getItem(`prompt-surgeon-meta-id-${i}`)).toBeNull();
    }
    // id-7 and onwards should remain
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
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'mock-prompt-id' }),
        });
      }
      if (url.endsWith('/queue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const fetchQueueSpy = vi.spyOn(useGenerationStore.getState(), 'fetchQueue');

    await useGenerationStore.getState().queuePrompt({ nodes: {} }, undefined, { skipQueueFetch: true });

    expect(fetchQueueSpy).not.toHaveBeenCalled();

    fetchQueueSpy.mockRestore();
  });

  it('should call fetchQueue when skipQueueFetch option is falsy', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'mock-prompt-id' }),
        });
      }
      if (url.endsWith('/queue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetch;

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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    (globalThis as any).fetch = mockFetch;

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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        queue_running: [],
        queue_pending: [],
      }),
    });
    (globalThis as any).fetch = mockFetch;

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

    // With isBatchSubmitting: true, activeBatch should NOT be cleared even if no IDs are in queue
    const state = useGenerationStore.getState();
    expect(state.activeBatch).toEqual(mockBatch);
    expect(state.isGenerating).toBe(true);

    // If isBatchSubmitting is set to false, fetchQueue should clear it
    useGenerationStore.setState({ isBatchSubmitting: false });
    await useGenerationStore.getState().fetchQueue();
    expect(useGenerationStore.getState().activeBatch).toBeNull();
  });

  it('should not show error toast when fetch is aborted with AbortError (Issue 2)', async () => {
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';

    const mockFetch = vi.fn().mockRejectedValue(abortError);
    (globalThis as any).fetch = mockFetch;

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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, 'abort');
    useGenerationStore.getState().setSubmissionAbortController(controller);

    await useGenerationStore.getState().cancelGeneration();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().submissionAbortController).toBeNull();
  });

  it('should only update lightweight state when isBatchIntermediate is true (Issue 3)', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'batch-prompt-id' }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetch;

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
    // previewImage and currentWorkflow should remain untouched in intermediate mode
    expect(state.previewImage).toBe('existing-preview.png');
    expect(state.currentWorkflow).toEqual({ initial: true });
    expect(localStorage.getItem('prompt-surgeon-meta-batch-prompt-id')).toBeNull();
  });
});

describe('useGenerationStore REQ-154 cancellation order and partial batch cancellation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('cancelAllJobs executes /queue delete BEFORE /interrupt', async () => {
    const fetchCalls: { url: string; method?: string; body?: string }[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push({
        url,
        method: init?.method,
        body: init?.body as string,
      });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
      });
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      queueRunning: [['0', 'run-1', {}, {}]],
      queuePending: [['1', 'pend-1', {}, {}]],
      filterOwnSession: false,
      isGenerating: true,
      currentPromptId: 'run-1',
    });

    await useGenerationStore.getState().cancelAllJobs();

    const urls = fetchCalls.map((c) => c.url);
    const queueIndex = urls.findIndex((u) => u.endsWith('/queue'));
    const interruptIndex = urls.findIndex((u) => u.endsWith('/interrupt'));
    const historyIndex = urls.findIndex((u) => u.endsWith('/history'));

    expect(queueIndex).toBeGreaterThanOrEqual(0);
    expect(interruptIndex).toBeGreaterThan(queueIndex);
    expect(historyIndex).toBeGreaterThan(interruptIndex);

    const state = useGenerationStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.currentPromptId).toBeNull();
    expect(state.activeBatch).toBeNull();
  });

  it('cancelJob updates status of target job to failed and maintains activeBatch if remaining jobs exist', async () => {
    const fetchCalls: { url: string; method?: string }[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push({ url, method: init?.method });
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ queue_running: [], queue_pending: [['1', 'job-2', {}, {}]] }),
      });
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'job-1',
      queueRunning: [['0', 'job-1', {}, {}]],
      queuePending: [['1', 'job-2', {}, {}]],
      activeBatch: [
        { promptId: 'job-1', setName: 'Set A', status: 'generating' },
        { promptId: 'job-2', setName: 'Set A', status: 'pending' },
      ],
    });

    await useGenerationStore.getState().cancelJob('job-1');

    const state = useGenerationStore.getState();
    // job-1 is failed, but job-2 is still pending so activeBatch is NOT null and isGenerating remains true
    expect(state.activeBatch).toHaveLength(2);
    expect(state.activeBatch?.[0].status).toBe('failed');
    expect(state.activeBatch?.[1].status).toBe('pending');
    expect(state.isGenerating).toBe(true);
    expect(state.currentPromptId).toBeNull();
  });

  it('cancelJob clears activeBatch when last unfinished job is cancelled', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ queue_running: [], queue_pending: [] }),
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();

    useGenerationStore.setState({
      isGenerating: true,
      currentPromptId: 'job-2',
      queueRunning: [['0', 'job-2', {}, {}]],
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
});

describe('useGenerationStore REQ-159 activeClientId and batch session preservation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('queuePrompt with isBatchIntermediate sets activeClientId to clientId', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/prompt')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ prompt_id: 'batch-prompt-id' }),
        });
      }
      return Promise.resolve({ ok: false });
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    useGenerationStore.setState({ activeClientId: null });

    await useGenerationStore.getState().queuePrompt({ nodes: {} }, undefined, { isBatchIntermediate: true });

    const state = useGenerationStore.getState();
    expect(state.activeClientId).toBe(state.clientId);
    expect(state.currentPromptId).toBe('batch-prompt-id');
  });

  it('fetchQueue sets activeClientId from queue_running if running job has client_id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        queue_running: [['0', 'job-1', {}, { client_id: 'remote-client-123' }]],
        queue_pending: [],
      }),
    });
    (globalThis as any).fetch = mockFetch;

    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    useGenerationStore.setState({ activeClientId: null });

    await useGenerationStore.getState().fetchQueue();

    expect(useGenerationStore.getState().activeClientId).toBe('remote-client-123');
  });

  it('fetchHistory reconciles own session images into batchImages and localStorage', async () => {
    localStorage.setItem('prompt-surgeon-comfy-url', 'http://localhost:8188');
    useGenerationStore.getState().initialize();
    const myClientId = useGenerationStore.getState().clientId;

    useGenerationStore.setState({
      batchImages: ['existing-image.png'],
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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHistoryData),
    });
    (globalThis as any).fetch = mockFetch;

    await useGenerationStore.getState().fetchHistory();

    const state = useGenerationStore.getState();
    // comfyHistoryImages has both
    expect(state.comfyHistoryImages.length).toBe(2);
    // batchImages has existing + own image, but NOT other image
    expect(state.batchImages).toContain('existing-image.png');
    expect(state.batchImages.some(img => img.includes('my-new-image.png'))).toBe(true);
    expect(state.batchImages.some(img => img.includes('other-image.png'))).toBe(false);

    const storedBatchImages = JSON.parse(localStorage.getItem('prompt-surgeon-batch-images') || '[]');
    expect(storedBatchImages.some((img: string) => img.includes('my-new-image.png'))).toBe(true);
  });
});


