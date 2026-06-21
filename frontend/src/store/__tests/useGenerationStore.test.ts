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
