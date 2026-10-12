import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GenerateParallelPreview } from '../pages/GeneratePage/components/GenerateParallelPreview'
import { DesktopLayout } from '../pages/GeneratePage/components/DesktopLayout'
import { useGenerationStore } from '../store/useGenerationStore'
import { createTrialAvailabilityController } from '../services/trialImageAvailability'

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
vi.mock('../api/client', () => ({
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

describe('REQ-339 E2E Integration: Dynamic Aspect-Ratio Agnostic Preview & Header Resource Monitor', () => {
  beforeEach(() => {
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

  afterEach(() => trialAvailabilityControllers.splice(0).forEach((controller) => controller.dispose()))

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
    // At container height 600px:
    // img-wide width = 600 * (16/9) = ~1066.7px
    // img-square width = 600 * 1.0 = 600px
    // img-tall width = 600 * (2/3) = 400px

    // At width 1200px: img-wide takes ~1067px, + 12px + 600px = 1679px > 1200px.
    // Only 1 image (img-wide) fits in page 0.
    setElementSize(root, 1200, 600)
    expect(root.querySelectorAll('img')).toHaveLength(1)

    // With 1800px width: 1067 + 12 + 600 = 1679 <= 1800 < 2091. Two images fit!
    setElementSize(root, 1800, 600)
    const twoImages = root.querySelectorAll('img')
    expect(twoImages).toHaveLength(2)

    // Both cards should share the same height (600px)
    const card1 = twoImages[0].closest('.rounded-lg') as HTMLElement
    const card2 = twoImages[1].closest('.rounded-lg') as HTMLElement
    expect(card1.style.height).toBe('600px')
    expect(card2.style.height).toBe('600px')
    // Card 1 width reflects 16:9 (~1067px), Card 2 reflects 1:1 (600px)
    expect(parseFloat(card1.style.width)).toBeCloseTo(600 * (16 / 9), 0)
    expect(parseFloat(card2.style.width)).toBeCloseTo(600, 0)

    // With 2200px width: 1067 + 12 + 600 + 12 + 400 = 2091 <= 2200. All 3 images fit!
    setElementSize(root, 2200, 600)
    expect(root.querySelectorAll('img')).toHaveLength(3)
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

    // Height 600, Width 811 -> 1 image (each 2:3 card is 400px wide, 400*2+12 = 812)
    setElementSize(root, 811, 600)
    expect(root.querySelectorAll('img')).toHaveLength(1)

    // Expand width to 812 -> 2 images
    setElementSize(root, 812, 600)
    expect(root.querySelectorAll('img')).toHaveLength(2)

    // Expand width to 1224 -> 3 images
    setElementSize(root, 1224, 600)
    expect(root.querySelectorAll('img')).toHaveLength(3)

    // Contract width back to 812 -> shrinks back to 2 images
    setElementSize(root, 812, 600)
    expect(root.querySelectorAll('img')).toHaveLength(2)
  })

  it('AC-5 & AC-8: allows paginating overflow items and selecting cards cleanly', () => {
    const images = ['a', 'b', 'c', 'd']
    const aspectRatios = { a: 1.0, b: 1.0, c: 1.0, d: 1.0 }
    const onSelect = vi.fn()
    const { container, rerender } = render(
      <GenerateParallelPreview
        images={images}
        selectedImage="a"
        onSelect={onSelect}
        onOpen={vi.fn()}
        aspectRatios={aspectRatios}
      />
    )
    const root = container.querySelector('[data-testid="generate-parallel-preview"]') as HTMLElement
    // At H=500, W=1100: two 1:1 images take 500*2 + 12 = 1012px <= 1100px.
    setElementSize(root, 1100, 500)
    expect(root.querySelectorAll('img')).toHaveLength(2)
    expect(Array.from(root.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual(['a', 'b'])

    // Next page
    const nextBtn = root.querySelector('[aria-label="次の画像ページ"]') as HTMLElement
    expect(nextBtn).toBeInTheDocument()
    fireEvent.click(nextBtn)
    expect(onSelect).toHaveBeenCalledWith('c')

    // Rerender with 'c' selected -> page 2 displays ['c', 'd']
    rerender(
      <GenerateParallelPreview
        images={images}
        selectedImage="c"
        onSelect={onSelect}
        onOpen={vi.fn()}
        aspectRatios={aspectRatios}
      />
    )
    expect(Array.from(root.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual(['c', 'd'])

    // Click 'd' to select
    const btnD = root.querySelector('[aria-label="画像 d を開く"]') as HTMLElement
    fireEvent.click(btnD)
    expect(onSelect).toHaveBeenLastCalledWith('d')
  })

  it('AC-6 & AC-7: relocates resource monitor to desktop global header with zero preview occlusion', () => {
    const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' }))
    trialAvailabilityControllers.push(trialAvailability)
    const mockState: any = {
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

    const { container } = renderGroupedDesktop(<DesktopLayout state={mockState} />)

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
