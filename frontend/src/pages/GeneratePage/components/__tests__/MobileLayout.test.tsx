import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MobileLayout } from '../MobileLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { createTrialAvailabilityController } from '../../../../services/trialImageAvailability'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))

// Mock lucide-react icons if necessary (lucide-react works normally in tests)

describe('MobileLayout - TagChipEditor Integration', () => {
  const availabilityControllers = new Set<{ dispose: () => void }>()
  const createAvailabilityController = () => {
    const controller = createTrialAvailabilityController(async () => ({ availability: 'present' as const }))
    availabilityControllers.add(controller)
    return controller
  }

  afterEach(() => {
    availabilityControllers.forEach((controller) => controller.dispose())
    availabilityControllers.clear()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGenerationStore.setState({ generationStartTime: null })
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
        Main_Positive_Prompt: '1girl, masterpiece, high quality',
        Main_Negative_Prompt: 'low quality, blurry',
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
      trialAvailability: createAvailabilityController(),
      comfyHistoryImages: [],
      appliedAssets: {},
      addAppliedAsset: vi.fn(),
      toggleAppliedAsset: vi.fn(),
      removeAppliedAsset: vi.fn(),
      activeBatch: null,
      sets: [{ id: 'default', name: 'Default', is_checked: true }],
      activeSetId: 'default',
      removeSet: vi.fn(),
      toggleSetChecked: vi.fn(),
      setActiveSetId: vi.fn(),
      openPresetIds: [],
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
      workflows: [{ id: 1, name: 'Test Workflow', target_base_model_id: 'sdxl' }],
      workflow: { id: 1, name: 'Test Workflow', target_base_model_id: 'sdxl', json_body: '{}', mappings: [] },
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
      selectedIds: [],
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
        { id: 2, role: 'Main_Negative_Prompt', display_name: 'Negative Prompt', input_type: 'string' },
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

  it('renders TagChipEditor in chip mode by default on mobile', () => {
    const state = createMockState()
    render(<MobileLayout state={state} />)

    // Tag chips should be rendered as individual elements
    expect(screen.getByText('1girl')).toBeInTheDocument()
    expect(screen.getByText('masterpiece')).toBeInTheDocument()
    expect(screen.getByText('high quality')).toBeInTheDocument()

    // Mode toggle button should say "テキスト入力モード切替"
    expect(screen.getByText('テキスト入力モード切替')).toBeInTheDocument()
  })

  it('renders WorkflowActionsMenu next to mobile workflow select and executes workflow actions (AC-6)', () => {
    const handleSaveDefaultParams = vi.fn()
    const state = createMockState({ handleSaveDefaultParams })
    render(<MobileLayout state={state} />)

    const actionsBtn = screen.getByRole('button', { name: 'ワークフロー設定' })
    expect(actionsBtn).toHaveAttribute('title', 'ワークフロー設定')
    fireEvent.click(actionsBtn)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('ワークフロー個別設定')).toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: 'デフォルト保存' })
    fireEvent.click(saveBtn)
    expect(handleSaveDefaultParams).toHaveBeenCalledTimes(1)
  })

  it('switches between Chips Mode and Text Mode when clicking toggle button', () => {
    const state = createMockState()
    render(<MobileLayout state={state} />)

    const toggleButton = screen.getByText('テキスト入力モード切替')
    fireEvent.click(toggleButton)

    // Should switch to Text Mode
    expect(screen.getByText('Text Mode (Comma separated)')).toBeInTheDocument()
    expect(screen.getByText('チップモード切替')).toBeInTheDocument()

    // Textarea should contain comma-separated prompt
    const textarea = screen.getByDisplayValue('1girl, masterpiece, high quality')
    expect(textarea).toBeInTheDocument()

    // Toggle back to Chips Mode
    fireEvent.click(screen.getByText('チップモード切替'))
    expect(screen.getByText('Chips Mode')).toBeInTheDocument()
    expect(screen.getByText('1girl')).toBeInTheDocument()
  })

  it('opens translation modal when clicking 翻訳 button', () => {
    const openTranslationMock = vi.fn()
    const state = createMockState({
      promptTranslation: {
        isOpen: false,
        activeRole: null,
        mode: 'prompt',
        sourceText: '',
        translatedText: '',
        meta: null,
        isTranslating: false,
        error: null,
        openTranslation: openTranslationMock,
        closeTranslation: vi.fn(),
        setMode: vi.fn(),
        setSourceText: vi.fn(),
        executeTranslate: vi.fn(),
        applyToPrompt: vi.fn(),
      },
    })

    render(<MobileLayout state={state} />)

    const translateBtn = screen.getByText('翻訳')
    fireEvent.click(translateBtn)

    expect(openTranslationMock).toHaveBeenCalledWith('Main_Positive_Prompt', '1girl, masterpiece, high quality')
  })

  it('switches the mounted mobile panels without losing the prompt draft or history selection', () => {
    let state: any
    state = createMockState({
      showStrip: true,
      selectedWorkflowId: 1,
      selectedIds: [12],
      textMappings: [
        { id: 1, role: 'Main_Positive_Prompt', display_name: 'Positive Prompt', input_type: 'string' },
      ],
      activePromptTab: 'Main_Positive_Prompt',
      setParamValues: vi.fn((values) => { state.paramValues = values }),
    })
    render(<MobileLayout state={state} />)

    const segmentGroup = screen.getByRole('group', { name: '表示セクション' })
    const promptTab = screen.getByRole('button', { name: 'プロンプト' })
    const parametersTab = screen.getByRole('button', { name: 'パラメータ' })
    const historyTab = screen.getByRole('button', { name: '履歴' })
    expect(segmentGroup).toBeInTheDocument()
    expect(promptTab).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mobile-prompt-panel')).not.toHaveAttribute('hidden')
    expect(screen.getByTestId('mobile-parameters-panel')).toHaveAttribute('hidden')
    expect(screen.getByTestId('mobile-history-panel')).toHaveAttribute('hidden')

    const promptDraft = state.paramValues.Main_Positive_Prompt
    expect(screen.getByText('1girl')).toBeInTheDocument()
    const promptEditor = document.getElementById('prompt-mobile-Main_Positive_Prompt')
    const historyPanel = screen.getByTestId('mobile-history-panel')

    fireEvent.click(parametersTab)
    expect(screen.getByTestId('mobile-parameters-panel')).not.toHaveAttribute('hidden')
    expect(promptEditor).toBeInTheDocument()
    fireEvent.click(historyTab)
    expect(historyPanel).not.toHaveAttribute('hidden')
    expect(screen.getByTestId('mobile-history-panel')).toBe(historyPanel)
    expect(state.selectedIds).toEqual([12])
    fireEvent.click(promptTab)
    expect(screen.getByTestId('mobile-prompt-panel')).not.toHaveAttribute('hidden')
    expect(state.paramValues.Main_Positive_Prompt).toBe(promptDraft)
    expect(screen.getByText('1girl')).toBeInTheDocument()
  })

  it('renders undo/redo inline next to manage presets button and handles click', () => {
    const undoMock = vi.fn()
    const redoMock = vi.fn()
    const setIsPresetManagerOpen = vi.fn()
    const state = createMockState({
      selectedWorkflowId: 1,
      sets: [{ id: 'default', name: 'Default', checked: true }],
      activeSetId: 'default',
      canUndo: true,
      canRedo: true,
      undo: undoMock,
      redo: redoMock,
      setIsPresetManagerOpen,
    })

    render(<MobileLayout state={state} />)

    const undoBtn = screen.getByTitle('Undo')
    const redoBtn = screen.getByTitle('Redo')
    const manageBtn = screen.getByRole('button', { name: '管理' })

    // Verify buttons are not disabled
    expect(undoBtn).not.toBeDisabled()
    expect(redoBtn).not.toBeDisabled()
    expect(undoBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(redoBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(manageBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    // Verify parent container shares the same flex group
    expect(undoBtn.closest('div')?.parentElement).toBe(manageBtn.parentElement)

    // Verify clicks invoke mocks with activeSet.id
    fireEvent.click(undoBtn)
    expect(undoMock).toHaveBeenCalledWith('default')

    fireEvent.click(redoBtn)
    expect(redoMock).toHaveBeenCalledWith('default')

    fireEvent.click(manageBtn)
    expect(setIsPresetManagerOpen).toHaveBeenCalledWith(true)
  })

  it('closes the selected mobile set from its labeled icon button', () => {
    const removeSet = vi.fn()
    const state = createMockState({
      sets: [{ id: 'default', name: 'Default', checked: true }],
      openPresetIds: ['default'],
      activeSetId: 'default',
      removeSet,
    })
    render(<MobileLayout state={state} />)

    const closeButton = screen.getByRole('button', { name: 'Defaultのタブを閉じる' })
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(closeButton)
    expect(removeSet).toHaveBeenCalledWith('default')
  })

  it('preserves prompt values and does not overwrite with empty strings when switching prompt tabs on mobile', () => {
    const setParamValuesMock = vi.fn()
    const setActivePromptTabMock = vi.fn()
    const state = createMockState({
      selectedWorkflowId: 1,
      activePromptTab: 'Main_Positive_Prompt',
      setActivePromptTab: setActivePromptTabMock,
      paramValues: {
        Main_Positive_Prompt: '1girl, masterpiece, high quality',
        Main_Negative_Prompt: 'worst quality, normal quality',
      },
      setParamValues: setParamValuesMock,
    })

    const { rerender } = render(<MobileLayout state={state} />)

    // Positiveプロンプトが表示されていることを確認
    expect(screen.getByText('1girl')).toBeInTheDocument();
    expect(screen.getByText('masterpiece')).toBeInTheDocument();

    // Negativeタブへ切り替えをシミュレート (textMappings: id: 2, display_name: 'Negative Prompt')
    const negativeTab = screen.getByText('Negative Prompt')
    fireEvent.click(negativeTab)
    expect(setActivePromptTabMock).toHaveBeenCalledWith('Main_Negative_Prompt')

    // タブが Negative に切り替わった状態を rerender
    const updatedState = {
      ...state,
      activePromptTab: 'Main_Negative_Prompt',
    }
    rerender(<MobileLayout state={updatedState} />)

    // Negativeプロンプトがチップとして描画され、空文字での破壊的書き換え（setParamValues({ ... "" })）が呼ばれていないことを確認
    expect(screen.getByText('worst quality')).toBeInTheDocument();
    expect(screen.getByText('normal quality')).toBeInTheDocument();
    expect(setParamValuesMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ Main_Negative_Prompt: '' })
    );
  })

  it('calls handleSelectPresetTab when preset tab is clicked on mobile', () => {
    const handleSelectPresetTabMock = vi.fn()
    const state = createMockState({
      sets: [
        { id: '101', name: 'Set 101', checked: true },
        { id: '102', name: 'Set 102', checked: true },
      ],
      openPresetIds: ['101', '102'],
      activeSetId: '101',
      handleSelectPresetTab: handleSelectPresetTabMock,
    })

    render(<MobileLayout state={state} />)

    const tab2 = screen.getByText('Set 102')
    fireEvent.click(tab2)

    expect(handleSelectPresetTabMock).toHaveBeenCalledWith('102')
  })

  it('renders PageHeader with Generate title, ResourceHoverMonitor, and mobile actions row', () => {
    const state = createMockState()
    render(<MobileLayout state={state} />)

    const title = screen.getByText('Generate')
    expect(title).toBeInTheDocument()

    // PageHeader contains ResourceHoverMonitor in right cluster
    expect(screen.getByTestId('resource-hover-monitor')).toBeInTheDocument()

    // Actions row contains workflow selector, WorkflowActionsMenu, and Anima toggle
    expect(screen.getByRole('combobox')).toHaveAttribute('id', 'workflow-select-mobile')
    expect(screen.getByRole('button', { name: 'ワークフロー設定' })).toBeInTheDocument()
    expect(screen.getByText('Anima特化')).toBeInTheDocument()
  })

  it('keeps progress and actions above the mobile navigation safe area', () => {
    const state = createMockState({ isGeneratingHere: true })
    const { container } = render(<MobileLayout state={state} />)

    expect(screen.queryByTestId('mobile-main-preview')).not.toBeInTheDocument()
    expect(container.querySelector('[data-testid="mobile-sticky-status-header"]')).toHaveClass('sticky', 'top-0', 'h-6')
    expect(screen.getByTestId('mobile-action-bar').className).toContain('bottom-[calc(54px+env(safe-area-inset-bottom)+env(keyboard-inset-height,0px))]')
    expect(container.firstElementChild).toHaveClass('pb-[calc(54px+env(safe-area-inset-bottom)+72px)]')
    expect(screen.getByText(/ETA 未取得/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate Batch/ })).toHaveClass('min-h-[44px]')
  })

  it('shows a seconds-based remaining ETA when the generation start and progress are known', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'))
    useGenerationStore.setState({ generationStartTime: Date.now() - 20_000 })
    const state = createMockState({ isGeneratingHere: true, progress: { percentage: 50 } })

    render(<MobileLayout state={state} />)

    expect(screen.getByText(/ETA .*20秒/)).toBeInTheDocument()
  })

  it('exposes mobile queue and save actions in action bar', () => {
    const setIsJobModalOpen = vi.fn()
    const state = createMockState({ totalQueueCount: 3, setIsJobModalOpen })
    render(<MobileLayout state={state} />)

    expect(screen.queryByTestId('mobile-main-preview')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snapshot保存' })).toHaveClass('min-h-[44px]')
    const queueButton = screen.getByRole('button', { name: 'キュー管理: 3件' })
    expect(queueButton).toHaveClass('min-h-[44px]')
    fireEvent.click(queueButton)
    expect(setIsJobModalOpen).toHaveBeenCalledWith(true)
  })

  it('uses the all-session queue count while another session is generating', () => {
    const state = createMockState({ allQueueCount: 7, totalQueueCount: 2, isOtherSessionGenerating: true })
    render(<MobileLayout state={state} />)

    expect(screen.getByRole('button', { name: 'キュー管理: 7件' })).toBeInTheDocument()
  })

  describe('REQ-338-T7: Mobile layout integration, 100dvh, IME defense, Natural Thumb Zone', () => {
    it('applies 100dvh, overscroll-behavior-y contain, and compressed spacing tokens', () => {
      const state = createMockState()
      const { container } = render(<MobileLayout state={state} />)

      const root = container.firstElementChild as HTMLElement
      expect(root).toHaveClass('h-[100dvh]', 'flex', 'flex-col')
      expect(root.style.overscrollBehaviorY).toBe('contain')

      // Check outer padding token px-3 py-2.5 on progress section and action bar
      const progressSection = screen.getByTestId('mobile-progress-section')
      expect(progressSection).toHaveClass('px-3', 'py-2.5')

      const actionBar = screen.getByTestId('mobile-action-bar')
      expect(actionBar).toHaveClass('px-3', 'py-2.5', 'gap-2')
    })

    it('retracts Action Bar and displays Tag Suggest Bar upon input focus, restoring on blur', () => {
      const setParamValues = vi.fn()
      const state = createMockState({
        textMappings: [
          { id: 1, role: 'Main_Positive_Prompt', display_name: 'Positive', is_active: true }
        ],
        activePromptTab: 'Main_Positive_Prompt',
        paramValues: {
          Main_Positive_Prompt: '1girl'
        },
        setParamValues
      })

      const { container } = render(<MobileLayout state={state} />)

      const actionBar = screen.getByTestId('mobile-action-bar')
      expect(actionBar).toHaveClass('flex')
      expect(actionBar).not.toHaveClass('hidden')
      expect(screen.queryByTestId('mobile-tag-suggest-bar')).not.toBeInTheDocument()

      // Focus an input field
      const input = container.querySelector('input:not([type="checkbox"])') as HTMLElement || container.querySelector('textarea')
      expect(input).not.toBeNull()

      fireEvent.focus(input!)

      // Action Bar should be hidden and Tag Suggest Bar should be displayed
      expect(actionBar).toHaveClass('hidden', 'pointer-events-none')
      const tagSuggestBar = screen.getByTestId('mobile-tag-suggest-bar')
      expect(tagSuggestBar).toBeInTheDocument()

      // Click a tag suggestion button
      const tagBtn = screen.getByRole('button', { name: '+masterpiece' })
      expect(tagBtn).toBeInTheDocument()
      fireEvent.click(tagBtn)
      expect(setParamValues).toHaveBeenCalledWith(
        expect.objectContaining({
          Main_Positive_Prompt: '1girl, masterpiece'
        })
      )

      // Blur input
      fireEvent.blur(input!)

      expect(actionBar).toHaveClass('flex')
      expect(actionBar).not.toHaveClass('hidden')
      expect(screen.queryByTestId('mobile-tag-suggest-bar')).not.toBeInTheDocument()
    })

    it('enforces Natural Zone ergonomics with maxHeight 40vh and 44px touch targets', () => {
      const state = createMockState()
      render(<MobileLayout state={state} />)

      const actionBar = screen.getByTestId('mobile-action-bar')
      expect(actionBar.style.maxHeight).toBe('40vh')

      const generateBtn = screen.getByRole('button', { name: /Generate Batch/ })
      expect(generateBtn).toHaveClass('min-h-[44px]')

      const saveBtn = screen.getByRole('button', { name: 'Snapshot保存' })
      expect(saveBtn).toHaveClass('min-h-[44px]')

      const queueBtn = screen.getByRole('button', { name: /キュー管理/ })
      expect(queueBtn).toHaveClass('min-h-[44px]')
    })

    it('resets input retreat on orientationchange and resize if activeElement is not an input', () => {
      const { container } = render(<MobileLayout state={createMockState()} />)
      const actionBar = screen.getByTestId('mobile-action-bar')

      const input = container.querySelector('input:not([type="checkbox"])') as HTMLElement
      if (input) {
        fireEvent.focus(input)
        expect(actionBar).toHaveClass('hidden')

        // Trigger orientationchange
        fireEvent(window, new Event('orientationchange'))
        expect(actionBar).toHaveClass('flex')
      }
    })
  })

  describe('REQ-363: Mobile Layout Optimization (T1)', () => {
    it('[REQ-363/AC-1] renders prompt tabs with shrink-0 and whitespace-nowrap preventing overlap', () => {
      const state = createMockState({
        textMappings: [
          { id: 1, role: 'positive', display_name: 'Positive Prompt' },
          { id: 2, role: 'negative', display_name: 'Negative Prompt' },
          { id: 3, role: 'style', display_name: 'Style Enhancer' },
        ],
        activePromptTab: 'positive',
      })
      render(<MobileLayout state={state} />)

      const posBtn = screen.getByRole('button', { name: 'Positive Prompt' })
      const negBtn = screen.getByRole('button', { name: 'Negative Prompt' })
      const styleBtn = screen.getByRole('button', { name: 'Style Enhancer' })

      expect(posBtn).toHaveClass('shrink-0', 'whitespace-nowrap')
      expect(negBtn).toHaveClass('shrink-0', 'whitespace-nowrap')
      expect(styleBtn).toHaveClass('shrink-0', 'whitespace-nowrap')
    })

    it('[REQ-363/AC-2] keeps mobile action bar visible when tapping checkboxes or radio buttons', () => {
      const state = createMockState({
        selectedWorkflowId: 1,
        isConnected: true,
        workflow: { id: 1, name: 'Default Workflow' } as any,
      })
      const { container } = render(<MobileLayout state={state} />)
      const actionBar = screen.getByTestId('mobile-action-bar')

      expect(actionBar).toHaveClass('flex')
      expect(actionBar).not.toHaveClass('hidden')

      const checkbox = container.querySelector('#anima-mode-toggle-mobile')
      expect(checkbox).not.toBeNull()
      if (checkbox) {
        fireEvent.focus(checkbox)
        expect(actionBar).toHaveClass('flex')
        expect(actionBar).not.toHaveClass('hidden')

        fireEvent.focusIn(checkbox)
        expect(actionBar).toHaveClass('flex')
        expect(actionBar).not.toHaveClass('hidden')
      }
    })

    it('[REQ-363/AC-3] applies bottom padding ensuring last tag chips scroll clear of action bar', () => {
      const state = createMockState()
      const { container } = render(<MobileLayout state={state} />)

      const scrollContainer = container.firstElementChild as HTMLElement
      expect(scrollContainer.className).toContain('pb-[calc(54px+env(safe-area-inset-bottom)+72px)]')
      expect(scrollContainer.className).toContain('scroll-pb-[calc(54px+env(safe-area-inset-bottom)+72px)]')
    })

    it('[REQ-372/AC-1] removes persistent main preview container in mobile layout', () => {
      const state = createMockState({
        isGenerating: false,
        previewImage: 'data:image/png;base64,mock',
        selectedImg: 'data:image/png;base64,mock',
      })
      render(<MobileLayout state={state} />)

      // Verify that data-testid="mobile-main-preview" and preview toggle btn are completely absent
      expect(screen.queryByTestId('mobile-main-preview')).not.toBeInTheDocument()
      expect(screen.queryByTestId('preview-toggle-btn')).not.toBeInTheDocument()
    })

    it('[REQ-372/AC-9] displays sticky status header with progress and shows completion navigation on job end', () => {
      const state = createMockState({
        isGeneratingHere: true,
        progress: { percentage: 45, value: 45, max: 100 },
        activeBatch: [{ status: 'generating' }],
      })
      const { rerender } = render(<MobileLayout state={state} />)

      const header = screen.getByTestId('mobile-sticky-status-header')
      expect(header).toBeInTheDocument()
      expect(header).toHaveClass('sticky', 'top-0')
      expect(within(header).getByText('進行中')).toBeInTheDocument()
      expect(screen.queryByTestId('mobile-completion-nav-btn')).not.toBeInTheDocument()

      // Generation completes: isGeneratingHere becomes false
      rerender(<MobileLayout state={{ ...state, isGeneratingHere: false, activeBatch: [{ status: 'completed' }] }} />)

      // Completion navigation link appears
      const completionNav = screen.getByTestId('mobile-completion-nav-btn')
      expect(completionNav).toBeInTheDocument()
      expect(completionNav).toHaveTextContent('生成完了: 最新画像を表示')

      // Clicking completion navigation switches active segment to history
      fireEvent.click(completionNav)
      const historyPanel = screen.getByTestId('mobile-history-panel')
      expect(historyPanel).toBeVisible()
      expect(historyPanel).not.toHaveAttribute('hidden')
    })

    it('[REQ-372/AC-11] maintains sticky status header layout and text truncation on 360px viewport', () => {
      const state = createMockState({
        isGeneratingHere: true,
        progress: { percentage: 70 },
      })
      render(<MobileLayout state={state} />)

      const header = screen.getByTestId('mobile-sticky-status-header')
      expect(header).toBeInTheDocument()
      const progressLine = screen.getByTestId('mobile-progress-line')
      expect(progressLine).toHaveClass('truncate', 'flex-1', 'min-w-0')
    })
    it('[REQ-372/AC-3] opens MobileImageSheet on clicking thumbnail and closes properly', () => {
      const trialAvailability = createTrialAvailabilityController(async () => ({ availability: 'present' as const }))
      const state = createMockState({
        showStrip: true,
        thumbnailTab: 'history',
        selectedImg: 'http://example.com/test.png',
        sortedDisplayImages: ['http://example.com/test.png'],
        images: ['http://example.com/test.png'],
        selectedIds: new Set(),
        trialAvailability,
      })
      render(<MobileLayout state={state} />)

      // Initially closed
      expect(screen.queryByTestId('mobile-image-sheet')).not.toBeInTheDocument()

      // Switch to history segment
      const historyTabBtn = screen.getByRole('button', { name: '履歴' })
      fireEvent.click(historyTabBtn)

      // Click thumbnail
      const thumb = screen.getByRole('button', { name: /generated 1/i })
      fireEvent.click(thumb)

      // Image sheet should now be open
      expect(screen.getByTestId('mobile-image-sheet')).toBeInTheDocument()

      // Close image sheet
      fireEvent.click(screen.getByTestId('mobile-sheet-close-btn'))
      expect(screen.queryByTestId('mobile-image-sheet')).not.toBeInTheDocument()
    })
  })
})
