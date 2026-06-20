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
    const store = useGenerationStore.getState();
    
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
