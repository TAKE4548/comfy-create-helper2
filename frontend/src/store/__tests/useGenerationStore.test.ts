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
