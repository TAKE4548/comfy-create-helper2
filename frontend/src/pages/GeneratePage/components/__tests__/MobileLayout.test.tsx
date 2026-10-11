import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileLayout } from '../MobileLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))

// Mock lucide-react icons if necessary (lucide-react works normally in tests)

describe('MobileLayout - TagChipEditor Integration', () => {
  afterEach(() => vi.useRealTimers())

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

  it('labels the mobile workflow connection settings button and keeps its open callback', () => {
    const setIsSettingsOpen = vi.fn()
    const state = createMockState({ setIsSettingsOpen })
    render(<MobileLayout state={state} />)

    const settingsButton = screen.getByRole('button', { name: 'ワークフロー / 接続設定' })
    expect(settingsButton).toHaveAttribute('title', 'ワークフロー / 接続設定')
    fireEvent.click(settingsButton)
    expect(setIsSettingsOpen).toHaveBeenCalledWith(true)
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

  it('renders ResourceGaugeChips in the first line of the header next to Generate title', () => {
    const state = createMockState()
    render(<MobileLayout state={state} />)

    const title = screen.getByText('Generate')
    expect(title).toBeInTheDocument()

    // 1段目の親コンテナ (justify-between)
    const headerRow1 = title.closest('.justify-between')
    expect(headerRow1).not.toBeNull()

    // ResourceGaugeChips 内のチップ (CPU, RAM, GPU, VRAM) が 1段目ヘッダーに含まれること
    expect(headerRow1).toHaveTextContent('CPU')
    expect(headerRow1).toHaveTextContent('RAM')
    expect(headerRow1).toHaveTextContent('GPU')
    expect(headerRow1).toHaveTextContent('VRAM')
  })

  it('keeps the portrait preview, progress, and actions above the mobile navigation safe area', () => {
    const state = createMockState({ selectedImg: '/portrait.png', isGeneratingHere: true })
    const { container } = render(<MobileLayout state={state} />)

    const previewImage = screen.getByAltText('Generated')
    expect(previewImage.parentElement?.parentElement).toHaveClass('aspect-[2/3]', 'max-h-[42vh]')
    expect(container.querySelector('[data-testid="mobile-progress-line"]')).toHaveClass('sticky', 'top-0', 'h-6')
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

  it('keeps the generated portrait preview from shrinking and exposes mobile queue and save actions', () => {
    const setIsJobModalOpen = vi.fn()
    const state = createMockState({ previewImage: '/portrait.png', totalQueueCount: 3, setIsJobModalOpen })
    render(<MobileLayout state={state} />)

    const preview = screen.getByAltText('Generated')
    expect(preview.parentElement?.parentElement).toHaveClass('shrink-0', 'aspect-[2/3]', 'max-h-[42vh]')
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

      // Check outer padding token px-3 py-2.5 on header and action bar
      const header = container.querySelector('.bg-surface-2')
      expect(header).toHaveClass('px-3', 'py-2.5')

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
      const input = container.querySelector('input') || container.querySelector('textarea')
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

      const input = container.querySelector('input')
      if (input) {
        fireEvent.focus(input)
        expect(actionBar).toHaveClass('hidden')

        // Trigger orientationchange
        fireEvent(window, new Event('orientationchange'))
        expect(actionBar).toHaveClass('flex')
      }
    })
  })
})
