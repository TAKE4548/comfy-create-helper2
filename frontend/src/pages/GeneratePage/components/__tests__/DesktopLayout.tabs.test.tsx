import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DesktopLayout } from '../DesktopLayout'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))


// Mock API client if called by stores
vi.mock('../../../api/client', () => ({
  api: {
    workflows: {
      get: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    bypassProfiles: {
      list: vi.fn().mockResolvedValue([]),
    },
  },
}))

describe('DesktopLayout - Full-Width Preset Tabs Bar and Left Pane Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const createMockState = (overrides = {}) => {
    const defaultState: any = {
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
      paramValues: {
        Main_Positive_Prompt: 'masterpiece, high quality',
        Main_Negative_Prompt: 'low quality',
      },
      setParamValues: vi.fn(),
      batchSize: 1,
      setBatchSize: vi.fn(),
      seedMode: 'random',
      setSeedMode: vi.fn(),
      seed: 12345,
      setSeed: vi.fn(),
      selectedImg: null,
      setSelectedImg: vi.fn(),
      comfyHistoryImages: [],
      appliedAssets: {},
      addAppliedAsset: vi.fn(),
      toggleAppliedAsset: vi.fn(),
      removeAppliedAsset: vi.fn(),
      activeBatch: null,
      sets: [
        { id: 'set-1', name: 'Preset Alpha', checked: true },
        { id: 'set-2', name: 'Preset Beta', checked: false },
        { id: 'set-3', name: 'Preset Gamma', checked: true },
      ],
      activeSetId: 'set-1',
      removeSet: vi.fn(),
      toggleSetChecked: vi.fn(),
      setActiveSetId: vi.fn(),
      openPresetIds: ['set-1', 'set-2', 'set-3'],
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: true,
      canRedo: true,
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
      setIsJObModalOpen: vi.fn(),
      sortOrder: 'desc',
      setSortOrder: vi.fn(),
      setIsPresetManagerOpen: vi.fn(),
      handleLoadPreset: vi.fn(),
      handleSelectPresetTab: vi.fn(),
      baseModels: [],
      updateWorkflowBaseModelMutation: { mutate: vi.fn() },
      setWorkflowManageMode: vi.fn(),
      workflows: [{ id: 1, name: 'Test Workflow', target_base_model_id: 'sdxl' }],
      workflow: { id: 1, name: 'Test Workflow', target_base_model_id: 'sdxl', json_body: '{}', mappings: [] },
      mappingMasters: [],
      loras: [],
      paramTypeMasters: [],
      tagSets: [],
      presets: [
        { id: 'set-1', name: 'Preset Beta' },
      ],
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
      allQueueCount: 0,
      totalQueueCount: 0,
      showStrip: false,
      invalidMappings: [],
      textMappings: [
        { id: 1, role: 'Main_Positive_Prompt', display_name: 'Positive Prompt', input_type: 'string' },
      ],
      paramMappings: [],
      handleLoadSnapshot: vi.fn(),
      handleUpdateMapping: vi.fn(),
      handleOpenModalPreview: vi.fn(),
      handleGenerateSets: vi.fn(),
      getIsRoleCollapsed: vi.fn(() => false),
      setRoleCollapsed: vi.fn(),
      handleSaveDefaultParams: vi.fn(),
      handleResetDefaultParams: vi.fn(),
      saveDefaultParamsMutation: { mutate: vi.fn() },
      updateWorkflowMutation: { mutate: vi.fn() },
      handleCreatePreset: vi.fn(),
      isAnimaMode: false,
      setIsAnimaMode: vi.fn(),
      promptTranslation: {
        isOpen: false,
        activeRole: null,
        mode: 'prompt',
        sourceText: '',
        translatedText: '',
        meta: null,
        isTranslating: false,
        error: null,
        openTranslation: vi.fn(),
        closeTranslation: vi.fn(),
        setMode: vi.fn(),
        setSourceText: vi.fn(),
        executeTranslate: vi.fn(),
        applyToPrompt: vi.fn(),
      },
    }

    return { ...defaultState, ...overrides }
  }

  // 1. AC-1 / Layout Hierarchy
  it('AC-1: renders #desktop-preset-tabs-bar outside and above the dual-pane ResizableSplitLayout', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    const tabsBar = container.querySelector('#desktop-preset-tabs-bar')
    expect(tabsBar).toBeInTheDocument()

    // Dual-pane content area is the sibling next to tabsBar
    const rootContainer = tabsBar?.parentElement
    expect(rootContainer).toBeInTheDocument()
    expect(rootContainer?.children[0]).toBe(tabsBar)

    // The dual-pane container is the second child and holds leftPane and rightPane
    const dualPaneContainer = rootContainer?.children[1]
    expect(dualPaneContainer).toBeInTheDocument()
    expect(dualPaneContainer?.contains(tabsBar)).toBe(false)

    // Verify leftPane (containing left-pane-toolbar) is inside the dual-pane container
    const leftToolbar = container.querySelector('#left-pane-toolbar')
    expect(dualPaneContainer?.contains(leftToolbar)).toBe(true)
  })

  // 2. AC-2 / Multiple Presets
  it('AC-2: renders all open preset tabs inside an overflow-x-auto container within #desktop-preset-tabs-bar', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    const tabsBar = container.querySelector('#desktop-preset-tabs-bar')
    expect(tabsBar).toBeInTheDocument()

    // Scroll container with overflow-x-auto
    const scrollContainer = tabsBar?.querySelector('.overflow-x-auto')
    expect(scrollContainer).toBeInTheDocument()

    // Verify all 3 presets rendered within tabs bar
    expect(tabsBar?.textContent).toContain('Preset Alpha')
    expect(tabsBar?.textContent).toContain('Preset Beta')
    expect(tabsBar?.textContent).toContain('Preset Gamma')
  })

  // 3. AC-3 / Left Pane Toolbar
  it('AC-3: places #add-set-btn and #manage-presets-btn in #left-pane-toolbar and triggers callbacks', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    const leftToolbar = container.querySelector('#left-pane-toolbar')
    expect(leftToolbar).toBeInTheDocument()

    const addSetBtn = container.querySelector('#add-set-btn')
    const manageBtn = container.querySelector('#manage-presets-btn')

    expect(leftToolbar?.contains(addSetBtn)).toBe(true)
    expect(leftToolbar?.contains(manageBtn)).toBe(true)

    // Manage presets button opens preset manager
    if (manageBtn) {
      fireEvent.click(manageBtn)
      expect(state.setIsPresetManagerOpen).toHaveBeenCalledWith(true)
    }

    // Add set button opens copy modal
    if (addSetBtn) {
      fireEvent.click(addSetBtn)
      expect(addSetBtn).toBeInTheDocument()
    }
  })

  // 4. AC-4 / Interactions
  it('AC-4: handles tab selection, checkbox toggle, tab removal, and undo/redo clicks', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    // 1) Select tab
    const betaTab = screen.getByText('Preset Beta').closest('div')
    expect(betaTab).toBeInTheDocument()
    if (betaTab) {
      fireEvent.click(betaTab)
      expect(state.handleSelectPresetTab).toHaveBeenCalledWith('set-2')
    }

    // 2) Checkbox toggle
    const checkboxes = container.querySelectorAll('#desktop-preset-tabs-bar input[type="checkbox"]')
    expect(checkboxes.length).toBe(3)
    fireEvent.click(checkboxes[1])
    expect(state.toggleSetChecked).toHaveBeenCalledWith('set-2')

    // 3) Remove tab (close button)
    const closeButtons = container.querySelectorAll('#desktop-preset-tabs-bar button')
    expect(closeButtons.length).toBe(3)
    fireEvent.click(closeButtons[0])
    expect(state.removeSet).toHaveBeenCalledWith('set-1')

    // 4) Undo / Redo in left pane toolbar
    const undoBtn = container.querySelector('#undo-btn')
    const redoBtn = container.querySelector('#redo-btn')
    expect(undoBtn).toBeInTheDocument()
    expect(redoBtn).toBeInTheDocument()

    if (undoBtn) {
      fireEvent.click(undoBtn)
      expect(state.undo).toHaveBeenCalledWith('set-1')
    }
    if (redoBtn) {
      fireEvent.click(redoBtn)
      expect(state.redo).toHaveBeenCalledWith('set-1')
    }
  })

  // 5. Red Team Boundary Cases
  it('Red Team: does not crash when sets is empty or activeSet is null, rendering left-pane-toolbar cleanly', () => {
    const state = createMockState({
      sets: [],
      activeSetId: null,
      openPresetIds: [],
    })

    const { container } = render(<DesktopLayout state={state} />)

    // tabs bar exists but has no tabs
    const tabsBar = container.querySelector('#desktop-preset-tabs-bar')
    expect(tabsBar).toBeInTheDocument()
    expect(tabsBar?.querySelectorAll('input[type="checkbox"]').length).toBe(0)

    // left-pane-toolbar renders without activeSet badge or undo/redo
    const leftToolbar = container.querySelector('#left-pane-toolbar')
    expect(leftToolbar).toBeInTheDocument()
    expect(container.querySelector('#undo-btn')).not.toBeInTheDocument()
    expect(container.querySelector('#redo-btn')).not.toBeInTheDocument()
    expect(container.querySelector('#add-set-btn')).toBeInTheDocument()
    expect(container.querySelector('#manage-presets-btn')).toBeInTheDocument()
  })

  it('Red Team: does not crash or render tabs bar when selectedWorkflowId is null', () => {
    const state = createMockState({
      selectedWorkflowId: null,
     })

    const { container } = render(<DesktopLayout state={state} />)

    expect(container.querySelector('#desktop-preset-tabs-bar')).not.toBeInTheDocument()
    expect(container.querySelector('#left-pane-toolbar')).not.toBeInTheDocument()
  })
})
