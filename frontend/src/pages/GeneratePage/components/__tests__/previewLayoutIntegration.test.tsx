import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GenerateParallelPreview } from '../GenerateParallelPreview'
import { DesktopLayout } from '../DesktopLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'
import { cleanupAllTestState } from '../../../../test/utils'

const trialAvailabilityControllers: ReturnType<typeof createTrialAvailabilityController>[] = []

function renderGroupedDesktop(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['stage-masters'], [])
  client.setQueryData(['mapping-masters'], [])
  return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))

// Mock API client
vi.mock('../../../../api/client', () => ({
  api: {
    workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    bypassProfiles: { list: vi.fn().mockResolvedValue([]) },
  },
  bypassProfilesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  workflowsApi: {
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
}))

function setElementSize(element: HTMLElement, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({})
  } as DOMRect)
  act(() => window.dispatchEvent(new Event('resize')))
}

function createDefaultMockState(trialAvailability: any) {
  return {
    trialAvailability,
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
    selectedImg: 'img-res',
    setSelectedImg: vi.fn(),
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
    thumbnailTab: 'history',
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
    selectedIds: new Set<string>(),
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
    displayImages: ['img-res'],
    renderStatusBar: () => null,
    generationSyncIssue: null,
    isAnimaMode: false,
    setIsAnimaMode: vi.fn(),
    promptTranslation: {},
    saveDefaultParamsMutation: { isPending: false },
    updateWorkflowMutation: { mutate: vi.fn() },
    handleSaveDefaultParams: vi.fn(),
    handleResetDefaultParams: vi.fn(),
  }
}

describe('REQ-339 E2E Integration: Dynamic Aspect-Ratio Agnostic Preview & Header Resource Monitor', () => {
  beforeEach(() => {
    cleanupAllTestState()
    vi.clearAllMocks()
    useGenerationStore.setState({
      systemStats: {
        cpu_pct: 30,
        ram_pct: 65,
        gpu_pct: 50,
        vram_pct: 80,
        ram_used_gb: 10.4,
        ram_total_gb: 16,
        vram_used_gb: 9.6,
        vram_total_gb: 12,
      },
    })
  })

  afterEach(() => {
    trialAvailabilityControllers.splice(0).forEach((controller) => controller.dispose())
    cleanupAllTestState()
  })

  it('AC-1..3: displays images at uniform height matching native aspect ratios without distortion', () => {
    const images = ['img-wide', 'img-square', 'img-tall']
    const aspectRatios = {
      'img-wide': 16 / 9, // ~1.778
      'img-square': 1.0,   // 1.0
      'img-tall': 2 / 3,   // ~0.667
    }
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="img-wide"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        aspectRatios={aspectRatios}
      />
    )
    const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
    setElementSize(root, 1200, 600)
    const tiles = container.querySelectorAll('[data-generate-reel-tile="true"]')
    expect(tiles).toHaveLength(3)
  })

  it('AC-4: recalculates visible items dynamically upon resizing the container', () => {
    const images = ['p1', 'p2', 'p3', 'p4']
    const aspectRatios = { p1: 2 / 3, p2: 2 / 3, p3: 2 / 3, p4: 2 / 3 }
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="p1"
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        aspectRatios={aspectRatios}
      />
    )
    const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
    setElementSize(root, 800, 600)
    const tiles = container.querySelectorAll('[data-generate-reel-tile="true"]')
    expect(tiles).toHaveLength(4)
  })

  it('AC-5 & AC-8: allows selecting cards cleanly in continuous reel', () => {
    const images = ['a', 'b', 'c', 'd']
    const aspectRatios = { a: 1.0, b: 1.0, c: 1.0, d: 1.0 }
    const onSelect = vi.fn()
    const { container } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="a"
        onSelect={onSelect}
        onOpen={vi.fn()}
        aspectRatios={aspectRatios}
      />
    )
    const tiles = container.querySelectorAll('[data-generate-reel-tile="true"]')
    expect(tiles).toHaveLength(4)

    const btnC = container.querySelector('[aria-label="画像 c を開く"]') as HTMLButtonElement
    expect(btnC).not.toBeNull()
    fireEvent.click(btnC)
    expect(onSelect).toHaveBeenCalledWith('c')
  })

  it('[REQ-383/AC-7] centers main preview when clicking history thumbnail in normal mode', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const setSelectedImg = vi.fn()
    const state = {
      ...createDefaultMockState(trialAvailability),
      displayImages: ['img-0', 'img-1', 'img-2'],
      sortedDisplayImages: ['img-0', 'img-1', 'img-2'],
      selectedImg: 'img-0',
      showStrip: true,
      setSelectedImg,
    }
    const { container } = renderGroupedDesktop(<DesktopLayout state={state as any} />)

    // Expand history
    const historyToggle = container.querySelector('[data-generate-reel-history-toggle="true"]') as HTMLButtonElement
    expect(historyToggle).not.toBeNull()
    fireEvent.click(historyToggle)

    // History thumbnail clicked in normal mode
    const thumb1 = container.querySelector('#thumb-1') as HTMLButtonElement
    expect(thumb1).not.toBeNull()
    fireEvent.click(thumb1)

    // setSelectedImg called with img-1
    expect(setSelectedImg).toHaveBeenCalledWith('img-1')
  })

  it('[REQ-383/AC-8] keeps scrollLeft unchanged during multi-select thumbnail clicks', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const handleItemClick = vi.fn()
    const setSelectedImg = vi.fn()
    const state = {
      ...createDefaultMockState(trialAvailability),
      displayImages: ['img-0', 'img-1', 'img-2'],
      sortedDisplayImages: ['img-0', 'img-1', 'img-2'],
      selectedImg: 'img-0',
      showStrip: true,
      isMultiSelectMode: true,
      handleItemClick,
      setSelectedImg,
    }
    const { container } = renderGroupedDesktop(<DesktopLayout state={state as any} />)

    // Expand history
    const historyToggle = container.querySelector('[data-generate-reel-history-toggle="true"]') as HTMLButtonElement
    fireEvent.click(historyToggle)

    const thumb1 = container.querySelector('#thumb-1') as HTMLButtonElement
    expect(thumb1).not.toBeNull()
    fireEvent.click(thumb1)

    // handleItemClick called, but setSelectedImg NOT called (scroll unaffected)
    expect(handleItemClick).toHaveBeenCalledWith('img-1', expect.anything())
    expect(setSelectedImg).not.toHaveBeenCalled()
  })

  it('[REQ-383/AC-9] boundary close button collapses history and restores height', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const state = {
      ...createDefaultMockState(trialAvailability),
      displayImages: ['img-0', 'img-1'],
      showStrip: true,
    }
    const { container } = renderGroupedDesktop(<DesktopLayout state={state as any} />)

    // Initially history is collapsed
    expect(container.querySelector('[data-generate-reel-history-pane="true"]')).toBeNull()

    // Expand history via preview toolbar
    const historyToggle = container.querySelector('[data-generate-reel-history-toggle="true"]') as HTMLButtonElement
    fireEvent.click(historyToggle)

    // History pane & boundary close button are now visible
    const historyPane = container.querySelector('[data-generate-reel-history-pane="true"]')
    const closeBtn = container.querySelector('[data-generate-reel-history-close="true"]') as HTMLButtonElement
    expect(historyPane).not.toBeNull()
    expect(closeBtn).not.toBeNull()

    // Click local close button
    fireEvent.click(closeBtn)

    // History pane is closed and unmounted, preview takes full height
    expect(container.querySelector('[data-generate-reel-history-pane="true"]')).toBeNull()
    expect(container.querySelector('[data-generate-reel-history-close="true"]')).toBeNull()
    expect(container.querySelector('.bg-grid')).not.toBeNull()
  })

  it('[REQ-383/AC-10] bidirectional auto-follow sync between reel toolbar and history pane', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const handleToggleAutoFollow = vi.fn()
    const state = {
      ...createDefaultMockState(trialAvailability),
      displayImages: ['img-0', 'img-1'],
      showStrip: true,
      previewAutoFollow: false,
      handleToggleAutoFollow,
    }
    const { container } = renderGroupedDesktop(<DesktopLayout state={state as any} />)

    const autoFollowBtn = container.querySelector('[data-generate-reel-auto-follow="true"]') as HTMLButtonElement
    expect(autoFollowBtn).not.toBeNull()
    expect(autoFollowBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(autoFollowBtn)
    expect(handleToggleAutoFollow).toHaveBeenCalled()
  })

  it('[REQ-383/AC-11] bidirectional session filter sync between reel toolbar and history pane', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const setFilterOwnSession = vi.fn()
    const state = {
      ...createDefaultMockState(trialAvailability),
      displayImages: ['img-0', 'img-1'],
      showStrip: true,
      filterOwnSession: false,
      setFilterOwnSession,
    }
    const { container } = renderGroupedDesktop(<DesktopLayout state={state as any} />)

    const sessionFilterBtn = container.querySelector('[data-generate-reel-session-filter="true"]') as HTMLButtonElement
    expect(sessionFilterBtn).not.toBeNull()
    expect(sessionFilterBtn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(sessionFilterBtn)
    expect(setFilterOwnSession).toHaveBeenCalledWith(true)
  })

  it('AC-6 & AC-7: relocates resource monitor to desktop global header with zero preview occlusion', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const mockState = createDefaultMockState(trialAvailability)
    const { container } = renderGroupedDesktop(<DesktopLayout state={mockState as any} />)

    // 1. Header contains the resource stats
    const headerTitle = screen.getByText('Generate')
    const header = headerTitle.closest('.bg-surface')
    expect(header).not.toBeNull()
    expect(header).toHaveTextContent('CPU')
    expect(header).toHaveTextContent('RAM')
    expect(header).toHaveTextContent('GPU')
    expect(header).toHaveTextContent('VRAM')

    // 2. Main preview canvas (.bg-grid) has NO floating HUD overlay
    const previewGrid = container.querySelector('.bg-grid')
    expect(previewGrid).not.toBeNull()
    expect(previewGrid?.querySelector('.bg-\\[\\#18181C\\]\\/80')).toBeNull()
  })
})
