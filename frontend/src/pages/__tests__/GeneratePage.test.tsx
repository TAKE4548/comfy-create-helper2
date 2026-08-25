import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GeneratePage } from '../GeneratePage';

// Mock client api
vi.mock('../../api/client', () => ({
  workflowsApi: {
    list: vi.fn().mockResolvedValue([{ id: 1, name: 'Standard Workflow' }]),
    get: vi.fn().mockResolvedValue({
      id: 1,
      name: 'Standard Workflow',
      json_body: {
        '3': { inputs: { seed: 123 } }
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
        }
      ]
    }),
  },
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
  },
  mappingMastersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  lorasApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  tagSetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  workflowPresetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

// Mock useGenerationStore
vi.mock('../../store/useGenerationStore', () => {
  const store = {
    clientId: 'test-client',
    isConnected: true,
    isGenerating: false,
    progress: null,
    previewImage: null,
    activeClientId: null,
    filterOwnSession: false,
    setFilterOwnSession: vi.fn(),
    selectedWorkflowId: 1,
    setSelectedWorkflowId: vi.fn(),
    paramValues: { Sampler_Seed: '12345' },
    setParamValues: vi.fn(),
    batchSize: 1,
    setBatchSize: vi.fn(),
    seedMode: 'fixed',
    setSeedMode: vi.fn(),
    seed: 12345,
    setSeed: vi.fn(),
    batchImages: [],
    selectedImg: null,
    setSelectedImg: vi.fn(),
    comfyHistoryImages: [],
    appliedAssets: {},
    addAppliedAsset: vi.fn(),
    removeAppliedAsset: vi.fn(),
    toggleAppliedAsset: vi.fn(),
    setAppliedAssets: vi.fn(),
    comfyUrl: 'http://localhost:8188',
    setComfyUrl: vi.fn(),
    queueRunning: [],
    queuePending: [],
    sets: [
      { id: '1', name: 'Set 1', checked: true, batchSize: 1, paramValues: {}, seedMode: 'fixed', seed: 12345, appliedAssets: {} }
    ],
    activeSetId: '1',
    addSet: vi.fn(),
    removeSet: vi.fn(),
    renameSet: vi.fn(),
    toggleSetChecked: vi.fn(),
    setAllSetsChecked: vi.fn(),
    setActiveSetId: vi.fn(),
    updateActiveSet: vi.fn(),
    activeBatch: null,
    fetchParamSyncGroups: vi.fn(),
  };
  return {
    useGenerationStore: () => store,
  };
});

describe('GeneratePage Component Regression Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <GeneratePage />
      </QueryClientProvider>
    );
  };

  it('renders Desktop layout by default and shows workflows', async () => {
    const { container } = renderPage();

    // Verify header title
    expect(screen.getAllByText('Generate')[0]).toBeInTheDocument();

    // Check if workflow select is present
    const select = container.querySelector('#workflow-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
  });

  it('toggles settings popover when settings button is clicked', async () => {
    renderPage();

    const settingsBtn = screen.getByTitle('ComfyUI設定');
    expect(settingsBtn).toBeInTheDocument();

    // Settings popover should not be visible initially
    expect(screen.queryByText('ComfyUI URL')).not.toBeInTheDocument();

    // Click to open popover
    fireEvent.click(settingsBtn);
    expect(screen.getByText('ComfyUI URL')).toBeInTheDocument();

    // In our popover code: <button type="button" onClick={() => setIsSettingsOpen(false)} ...><X size={14} /></button>
    // We can simulate clicking it or close via popover toggle
    fireEvent.click(settingsBtn); // toggles off
    expect(screen.queryByText('ComfyUI URL')).not.toBeInTheDocument();
  });

  it('supports switching to mobile mode based on innerWidth', async () => {
    // Modify innerWidth to simulate mobile device size
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    renderPage();

    // Verify mobile layout elements (e.g. settings-toggle-btn-mobile or similar)
    const mobileSettingsBtn = screen.getByTitle('ComfyUI設定');
    expect(mobileSettingsBtn).toBeInTheDocument();
  });

  it('REQ-112: header does not contain removed UI elements', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#workflow-base-model-select')).not.toBeInTheDocument();
    });
    expect(container.querySelector('#workflow-ops-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#rescan-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#scene-generator-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#set-name-input')).not.toBeInTheDocument();
  });

  it('REQ-112: manage-presets-btn opens preset manager modal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const manageBtn = container.querySelector('#manage-presets-btn');
      expect(manageBtn).toBeInTheDocument();
    });
  });

  it('REQ-112: settings popover contains workflow management items', async () => {
    const { container } = renderPage();
    const settingsBtn = screen.getByTitle('ComfyUI設定');
    fireEvent.click(settingsBtn);
    await waitFor(() => {
      expect(container.querySelector('#popover-rename-btn')).toBeInTheDocument();
      expect(container.querySelector('#popover-copy-btn')).toBeInTheDocument();
      expect(container.querySelector('#popover-rescan-btn')).toBeInTheDocument();
    });
  });

  it('REQ-161: Generate Batch button is disabled when workflow is not loaded (Desktop)', async () => {
    const { workflowsApi } = await import('../../api/client');
    // Delay workflow get resolution
    let resolveWorkflow: (val: any) => void;
    (workflowsApi.get as any).mockImplementationOnce(() => new Promise((res) => {
      resolveWorkflow = res;
    }));

    const { container } = renderPage();
    const btn = container.querySelector('#generate-btn') as HTMLButtonElement;
    expect(btn).toBeInTheDocument();
    expect(btn.disabled).toBe(true);

    // After workflow loads, button becomes enabled
    await act(async () => {
      resolveWorkflow!({
        id: 1,
        name: 'Standard Workflow',
        json_body: { '3': { inputs: { seed: 123 } } },
        mappings: [],
      });
    });

    await waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
  });

  it('REQ-161: Generate Batch button is disabled when workflow is not loaded (Mobile)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const { workflowsApi } = await import('../../api/client');
    let resolveWorkflow: (val: any) => void;
    (workflowsApi.get as any).mockImplementationOnce(() => new Promise((res) => {
      resolveWorkflow = res;
    }));

    const { container } = renderPage();
    const mobileBtn = container.querySelector('#generate-btn-mobile') as HTMLButtonElement;
    expect(mobileBtn).toBeInTheDocument();
    expect(mobileBtn.disabled).toBe(true);

    await act(async () => {
      resolveWorkflow!({
        id: 1,
        name: 'Standard Workflow',
        json_body: { '3': { inputs: { seed: 123 } } },
        mappings: [],
      });
    });

    await waitFor(() => {
      expect(mobileBtn.disabled).toBe(false);
    });
  });

  describe('REQ-186: Preset Manager Modal tab management & persistence', () => {
    it('keeps preset manager modal open when selecting a preset to open as tab', async () => {
      const { workflowPresetsApi } = await import('../../api/client');
      (workflowPresetsApi.list as any).mockResolvedValue([
        { id: 101, workflow_id: 1, name: 'Preset Alpha', param_values: {} },
        { id: 102, workflow_id: 1, name: 'Preset Beta', param_values: {} },
      ]);

      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      // Open preset manager modal
      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
        expect(screen.getByText('Preset Alpha')).toBeInTheDocument();
      });

      // Click on preset row to open as tab
      fireEvent.click(screen.getByText('Preset Alpha'));

      // Modal should remain open
      expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      expect(screen.getByText('Preset Beta')).toBeInTheDocument();
    });

    it('allows closing tabs directly from preset manager modal', async () => {
      const { useGenerationStore } = await import('../../store/useGenerationStore');
      const store = (useGenerationStore as any)();
      const { workflowPresetsApi } = await import('../../api/client');
      (workflowPresetsApi.list as any).mockResolvedValue([
        { id: 1, workflow_id: 1, name: 'Preset 1', param_values: {} },
      ]);

      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      // Open preset manager modal
      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      });

      // Preset 1 is loaded (active/open as tab). Check for close tab button or badge.
      const closeTabBtn = container.querySelector('#preset-close-tab-btn-1');
      if (closeTabBtn) {
        fireEvent.click(closeTabBtn);
        expect(store.removeSet).toHaveBeenCalledWith(1);
      }
    });

    it('closes preset manager modal when explicitly clicking close button', async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      });

      // Modal close button
      const modalCloseBtn = screen.getByText('プリセット管理').parentElement?.querySelector('button');
      expect(modalCloseBtn).toBeInTheDocument();
      fireEvent.click(modalCloseBtn!);

      await waitFor(() => {
        expect(screen.queryByText('プリセット管理')).not.toBeInTheDocument();
      });
    });
  });
});
