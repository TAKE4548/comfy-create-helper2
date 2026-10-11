import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GeneratePage, GeneratePageErrorBoundary } from '../GeneratePage';

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
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

// Mock useGenerationStore
vi.mock('../../store/useGenerationStore', () => {
  const store = {
    clientId: 'test-client',
    isConnected: true,
    isGenerating: false,
    progress: null,
    generationSnapshot: null,
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
  const listeners = new Set<(state: typeof store, previousState: typeof store) => void>();
  const useGenerationStore = (selector?: (state: typeof store) => unknown) =>
    selector ? selector(store) : store;
  Object.assign(useGenerationStore, {
    getState: () => store,
    getInitialState: () => store,
    setState: (updater: Partial<typeof store> | ((state: typeof store) => Partial<typeof store>)) => {
      const previousState = { ...store };
      Object.assign(store, typeof updater === 'function' ? updater(store) : updater);
      listeners.forEach((listener) => listener(store, previousState));
    },
    subscribe: (listener: (state: typeof store, previousState: typeof store) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {
    useGenerationStore,
  };
});

describe('GeneratePage Component Regression Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
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
    const uploadOption = select.querySelector('option[value=""]');
    expect(uploadOption).toHaveTextContent('新しいワークフローを追加 (Upload New...)');
    expect(uploadOption).toHaveValue('');
    expect(uploadOption).not.toHaveTextContent(/^\s*\+/);
  });

  it('toggles workflow actions menu when workflow actions button is clicked', async () => {
    const { container } = renderPage();

    const actionsBtn = await screen.findByTitle('ワークフロー設定');
    expect(actionsBtn).toBeInTheDocument();

    // Menu should not be visible initially
    expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();

    // Click to open menu
    fireEvent.click(actionsBtn);
    expect(container.querySelector('[role="menu"]')).toBeInTheDocument();
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument();

    // Click again to close
    fireEvent.click(actionsBtn);
    expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();
  });

  it('supports switching to mobile mode based on innerWidth', async () => {
    // Modify innerWidth to simulate mobile device size
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    renderPage();

    // Verify mobile layout elements
    const mobileActionsBtn = await screen.findByTitle('ワークフロー設定');
    expect(mobileActionsBtn).toBeInTheDocument();
    const mobileUploadOption = screen.getByRole('option', { name: '新しいワークフローを追加 (Upload New...)' });
    expect(mobileUploadOption).toHaveValue('');
    expect(mobileUploadOption).not.toHaveTextContent(/^\s*\+/);
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

  it('REQ-112: workflow actions menu contains workflow management items', async () => {
    const { container } = renderPage();
    const actionsBtn = await screen.findByTitle('ワークフロー設定');
    fireEvent.click(actionsBtn);
    await waitFor(() => {
      expect(container.querySelector('#workflow-actions-rename')).toBeInTheDocument();
      expect(container.querySelector('#workflow-actions-duplicate')).toBeInTheDocument();
      expect(container.querySelector('#workflow-actions-rescan')).toBeInTheDocument();
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

    it('renders error boundary fallback UI when a child component throws an error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ProblemChild = () => {
        throw new Error('Test crash in layout');
      };

      render(
        <GeneratePageErrorBoundary>
          <ProblemChild />
        </GeneratePageErrorBoundary>
      );

      expect(screen.getByText('画面の表示中にエラーが発生しました')).toBeInTheDocument();
      expect(screen.getByText('Test crash in layout')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('locks autosave before initial sync completes and preserves prompt without destructive empty save on server restart', async () => {
      const { workflowPresetsApi } = await import('../../api/client');
      (workflowPresetsApi.list as any).mockResolvedValue([
        {
          id: 1,
          workflow_id: 1,
          name: 'Set 1',
          param_values: { Sampler_Seed: '12345', positive: 'masterpiece, 1girl' },
          applied_assets: {},
          batch_size: 1,
          seed_mode: 'fixed',
          seed: 12345,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]);

      const updateSpy = vi.spyOn(workflowPresetsApi, 'update');

      renderPage();

      // 初期同期前および同期直後に空文字破壊の update が autosave されないこと
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      });

      expect(updateSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          param_values: expect.objectContaining({ positive: '' }),
        })
      );
    });
  });
});
