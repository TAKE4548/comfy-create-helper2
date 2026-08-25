import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MobileLayout } from '../MobileLayout'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))

// Mock lucide-react icons if necessary (lucide-react works normally in tests)

describe('MobileLayout - TagChipEditor Integration', () => {
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

  it('renders sections in order: Thumbnail Strip (History) -> Profiles -> Prompt Input', () => {
    const state = createMockState({
      showStrip: true,
      selectedWorkflowId: 1,
      textMappings: [
        { id: 1, role: 'Main_Positive_Prompt', display_name: 'Positive Prompt', input_type: 'string' },
      ],
      activePromptTab: 'Main_Positive_Prompt',
    })
    render(<MobileLayout state={state} />)

    const historyTab = screen.getByText('履歴')
    const profilesTitle = screen.getByText('Profiles')
    const promptInput = screen.getByText('Positive Prompt Input')

    // Verify DOM order using compareDocumentPosition
    expect(historyTab.compareDocumentPosition(profilesTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(profilesTitle.compareDocumentPosition(promptInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders undo/redo inline next to manage presets button and handles click', () => {
    const undoMock = vi.fn()
    const redoMock = vi.fn()
    const state = createMockState({
      selectedWorkflowId: 1,
      sets: [{ id: 'default', name: 'Default', checked: true }],
      activeSetId: 'default',
      canUndo: true,
      canRedo: true,
      undo: undoMock,
      redo: redoMock,
    })

    render(<MobileLayout state={state} />)

    const undoBtn = screen.getByTitle('Undo')
    const redoBtn = screen.getByTitle('Redo')
    const manageBtn = screen.getByText('📑 管理')

    // Verify buttons are not disabled
    expect(undoBtn).not.toBeDisabled()
    expect(redoBtn).not.toBeDisabled()

    // Verify parent container shares the same flex group
    expect(undoBtn.closest('div')?.parentElement).toBe(manageBtn.parentElement)

    // Verify clicks invoke mocks with activeSet.id
    fireEvent.click(undoBtn)
    expect(undoMock).toHaveBeenCalledWith('default')

    fireEvent.click(redoBtn)
    expect(redoMock).toHaveBeenCalledWith('default')
  })
})

