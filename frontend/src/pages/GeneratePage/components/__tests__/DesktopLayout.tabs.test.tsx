import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DesktopLayout } from '../DesktopLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { LS_KEYS } from '../../../../utils/localStorageKeys'

const mainSplitBounds = vi.hoisted(() => ({ minSize: null as number | null | undefined, maxSize: null as number | null | undefined }))

vi.mock('../../../../components/layout/ResizableSplitLayout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../components/layout/ResizableSplitLayout')>()
  return {
    ...actual,
    ResizableSplitLayout: (props: Parameters<typeof actual.ResizableSplitLayout>[0]) => {
      if (props.direction === 'horizontal' && props.storageKey === LS_KEYS.LAYOUT_MAIN_SPLIT) {
        mainSplitBounds.minSize = props.minSize
        mainSplitBounds.maxSize = props.maxSize
      }
      return React.createElement(actual.ResizableSplitLayout, props)
    },
  }
})

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

describe('DesktopLayout - Global Header, Full-Width Preset Tabs Bar, and Left Pane Toolbar', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mainSplitBounds.minSize = null
    mainSplitBounds.maxSize = null
    useGenerationStore.setState({ roleTextModes: {}, generationStartTime: null })
  })

  it('clamps the main pane to 330px on tablet resize and restores desktop bounds without unmounting controls', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    const { container } = render(<DesktopLayout state={createMockState()} />)
    expect(mainSplitBounds).toEqual({ minSize: 380, maxSize: 700 })
    const savedSplit = localStorage.getItem(LS_KEYS.LAYOUT_MAIN_SPLIT)

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    fireEvent(window, new Event('resize'))
    expect(mainSplitBounds).toEqual({ minSize: 330, maxSize: 330 })
    expect(container.querySelector('#left-pane-toolbar')).toBeInTheDocument()
    expect(container.querySelector('#desktop-controls-scroll')).toBeInTheDocument()

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    fireEvent(window, new Event('resize'))
    expect(mainSplitBounds).toEqual({ minSize: 380, maxSize: 700 })
    expect(localStorage.getItem(LS_KEYS.LAYOUT_MAIN_SPLIT)).toBe(savedSplit)
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

  // 1. AC-1 & AC-2 / Layout Hierarchy
  it('AC-1 & AC-2: renders Global Header at top level before #desktop-preset-tabs-bar and ResizableSplitLayout', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    const root = container.firstElementChild as HTMLElement
    expect(root).toBeInTheDocument()
    const children = Array.from(root.children)

    // 1st child is Global Header spanning full width
    const globalHeader = children[0] as HTMLElement
    expect(globalHeader).toBeInTheDocument()
    expect(globalHeader.querySelector('#workflow-select')).toBeInTheDocument()
    expect(globalHeader.querySelector('#workflow-actions-btn')).toBeInTheDocument()
    expect(globalHeader.querySelector('#header-kebab-btn')).toBeInTheDocument()
    expect(globalHeader).toHaveClass('w-full')

    // 2nd child is #desktop-preset-tabs-bar
    const tabsBar = children[1] as HTMLElement
    expect(tabsBar).toHaveAttribute('id', 'desktop-preset-tabs-bar')
    expect(tabsBar).toHaveClass('w-full')

    // 3rd child is Dual-pane container holding ResizableSplitLayout
    const dualPaneContainer = children[2] as HTMLElement
    expect(dualPaneContainer).toBeInTheDocument()
    expect(dualPaneContainer.contains(tabsBar)).toBe(false)
    expect(dualPaneContainer.contains(globalHeader)).toBe(false)

    // Verify left-pane-toolbar is inside dualPaneContainer
    const leftToolbar = container.querySelector('#left-pane-toolbar')
    expect(dualPaneContainer.contains(leftToolbar)).toBe(true)
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

  // 3. AC-3 & AC-4 / Left Pane Toolbar Order and Proximity
  it('AC-3 & AC-4: renders #left-pane-toolbar with justify-start in exact order: name badge, undo/redo, add-set, manage', () => {
    const state = createMockState()
    const { container } = render(<DesktopLayout state={state} />)

    const leftToolbar = container.querySelector('#left-pane-toolbar') as HTMLElement
    expect(leftToolbar).toBeInTheDocument()
    expect(leftToolbar).toHaveClass('justify-start')
    expect(leftToolbar).toHaveClass('flex-nowrap')
    expect(leftToolbar).not.toHaveClass('justify-between')

    // Check sequential order of children inside left-pane-toolbar:
    // 0: Preset Name Badge
    // 1: Undo/Redo container
    // 2: #add-set-btn
    // 3: #manage-presets-btn
    const elements = Array.from(leftToolbar.children)
    expect(elements[0].textContent).toContain('Preset Alpha')
    expect(elements[1].querySelector('#undo-btn')).toBeInTheDocument()
    expect(elements[2]).toHaveAttribute('id', 'add-set-btn')
    expect(elements[3]).toHaveAttribute('id', 'manage-presets-btn')

    // Callback triggers
    const addSetBtn = container.querySelector('#add-set-btn')
    const manageBtn = container.querySelector('#manage-presets-btn')
    expect(manageBtn).toHaveTextContent('管理')
    expect(screen.getByRole('button', { name: '管理' })).toBe(manageBtn)
    expect(manageBtn?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    if (manageBtn) {
      fireEvent.click(manageBtn)
      expect(state.setIsPresetManagerOpen).toHaveBeenCalledWith(true)
    }
    if (addSetBtn) {
      fireEvent.click(addSetBtn)
      expect(addSetBtn).toBeInTheDocument()
    }
  })

  // 4. AC-5 / Interactions
  it('AC-5: handles tab selection, checkbox toggle, tab removal, and undo/redo clicks', () => {
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
    expect(closeButtons[0]).toHaveAttribute('title', 'タブを閉じる (DBからは削除されません)')
    expect(closeButtons[0]).toHaveAttribute('aria-label', 'タブを閉じる (DBからは削除されません)')
    expect(closeButtons[0].querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(closeButtons[0])
    expect(state.removeSet).toHaveBeenCalledWith('set-1')

    // 4) Undo / Redo in left pane toolbar
    const undoBtn = container.querySelector('#undo-btn')
    const redoBtn = container.querySelector('#redo-btn')
    expect(undoBtn).toBeInTheDocument()
    expect(redoBtn).toBeInTheDocument()
    expect(undoBtn).toHaveAttribute('title', 'Undo (Ctrl+Z)')
    expect(undoBtn).toHaveAttribute('aria-label', 'Undo (Ctrl+Z)')
    expect(undoBtn?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(redoBtn).toHaveAttribute('title', 'Redo (Ctrl+Y)')
    expect(redoBtn).toHaveAttribute('aria-label', 'Redo (Ctrl+Y)')
    expect(redoBtn?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

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

  it('Red Team: does not crash or render tabs bar when selectedWorkflowId is null, but renders Global Header', () => {
    const state = createMockState({
      selectedWorkflowId: null,
    })

    const { container } = render(<DesktopLayout state={state} />)

    // Global Header still renders at root
    expect(container.querySelector('#workflow-select')).toBeInTheDocument()
    expect(container.querySelector('#desktop-preset-tabs-bar')).not.toBeInTheDocument()
    expect(container.querySelector('#left-pane-toolbar')).not.toBeInTheDocument()
  })

  it('AC-4: initial Anima mode displays TagChipEditor in chip mode, persists text mode across preset tab switches after manual toggle', () => {
    const state = createMockState({
      isAnimaMode: true,
      activeSetId: 'set-1',
    })

    const { rerender } = render(<DesktopLayout state={state} />)

    // 1. Initial render with Anima mode -> Chip mode by default
    expect(screen.getByText('Chips Mode')).toBeInTheDocument()
    expect(screen.getByText('テキスト入力モード切替')).toBeInTheDocument()

    // 2. User manually switches to Text mode
    fireEvent.click(screen.getByText('テキスト入力モード切替'))

    // Text mode is now active
    expect(screen.getByText('Text Mode (Comma separated)')).toBeInTheDocument()
    expect(screen.getByText('チップモード切替')).toBeInTheDocument()
    expect(useGenerationStore.getState().roleTextModes?.Main_Positive_Prompt).toBe(true)

    // 3. Switch to another preset tab ('set-2') -> TagChipEditor remounts due to key change
    rerender(<DesktopLayout state={{ ...state, activeSetId: 'set-2' }} />)

    // Text mode should be preserved (no regression / ancestor reverting)
    expect(screen.getByText('Text Mode (Comma separated)')).toBeInTheDocument()
    expect(screen.getByText('チップモード切替')).toBeInTheDocument()

    // 4. Switch back to 'set-1' -> TagChipEditor remounts again
    rerender(<DesktopLayout state={{ ...state, activeSetId: 'set-1' }} />)

    // Text mode is still preserved
    expect(screen.getByText('Text Mode (Comma separated)')).toBeInTheDocument()
    expect(screen.getByText('チップモード切替')).toBeInTheDocument()
  })

  it('AC-16–18: keeps prompt and controls in independent scroll panes and preserves prompt draft across preset tabs', () => {
    const state = createMockState()
    const { container, rerender } = render(<DesktopLayout state={state} />)

    const promptPane = container.querySelector('#desktop-prompt-scroll') as HTMLElement
    const controlsPane = container.querySelector('#desktop-controls-scroll') as HTMLElement
    expect(promptPane).toHaveClass('overflow-y-auto')
    expect(controlsPane).toHaveClass('overflow-y-auto')
    expect(screen.getAllByRole('separator').some((separator) => separator.getAttribute('aria-orientation') === 'horizontal')).toBe(true)
    expect(localStorage.getItem('prompt-surgeon-generate-left-ratio-v1')).toBe(JSON.stringify({ version: 1, ratio: 0.55 }))

    rerender(<DesktopLayout state={{ ...state, activeSetId: 'set-2' }} />)
    expect(container.querySelector('#prompt-Main_Positive_Prompt')).toBeInTheDocument()
    expect(container.textContent).toContain('Positive Prompt')
    expect(container.querySelector('#desktop-prompt-scroll')).toBeInTheDocument()
    expect(container.querySelector('#desktop-controls-scroll')).toBeInTheDocument()
  })

  it('shows a seconds-based remaining ETA when the generation start and progress are known', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'))
    useGenerationStore.setState({ generationStartTime: Date.now() - 20_000 })
    const state = createMockState({ isGeneratingHere: true, progress: { percentage: 50 } })

    render(<DesktopLayout state={state} />)

    expect(screen.getByText('経過時間: 20秒')).toBeInTheDocument()
    expect(screen.getByText('残り約: 20秒')).toBeInTheDocument()
  })
})
