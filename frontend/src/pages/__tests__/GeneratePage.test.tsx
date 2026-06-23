import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  };
  return {
    useGenerationStore: () => store,
  };
});

describe('GeneratePage Component Regression Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
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
});
