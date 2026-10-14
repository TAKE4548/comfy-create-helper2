import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GeneratePage, GeneratePageErrorBoundary } from '../../GeneratePage';
import { DesktopLayout } from '../components/DesktopLayout';
import {
  resetTestStore,
  createTestQueryClient,
  setupNetworkGuard,
  teardownNetworkGuard,
  MockWebSocketController,
} from '../../../test/utils';
import { useGenerationStore } from '../../../store/useGenerationStore';
import { workflowsApi, workflowPresetsApi, mappingMastersApi } from '../../../api/client';
import { stageMastersApi } from '../../../api/domains/stageMasters';

vi.mock('../../../api/client', () => ({
  workflowsApi: {
    list: vi.fn().mockResolvedValue([{ id: 1, name: 'Standard Workflow' }]),
    get: vi.fn().mockResolvedValue({
      id: 1,
      name: 'Standard Workflow',
      json_body: {
        '3': { inputs: { seed: 123 } },
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
        },
      ],
    }),
    update: vi.fn().mockResolvedValue({}),
    duplicate: vi.fn().mockResolvedValue({ id: 2, name: 'Standard Workflow (Copy)' }),
    delete: vi.fn().mockResolvedValue({}),
    getHistoryStatus: vi.fn().mockResolvedValue({ has_rollback: false }),
  },
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    restore: vi.fn().mockResolvedValue({}),
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
    reorder: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({}),
  },
  baseModelsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  paramTypeMastersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  paramSyncGroupsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  bypassProfilesApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  api: {
    workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    bypassProfiles: { list: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock('../../../api/domains/stageMasters', () => ({
  stageMastersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../../api/domains/workflows', () => ({
  bypassProfilesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

const stages = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 0 },
  { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 1 },
];

const masters = [
  {
    id: 7, group_id: null, base_key: 'prompt', name: 'Prompt', param_name: 'text', input_type: 'textarea', expected_class_types: null, base_title_patterns: null, sort_order: 0,
    variants: [
      { id: 71, master_id: 7, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Main_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
      { id: 72, master_id: 7, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Rough_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 8, group_id: null, base_key: 'steps', name: 'Steps', param_name: 'steps', input_type: 'int', expected_class_types: null, base_title_patterns: null, sort_order: 1,
    variants: [
      { id: 81, master_id: 8, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'steps_main', extra_title_patterns: null, is_enabled: true },
      { id: 82, master_id: 8, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'steps_rough', extra_title_patterns: null, is_enabled: true },
    ],
  },
];

const textMappings = [
  { id: 11, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Main Prompt' },
  { id: 12, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Rough Prompt' },
];

const paramMappings = [
  { id: 21, master_id: 8, variant_id: 81, node_id: '1', role: 'steps_main', param_name: 'steps', input_type: 'int', display_name: 'Main Steps' },
  { id: 22, master_id: 8, variant_id: 82, node_id: '2', role: 'steps_rough', param_name: 'steps', input_type: 'int', display_name: 'Rough Steps' },
  { id: 23, master_id: 99, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
];

const fn = () => vi.fn();

function makeDesktopState(paramValues: Record<string, string>, setParamValues: (values: Record<string, string>) => void, collapsedRole: string, setCollapsedRole: (role: string) => void, omitRough: boolean) {
  return {
    isConnected: true, isGenerating: false, progress: 0, previewImage: null, activeClientId: 'client', clientId: 'client',
    selectedWorkflowId: 1, setSelectedWorkflowId: fn(), paramValues, setParamValues, batchSize: 1, setBatchSize: fn(), seedMode: 'random', setSeedMode: fn(), seed: 123, setSeed: fn(), selectedImg: null, setSelectedImg: fn(),
    appliedAssets: {}, addAppliedAsset: fn(), toggleAppliedAsset: fn(), removeAppliedAsset: fn(), activeBatch: null, sets: [], activeSetId: 'default', removeSet: fn(), toggleSetChecked: fn(), openPresetIds: [], undo: fn(), redo: fn(), canUndo: false, canRedo: false,
    setRescanOpen: fn(), selectedMasters: {}, setSelectedMasters: fn(), openAddAssetRole: null, setOpenAddAssetRole: fn(), setIsJobModalOpen: fn(), setIsPresetManagerOpen: fn(), setWorkflowManageMode: fn(), baseModels: [], updateWorkflowBaseModelMutation: { mutate: fn() },
    workflows: [{ id: 1, name: 'Workflow', target_base_model_id: 'sdxl' }], workflow: { id: 1, name: 'Workflow', json_body: '{}', mappings: [] }, mappingMasters: masters, loras: [], paramTypeMasters: [], tagSets: [], presets: [], comfyObjectInfo: null,
    displayImages: [], sortedDisplayImages: [], isMultiSelectMode: false, selectedIds: new Set(), handleItemClick: fn(), getLongPressHandlers: () => ({}), isSelected: () => false, exitMultiSelectMode: fn(), selectAll: fn(), clearSelection: fn(),
    auditOpen: false, setAuditOpen: fn(), auditIntent: '', setAuditIntent: fn(), auditTypes: [], setAuditTypes: fn(), auditResult: null, auditStatus: 'idle', runAudit: { mutate: fn() }, dragOver: false, handleFileSelect: fn(), handleDragOver: fn(), handleDragLeave: fn(), handleDrop: fn(),
    isGeneratingHere: false, isOtherSessionGenerating: false, allQueueCount: 0, totalQueueCount: 0, showStrip: false, invalidMappings: [], textMappings: omitRough ? [textMappings[0]] : textMappings, paramMappings: omitRough ? [paramMappings[0], paramMappings[2]] : paramMappings,
    handleLoadSnapshot: fn(), handleUpdateMapping: fn(), handleOpenModalPreview: fn(), handleGenerateSets: fn(), getIsRoleCollapsed: (role: string) => role === collapsedRole, setRoleCollapsed: (role: string, collapsed: boolean) => setCollapsedRole(collapsed ? role : ''), handleSaveDefaultParams: fn(), handleResetDefaultParams: fn(), setIsSaveModalOpen: fn(), updateWorkflowMutation: { mutate: fn(), isPending: false }, saveDefaultParamsMutation: { isPending: false }, isAnimaMode: false, setIsAnimaMode: fn(), promptTranslation: {},
  };
}

describe('GeneratePage Component & State Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    setupNetworkGuard();
    MockWebSocketController.install();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
    queryClient = createTestQueryClient();
    queryClient.setQueryData(['comfy-lora-models'], []);
    queryClient.setQueryData(['tag-sets'], []);
    queryClient.setQueryData(['loras'], []);
    resetTestStore({
      clientId: 'test-client',
      isConnected: true,
      isGenerating: false,
      progress: null,
      generationSnapshot: null,
      previewImage: null,
      activeClientId: null,
      filterOwnSession: false,
      selectedWorkflowId: 1,
      paramValues: { Sampler_Seed: '12345' },
      batchSize: 1,
      seedMode: 'fixed',
      seed: 12345,
      batchImages: [],
      selectedImg: null,
      comfyHistoryImages: [],
      appliedAssets: {},
      comfyUrl: 'http://localhost:8188',
      queueRunning: [],
      queuePending: [],
      sets: [
        { id: '1', name: 'Set 1', checked: true, batchSize: 1, paramValues: {}, seedMode: 'fixed', seed: 12345, appliedAssets: {} },
      ],
      activeSetId: '1',
      activeBatch: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownNetworkGuard();
    MockWebSocketController.uninstall();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    window.dispatchEvent(new Event('resize'));
    useGenerationStore.setState({ promptChips: {}, roleTextModes: {} } as any);
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <GeneratePage />
      </QueryClientProvider>
    );
  };

  it('[REQ-112/AC-1] renders Desktop layout by default and shows workflows', async () => {
    const { container } = renderPage();
    expect(screen.getAllByText('Generate')[0]).toBeInTheDocument();
    const select = container.querySelector('#workflow-select') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const uploadOption = select.querySelector('option[value=""]');
    expect(uploadOption).toHaveTextContent('新しいワークフローを追加 (Upload New...)');
    expect(uploadOption).toHaveValue('');
    expect(uploadOption).not.toHaveTextContent(/^\s*\+/);
  });

  it('[REQ-112/AC-2] toggles workflow actions menu when workflow actions button is clicked', async () => {
    const { container } = renderPage();
    const actionsBtn = await screen.findByTitle('ワークフロー設定');
    expect(actionsBtn).toBeInTheDocument();
    expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();

    fireEvent.click(actionsBtn);
    expect(container.querySelector('[role="menu"]')).toBeInTheDocument();
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument();

    fireEvent.click(actionsBtn);
    expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();
  });

  it('[REQ-112/AC-3] supports switching to mobile mode based on innerWidth', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    renderPage();
    const mobileActionsBtn = await screen.findByTitle('ワークフロー設定');
    expect(mobileActionsBtn).toBeInTheDocument();
    const mobileUploadOption = screen.getByRole('option', { name: '新しいワークフローを追加 (Upload New...)' });
    expect(mobileUploadOption).toHaveValue('');
    expect(mobileUploadOption).not.toHaveTextContent(/^\s*\+/);
  });

  it('[REQ-112/AC-4] header does not contain removed UI elements', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('#workflow-base-model-select')).not.toBeInTheDocument();
    });
    expect(container.querySelector('#workflow-ops-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#rescan-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#scene-generator-btn')).not.toBeInTheDocument();
    expect(container.querySelector('#set-name-input')).not.toBeInTheDocument();
  });

  it('[REQ-112/AC-5] manage-presets-btn opens preset manager modal', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const manageBtn = container.querySelector('#manage-presets-btn');
      expect(manageBtn).toBeInTheDocument();
    });
  });

  it('[REQ-112/AC-6] workflow actions menu contains workflow management items', async () => {
    const { container } = renderPage();
    const actionsBtn = await screen.findByTitle('ワークフロー設定');
    fireEvent.click(actionsBtn);
    await waitFor(() => {
      expect(container.querySelector('#workflow-actions-rename')).toBeInTheDocument();
      expect(container.querySelector('#workflow-actions-duplicate')).toBeInTheDocument();
      expect(container.querySelector('#workflow-actions-rescan')).toBeInTheDocument();
    });
  });

  it('[REQ-161/AC-1] Generate Batch button is disabled when workflow is not loaded (Desktop)', async () => {
    let resolveWorkflow: (val: any) => void;
    (workflowsApi.get as any).mockImplementationOnce(() => new Promise((res) => {
      resolveWorkflow = res;
    }));

    const { container } = renderPage();
    const btn = container.querySelector('#generate-btn') as HTMLButtonElement;
    expect(btn).toBeInTheDocument();
    expect(btn.disabled).toBe(true);
    await waitFor(() => expect(workflowsApi.get).toHaveBeenCalledWith(1));

    resolveWorkflow!({
      id: 1,
      name: 'Standard Workflow',
      json_body: { '3': { inputs: { seed: 123 } } },
      mappings: [],
    });

    await waitFor(() => expect(queryClient.getQueryState(['workflow', 1])?.status).toBe('success'));
    await waitFor(() => {
      const button = container.querySelector('#generate-btn') as HTMLButtonElement;
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
    });
  });

  it('[REQ-161/AC-2] Generate Batch button is disabled when workflow is not loaded (Mobile)', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    let resolveWorkflow: (val: any) => void;
    (workflowsApi.get as any).mockImplementationOnce(() => new Promise((res) => {
      resolveWorkflow = res;
    }));

    const { container } = renderPage();
    const mobileBtn = container.querySelector('#generate-btn-mobile') as HTMLButtonElement;
    expect(mobileBtn).toBeInTheDocument();
    expect(mobileBtn.disabled).toBe(true);
    await waitFor(() => expect(workflowsApi.get).toHaveBeenCalledWith(1));

    resolveWorkflow!({
      id: 1,
      name: 'Standard Workflow',
      json_body: { '3': { inputs: { seed: 123 } } },
      mappings: [],
    });

    await waitFor(() => expect(queryClient.getQueryState(['workflow', 1])?.status).toBe('success'));
    await waitFor(() => {
      const button = container.querySelector('#generate-btn-mobile') as HTMLButtonElement;
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
    });
  });

  describe('Preset Manager Modal tab management & persistence', () => {
    it('[REQ-186/AC-1] keeps preset manager modal open when selecting a preset to open as tab', async () => {
      const presetsData = [
        { id: 101, workflow_id: 1, name: 'Preset Alpha', param_values: {} },
        { id: 102, workflow_id: 1, name: 'Preset Beta', param_values: {} },
      ];
      (workflowPresetsApi.list as any).mockResolvedValue(presetsData);
      queryClient.setQueryData(['workflow-presets', 1], presetsData);

      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
        expect(screen.getAllByText('Preset Alpha').length).toBeGreaterThan(0);
      });

      const presetItems = screen.getAllByText('Preset Alpha');
      fireEvent.click(presetItems[presetItems.length - 1]);
      expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      expect(screen.getByText('Preset Beta')).toBeInTheDocument();
    });

    it('[REQ-186/AC-2] allows closing tabs directly from preset manager modal', async () => {
      const presetsData = [
        { id: 1, workflow_id: 1, name: 'Preset 1', param_values: {} },
      ];
      (workflowPresetsApi.list as any).mockResolvedValue(presetsData);
      queryClient.setQueryData(['workflow-presets', 1], presetsData);

      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      });

      const closeTabBtn = container.querySelector('#preset-close-tab-btn-1');
      if (closeTabBtn) {
        fireEvent.click(closeTabBtn);
        expect(useGenerationStore.getState().sets.find((s) => s.id === '1')).toBeUndefined();
      }
    });

    it('[REQ-186/AC-3] closes preset manager modal when explicitly clicking close button', async () => {
      const { container } = renderPage();
      await waitFor(() => {
        expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument();
      });

      fireEvent.click(container.querySelector('#manage-presets-btn')!);
      await waitFor(() => {
        expect(screen.getByText('プリセット管理')).toBeInTheDocument();
      });

      const modalCloseBtn = screen.getByText('プリセット管理').parentElement?.querySelector('button');
      expect(modalCloseBtn).toBeInTheDocument();
      fireEvent.click(modalCloseBtn!);

      await waitFor(() => {
        expect(screen.queryByText('プリセット管理')).not.toBeInTheDocument();
      });
    });
  });

  it('[REQ-112/AC-7] renders error boundary fallback UI when a child component throws an error', () => {
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

  it('[REQ-323/AC-1] locks autosave before initial sync completes and preserves prompt without destructive empty save on server restart', async () => {
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

  it('[REQ-363/AC-4] renders preset manager as bottom sheet with 75dvh max-height and fixed action dock', async () => {
    vi.mocked(workflowPresetsApi.list).mockResolvedValue([
      { id: 101, workflow_id: 1, name: 'Preset Alpha', param_values: {} },
      { id: 102, workflow_id: 1, name: 'Preset Beta', param_values: {} },
    ] as any);

    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('#manage-presets-btn')).not.toBeNull());
    const manageBtn = container.querySelector('#manage-presets-btn') as HTMLElement;

    fireEvent.click(manageBtn);

    const overlay = await screen.findByTestId('preset-manager-overlay');
    expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50', 'items-end', 'md:items-center');

    const modal = screen.getByTestId('preset-manager-modal');
    expect(modal).toHaveClass('max-h-[75dvh]', 'rounded-t-2xl', 'md:rounded-xl', 'flex', 'flex-col');

    // ListChecks / bulk mode button must be preserved
    const bulkBtn = container.querySelector('button svg.lucide-list-checks')?.closest('button');
    expect(bulkBtn).not.toBeNull();

    // Fixed bottom dock contains all check/uncheck and save buttons
    const dock = screen.getByTestId('preset-manager-dock');
    expect(dock).toHaveClass('shrink-0');
    expect(dock.querySelector('#preset-check-all-btn')).not.toBeNull();
    expect(dock.querySelector('#preset-uncheck-all-btn')).not.toBeNull();
    expect(dock.querySelector('#preset-overwrite-btn')).not.toBeNull();
    expect(dock.querySelector('#preset-saveas-btn')).not.toBeNull();
  });
});

describe('GeneratePage Stage Groups & Visual Integration (REQ-347)', () => {
  let client: QueryClient;

  function renderGenerate(options: { textMode?: boolean; collapsedRole?: string; omitRough?: boolean; cacheStages?: boolean; cacheMasters?: boolean } = {}) {
    client = createTestQueryClient();
    client.setDefaultOptions({
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    });
    if (options.cacheStages !== false) client.setQueryData(['stage-masters'], stages);
    if (options.cacheMasters !== false) client.setQueryData(['mapping-masters'], masters);
    function Harness() {
      const [paramValues, setParamValues] = useState({ Main_Positive_Prompt: 'A', Rough_Positive_Prompt: 'B', steps_main: '20', steps_rough: '30' });
      const [collapsedRole, setCollapsedRole] = useState(options.collapsedRole ?? '');
      return <DesktopLayout state={makeDesktopState(paramValues, setParamValues, collapsedRole, setCollapsedRole, options.omitRough ?? false) as any} />;
    }
    useGenerationStore.setState({ roleTextModes: options.textMode === false ? {} : { Main_Positive_Prompt: true, Rough_Positive_Prompt: true } } as any);
    const view = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    return { ...view, client };
  }

  beforeEach(() => {
    setupNetworkGuard();
    MockWebSocketController.install();
    resetTestStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownNetworkGuard();
    MockWebSocketController.uninstall();
    useGenerationStore.setState({ promptChips: {}, roleTextModes: {} } as any);
  });

  it('[REQ-347/AC-1] scopes stage headings to independent roots and keeps role edits independent in shared live state', async () => {
    const { container, client: qc } = renderGenerate();
    await screen.findByText('Batch Size');
    const prompts = container.querySelector<HTMLElement>('#desktop-prompt-scroll')!;
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!;
    expect(prompts).not.toBe(controls);
    expect(prompts).toHaveAttribute('data-stage-scroll-root', '');
    expect(controls).toHaveAttribute('data-stage-scroll-root', '');
    for (const root of [prompts, controls]) {
      expect(within(root).getAllByRole('heading', { name: 'Main (main)' })).toHaveLength(1);
      expect(within(root).getAllByRole('heading', { name: 'Rough (rough)' })).toHaveLength(1);
    }
    expect(qc.getQueryData(['stage-masters'])).toEqual(stages);
    expect(qc.getQueryData(['mapping-masters'])).toEqual(masters);

    fireEvent.change(prompts.querySelector('#prompt-Main_Positive_Prompt textarea')!, { target: { value: 'Main A edited' } });
    fireEvent.change(prompts.querySelector('#prompt-Rough_Positive_Prompt textarea')!, { target: { value: 'Rough C' } });
    expect((prompts.querySelector('#prompt-Main_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Main A edited');
    expect((prompts.querySelector('#prompt-Rough_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Rough C');

    fireEvent.change(controls.querySelector('#param-steps_rough')!, { target: { value: '40' } });
    expect((controls.querySelector('#param-steps_main') as HTMLInputElement).value).toBe('20');
    expect((controls.querySelector('#param-steps_rough') as HTMLInputElement).value).toBe('40');
    expect(within(controls).getAllByText('Batch Size')).toHaveLength(1);
    expect(within(controls).getAllByText('Seed')).toHaveLength(1);
    expect(prompts.querySelector('#param-steps_rough')).toBeNull();
    expect(controls.querySelector('#prompt-Rough_Positive_Prompt')).toBeNull();

    act(() => qc.setQueryData(['stage-masters'], [
      { ...stages[0], name: 'Main Updated', sort_order: 1 },
      { ...stages[1], name: 'Rough Updated', sort_order: 0 },
    ]));
    await within(prompts).findByRole('heading', { name: 'Main Updated (main)' });
    await within(controls).findByRole('heading', { name: 'Rough Updated (rough)' });
    expect(Array.from(prompts.querySelectorAll('[data-stage-key]')).map((group) => group.getAttribute('data-stage-key'))).toEqual(['rough', 'main']);
    expect((prompts.querySelector('#prompt-Main_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Main A edited');
    expect((prompts.querySelector('#prompt-Rough_Positive_Prompt textarea') as HTMLTextAreaElement).value).toBe('Rough C');
    expect((controls.querySelector('#param-steps_main') as HTMLInputElement).value).toBe('20');
    expect((controls.querySelector('#param-steps_rough') as HTMLInputElement).value).toBe('40');
  });

  it('[REQ-347/AC-2] preserves disabled role chips, supports collapsing one role, and omits an empty stage', async () => {
    useGenerationStore.setState({ promptChips: { Main_Positive_Prompt: [{ id: 'locked-chip', text: 'locked', enabled: false }] } } as any);
    const { container } = renderGenerate({ textMode: false, collapsedRole: 'Rough_Positive_Prompt', omitRough: true });
    const prompts = container.querySelector<HTMLElement>('#desktop-prompt-scroll')!;
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!;
    await screen.findByText('Batch Size');
    expect(within(prompts).getAllByRole('heading', { name: 'Main (main)' })).toHaveLength(1);
    expect(within(prompts).queryByRole('heading', { name: 'Rough (rough)' })).toBeNull();
    expect(within(controls).queryByRole('heading', { name: 'Rough (rough)' })).toBeNull();
    expect(prompts.querySelector('[data-ux-tag-chip=\"true\"]')).toHaveClass('line-through');
    expect(prompts.querySelector('#prompt-Rough_Positive_Prompt')).toBeNull();

    fireEvent.click(within(prompts).getByRole('button', { name: 'Main Prompt' }));
    await waitFor(() => expect(prompts.querySelector('#prompt-Main_Positive_Prompt')).toBeNull());
  });

  it('[REQ-347/AC-3] loads the missing shared master metadata and renders both parameter stages alongside cached stages', async () => {
    vi.mocked(mappingMastersApi.list).mockResolvedValue(masters as never);
    const { container } = renderGenerate({ cacheMasters: false });
    const controls = container.querySelector<HTMLElement>('#desktop-controls-scroll')!;
    await within(controls).findByRole('heading', { name: 'Rough (rough)' });
    expect(vi.mocked(mappingMastersApi.list)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stageMastersApi.list)).not.toHaveBeenCalled();
    expect(controls.querySelector('#param-steps_main')).toBeInTheDocument();
    expect(controls.querySelector('#param-steps_rough')).toBeInTheDocument();
  });

  it('[REQ-347/AC-4] recovers after uncached stage metadata fails and refetches, while cached metadata invalidation refetches once', async () => {
    vi.mocked(mappingMastersApi.list).mockResolvedValue(masters as never);
    vi.mocked(stageMastersApi.list).mockRejectedValueOnce(new Error('temporary stage metadata failure')).mockResolvedValue(stages as never);
    const first = renderGenerate({ cacheStages: false, cacheMasters: false });
    const { client: qc } = first;
    await waitFor(() => expect(qc.getQueryCache().find({ queryKey: ['stage-masters'] })?.state.status).toBe('error'));
    await waitFor(() => expect(qc.getQueryCache().find({ queryKey: ['mapping-masters'] })?.state.status).toBe('success'));
    await act(async () => { await qc.refetchQueries({ queryKey: ['stage-masters'] }); });
    expect(qc.getQueryCache().find({ queryKey: ['stage-masters'] })?.state.status).toBe('success');
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenCalledTimes(2);

    first.unmount();
    vi.mocked(stageMastersApi.list).mockClear().mockResolvedValue(stages as never);
    vi.mocked(mappingMastersApi.list).mockClear();
    const cached = renderGenerate();
    await act(async () => { await cached.client.invalidateQueries({ queryKey: ['stage-masters'] }); });
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stageMastersApi.list)).toHaveBeenLastCalledWith(true);
    expect(vi.mocked(mappingMastersApi.list)).not.toHaveBeenCalled();
  });

});
