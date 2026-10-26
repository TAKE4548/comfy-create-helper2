import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DesktopLayout } from '../DesktopLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))

// Mock API client
vi.mock('../../../api/client', () => ({
  api: {
    workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    bypassProfiles: { list: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../../../api/domains/workflows', () => ({
  bypassProfilesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../../api/domains/stageMasters', () => ({
  stageMastersApi: { list: vi.fn().mockResolvedValue([
    { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 0 },
    { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: [], previous_suffixes: [], is_builtin: true, is_active: true, sort_order: 1 },
  ]) },
}))

describe('DesktopLayout - REQ-339 Resource Monitor Relocation', () => {
  const availabilityControllers = new Set<{ dispose: () => void }>()
  const createAvailabilityController = () => {
    const controller = createTrialAvailabilityController(async () => ({ availability: 'present' as const }))
    availabilityControllers.add(controller)
    return controller
  }

  afterEach(() => {
    availabilityControllers.forEach((controller) => controller.dispose())
    availabilityControllers.clear()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useGenerationStore.setState({
      systemStats: {
        cpu_pct: 25,
        ram_pct: 60,
        gpu_pct: 45,
        vram_pct: 70,
        ram_used_gb: 9.6,
        ram_total_gb: 16,
        vram_used_gb: 8.4,
        vram_total_gb: 12,
      },
    })
  })

  const createMockState = () => ({
    isConnected: true,
    isGenerating: false,
    progress: 0,
    previewImage: null,
    activeClientId: 'client-1',
    clientId: 'client-1',
    filterOwnSession: false,
    setFilterOwnSession: vi.fn(),
    selectedWorkflowId: 1,
    setSelectedWorkflowId: vi.fn(),
    paramValues: {},
    setParamValues: vi.fn(),
    batchSize: 1,
    setBatchSize: vi.fn(),
    seedMode: 'random',
    setSeedMode: vi.fn(),
    seed: 12345,
    setSeed: vi.fn(),
    selectedImg: null,
    setSelectedImg: vi.fn(),
    trialAvailability: createAvailabilityController(),
    comfyHistoryImages: [],
    appliedAssets: {},
    addAppliedAsset: vi.fn(),
    toggleAppliedAsset: vi.fn(),
    removeAppliedAsset: vi.fn(),
    activeBatch: null,
    sets: [{ id: 'set-1', name: 'Preset Alpha', checked: true }],
    activeSetId: 'set-1',
    removeSet: vi.fn(),
    toggleSetChecked: vi.fn(),
    setActiveSetId: vi.fn(),
    openPresetIds: ['set-1'],
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    activePromptTab: 'Main_Positive_Prompt',
    setActivePromptTab: vi.fn(),
    setRescanOpen: vi.fn(),
    selectedMasters: {},
    setSelectedMasters: vi.fn(),
    openAddAssetRole: null,
    setOpenAddAssetRole: vi.fn(),
    isSettingsOpen: false,
    setIsSettingsOpen: vi.fn(),
    localComfyUrl: 'http://localhost:8188',
    setLocalComfyUrl: vi.fn(),
    setComfyUrl: vi.fn(),
    thumbnailTab: 'images',
    setThumbnailTab: vi.fn(),
    setModalPreviewIndex: vi.fn(),
    setIsModalPreviewOpen: vi.fn(),
    setIsJobModalOpen: vi.fn(),
    sortOrder: 'desc',
    setSortOrder: vi.fn(),
    setIsPresetManagerOpen: vi.fn(),
    handleLoadPreset: vi.fn(),
    handleSelectPresetTab: vi.fn(),
    baseModels: [],
    updateWorkflowBaseModelMutation: { mutate: vi.fn() },
    setWorkflowManageMode: vi.fn(),
    workflows: [{ id: 1, name: 'Workflow A', target_base_model_id: 'sdxl' }],
    workflow: { id: 1, name: 'Workflow A', target_base_model_id: 'sdxl', json_body: '{}', mappings: [] },
    mappingMasters: [],
    loras: [],
    paramTypeMasters: [],
    tagSets: [],
    presets: [],
    comfyObjectInfo: null,
    sortedDisplayImages: [],
    getSetNameForImage: vi.fn(),
    sortedSnapshots: [],
    isMultiSelectMode: false,
    selectedIds: new Set(),
    handleItemClick: vi.fn(),
    getLongPressHandlers: vi.fn(() => ({})),
    isSelected: vi.fn(() => false),
    exitMultiSelectMode: vi.fn(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    setIsSaveModalOpen: vi.fn(),
    auditOpen: false,
    setAuditOpen: vi.fn(),
    auditIntent: '',
    setAuditIntent: vi.fn(),
    auditTypes: [],
    setAuditTypes: vi.fn(),
    auditResult: null,
    auditStatus: 'idle',
    runAudit: { mutate: vi.fn() },
    dragOver: false,
    handleFileSelect: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    isGeneratingHere: false,
    isOtherSessionGenerating: false,
    generationStartTime: null,
    etaText: '未取得',
    actionQueueCount: 0,
    allQueueCount: 0,
    totalQueueCount: 0,
    showStrip: true,
    invalidMappings: [],
    textMappings: [],
    paramMappings: [],
    handleLoadSnapshot: vi.fn(),
    handleUpdateMapping: vi.fn(),
    handleGenerateSets: vi.fn(),
    handleOpenModalPreview: vi.fn(),
    getIsRoleCollapsed: vi.fn(() => false),
    setRoleCollapsed: vi.fn(),
    displayImages: [],
    renderStatusBar: () => null,
    generationSyncIssue: null,
    isAnimaMode: false,
    setIsAnimaMode: vi.fn(),
    promptTranslation: {},
    saveDefaultParamsMutation: { isPending: false },
    updateWorkflowMutation: { mutate: vi.fn() },
    handleSaveDefaultParams: vi.fn(),
    handleResetDefaultParams: vi.fn(),
  })

  const renderWithQueryClient = (ui: React.ReactElement) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  }

  it('renders PageHeader with left clustering and ResourceHoverMonitor, removing preview HUD', () => {
    const state = createMockState()
    const { container } = renderWithQueryClient(<DesktopLayout state={state as any} />)

    // PageHeader contains Generate title
    const headerTitle = screen.getByText('Generate')
    expect(headerTitle).toBeInTheDocument()

    // Header container contains resource chips via ResourceHoverMonitor
    const header = headerTitle.closest('.bg-surface')
    expect(header).not.toBeNull()
    expect(screen.getByTestId('resource-hover-monitor')).toBeInTheDocument()
    expect(header).toHaveTextContent('CPU')
    expect(header).toHaveTextContent('RAM')
    expect(header).toHaveTextContent('GPU')
    expect(header).toHaveTextContent('VRAM')

    // AC-2: Left clustering elements present in header
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'workflow-select')
    expect(screen.getByRole('button', { name: 'ワークフロー設定' })).toBeInTheDocument()
    expect(screen.getByText('Anima特化')).toBeInTheDocument()
    expect(container.querySelector('#header-undo-btn')).toBeInTheDocument()
    expect(container.querySelector('#header-redo-btn')).toBeInTheDocument()

    // AC-5: No direct ComfyUI URL input in header
    expect(screen.queryByLabelText('ComfyUI URL（本体設定）')).toBeNull()
    expect(screen.queryByPlaceholderText('http://localhost:8188')).toBeNull()

    // Preview area (.bg-grid) does NOT contain absolute HUD overlay
    const previewGrid = container.querySelector('.bg-grid')
    expect(previewGrid).not.toBeNull()
    expect(previewGrid?.querySelector('.bg-\\[\\#18181C\\]\\/80')).toBeNull()
  })

  it('opens WorkflowActionsMenu and executes actions on click (AC-6)', () => {
    const handleSaveDefaultParams = vi.fn()
    const handleResetDefaultParams = vi.fn()
    const setWorkflowManageMode = vi.fn()
    const setRescanOpen = vi.fn()
    const mutateBaseModel = vi.fn()

    const state = createMockState()
    state.handleSaveDefaultParams = handleSaveDefaultParams
    state.handleResetDefaultParams = handleResetDefaultParams
    state.setWorkflowManageMode = setWorkflowManageMode
    state.setRescanOpen = setRescanOpen
    state.updateWorkflowBaseModelMutation = { mutate: mutateBaseModel } as any
    state.baseModels = [{ id: 10, name: 'SDXL 1.0' }] as any

    renderWithQueryClient(<DesktopLayout state={state as any} />)

    const menuBtn = screen.getByRole('button', { name: 'ワークフロー設定' })
    fireEvent.click(menuBtn)

    // Dropdown menu is open
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument()

    // Test Save Defaults
    const saveBtn = screen.getByRole('button', { name: 'デフォルト保存' })
    fireEvent.click(saveBtn)
    expect(handleSaveDefaultParams).toHaveBeenCalledTimes(1)

    // Reopen menu for next action
    fireEvent.click(menuBtn)
    const resetBtn = screen.getByRole('button', { name: 'リセット' })
    fireEvent.click(resetBtn)
    expect(handleResetDefaultParams).toHaveBeenCalledTimes(1)

    // Reopen menu for rename
    fireEvent.click(menuBtn)
    const renameBtn = screen.getByRole('button', { name: '名前を変更' })
    fireEvent.click(renameBtn)
    expect(setWorkflowManageMode).toHaveBeenCalledWith('rename')

    // Reopen menu for duplicate
    fireEvent.click(menuBtn)
    const copyBtn = screen.getByRole('button', { name: '複製' })
    fireEvent.click(copyBtn)
    expect(setWorkflowManageMode).toHaveBeenCalledWith('copy')

    // Reopen menu for rescan
    fireEvent.click(menuBtn)
    const rescanBtn = screen.getByRole('button', { name: 'ノード再スキャン' })
    fireEvent.click(rescanBtn)
    expect(setRescanOpen).toHaveBeenCalledWith(true)

    // Reopen menu for base model update
    fireEvent.click(menuBtn)
    const baseModelSelect = screen.getByLabelText('ベースモデル')
    fireEvent.change(baseModelSelect, { target: { value: '10' } })
    expect(mutateBaseModel).toHaveBeenCalledWith({ id: 1, target_base_model_id: 10 })
  })

  it('keeps prompt and controls in independent stage scroll roots and groups prompts by stage', async () => {
    const state = createMockState()
    useGenerationStore.setState({ roleTextModes: { Rough_Positive_Prompt: true } } as any)
    state.paramValues = {
      Main_Positive_Prompt: 'main original',
      Rough_Positive_Prompt: '',
    }
    state.mappingMasters = [{
      id: 7, group_id: null, base_key: 'prompt', name: 'Prompt', param_name: 'text', input_type: 'textarea',
      expected_class_types: null, base_title_patterns: null, sort_order: 0,
      variants: [
        { id: 71, master_id: 7, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Main_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
        { id: 72, master_id: 7, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'Rough_Positive_Prompt', extra_title_patterns: null, is_enabled: true },
      ],
    }] as any
    state.textMappings = [
      { id: 11, master_id: 7, variant_id: 71, node_id: '1', role: 'Main_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Main Prompt' },
      { id: 12, master_id: 7, variant_id: 72, node_id: '2', role: 'Rough_Positive_Prompt', param_name: 'text', input_type: 'textarea', display_name: 'Rough Prompt' },
    ] as any

    const { container } = renderWithQueryClient(<DesktopLayout state={state as any} />)
    const promptRoot = container.querySelector('#desktop-prompt-scroll')
    const controlsRoot = container.querySelector('#desktop-controls-scroll')
    expect(promptRoot).toHaveAttribute('data-stage-scroll-root', '')
    expect(promptRoot).toHaveClass('stage-input-scroll-root')
    expect(controlsRoot).toHaveAttribute('data-stage-scroll-root', '')
    expect(controlsRoot).toHaveClass('stage-input-scroll-root')
    expect(promptRoot).not.toBe(controlsRoot)
    expect(controlsRoot?.querySelector('.rounded-lg.border')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Main (main)' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Rough (rough)' })).toBeInTheDocument()
    expect(container.querySelectorAll('.stage-input-group')).toHaveLength(2)

    const roughInput = container.querySelector<HTMLTextAreaElement>('#prompt-Rough_Positive_Prompt textarea')
    expect(roughInput).not.toBeNull()
    fireEvent.change(roughInput!, { target: { value: 'rough edited' } })
    expect(state.setParamValues).toHaveBeenCalledWith({
      Main_Positive_Prompt: 'main original',
      Rough_Positive_Prompt: 'rough edited',
    })
  })

  it('[REQ-383/AC-12] clicking tile in desktop preview invokes onOpenModal', () => {
    const state = createMockState()
    state.displayImages = ['img-1', 'img-2']
    state.selectedImg = 'img-1'
    const { container } = renderWithQueryClient(<DesktopLayout state={state as any} />)

    const btn = container.querySelector('[aria-label="画像 img-1 を開く"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    fireEvent.click(btn)

    expect(state.setSelectedImg).toHaveBeenCalledWith('img-1')
    expect(state.handleOpenModalPreview).toHaveBeenCalled()
  })

  it('[REQ-383/AC-13] preserves history bulk actions and snapshot tab switching in desktop layout', () => {
    const state = createMockState()
    state.displayImages = ['img-1', 'img-2']
    state.showStrip = true
    state.isMultiSelectMode = true
    state.selectedIds = new Set(['img-1'])

    const { container } = renderWithQueryClient(<DesktopLayout state={state as any} />)

    // Expand history
    const historyToggle = container.querySelector('[data-generate-reel-history-toggle="true"]') as HTMLButtonElement
    expect(historyToggle).not.toBeNull()
    fireEvent.click(historyToggle)

    // Verify history pane is visible
    const historyPane = container.querySelector('[data-generate-reel-history-pane="true"]')
    expect(historyPane).not.toBeNull()

    // Test snapshot tab switching
    const snapshotsTab = screen.getByRole('button', { name: /スナップショット/ })
    fireEvent.click(snapshotsTab)
    expect(state.setThumbnailTab).toHaveBeenCalledWith('snapshots')

    // Test save snapshot button in action bar
    const saveBtn = container.querySelector('#save-snapshot-btn') as HTMLButtonElement
    expect(saveBtn).not.toBeNull()
    expect(saveBtn.disabled).toBe(false)
    fireEvent.click(saveBtn)
    expect(state.setIsSaveModalOpen).toHaveBeenCalledWith(true)
  })
})
