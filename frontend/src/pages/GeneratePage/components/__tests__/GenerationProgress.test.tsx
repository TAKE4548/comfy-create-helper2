import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DesktopLayout } from '../DesktopLayout'
import { MobileLayout } from '../MobileLayout'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { GenerationSnapshot, JobView } from '../../../../utils/generationSelectors'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/' }),
}))
vi.mock('../../../api/client', () => ({
  api: { workflows: { get: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
    bypassProfiles: { list: vi.fn().mockResolvedValue([]) } },
}))

const fn = () => vi.fn()
const makeState = (overrides: Record<string, unknown> = {}) => ({
  isConnected: true, isGenerating: false, progress: null, previewImage: null, activeClientId: 'session-a', clientId: 'session-a',
  selectedWorkflowId: 1, setSelectedWorkflowId: fn(), paramValues: {}, setParamValues: fn(), batchSize: 1,
  setBatchSize: fn(), seedMode: 'random', setSeedMode: fn(), seed: 1, setSeed: fn(), selectedImg: null, setSelectedImg: fn(),
  appliedAssets: {}, addAppliedAsset: fn(), toggleAppliedAsset: fn(), removeAppliedAsset: fn(), activeBatch: null,
  sets: [], activeSetId: 'default', removeSet: fn(), toggleSetChecked: fn(), openPresetIds: [], undo: fn(), redo: fn(), canUndo: false, canRedo: false,
  setRescanOpen: fn(), selectedMasters: {}, setSelectedMasters: fn(), openAddAssetRole: null, setOpenAddAssetRole: fn(),
  isSettingsOpen: false, setIsSettingsOpen: fn(), localComfyUrl: 'http://localhost:8188', setLocalComfyUrl: fn(), setComfyUrl: fn(),
  setIsJobModalOpen: fn(), setIsPresetManagerOpen: fn(), setWorkflowManageMode: fn(), baseModels: [], updateWorkflowBaseModelMutation: { mutate: fn() },
  workflows: [{ id: 1, name: 'Workflow', target_base_model_id: 'sdxl' }], workflow: { id: 1, name: 'Workflow', json_body: '{}', mappings: [] },
  mappingMasters: [], loras: [], paramTypeMasters: [], tagSets: [], presets: [], comfyObjectInfo: null, displayImages: [], sortedDisplayImages: [],
  getSetNameForImage: fn(), sortedSnapshots: [], isMultiSelectMode: false, selectedIds: new Set(), handleItemClick: fn(), getLongPressHandlers: fn(() => ({})),
  isSelected: fn(() => false), exitMultiSelectMode: fn(), selectAll: fn(), clearSelection: fn(), handlePrevImg: fn(), handleNextImg: fn(),
  auditOpen: false, setAuditOpen: fn(), auditIntent: '', setAuditIntent: fn(), auditTypes: [], setAuditTypes: fn(), auditResult: null, auditStatus: 'idle', runAudit: { mutate: fn() },
  dragOver: false, handleFileSelect: fn(), handleDragOver: fn(), handleDragLeave: fn(), handleDrop: fn(), isGeneratingHere: false,
  isOtherSessionGenerating: false, allQueueCount: 0, totalQueueCount: 0, showStrip: false, invalidMappings: [], textMappings: [], paramMappings: [],
  handleLoadSnapshot: fn(), handleUpdateMapping: fn(), handleOpenModalPreview: fn(), handleGenerateSets: fn(), getIsRoleCollapsed: fn(() => false),
  setRoleCollapsed: fn(), handleSaveDefaultParams: fn(), handleResetDefaultParams: fn(), setIsSaveModalOpen: fn(), updateWorkflowMutation: { mutate: fn() },
  saveDefaultParamsMutation: { mutate: fn() }, isAnimaMode: false, setIsAnimaMode: fn(), promptTranslation: {
    isOpen: false, activeRole: null, mode: 'prompt', sourceText: '', translatedText: '', meta: null, isTranslating: false, error: null,
    openTranslation: fn(), closeTranslation: fn(), setMode: fn(), setSourceText: fn(), executeTranslate: fn(), applyToPrompt: fn(),
  },
  ...overrides,
})

const job = (overrides: Partial<JobView>): JobView => ({
  job_id: 'job', request_id: 'request', prompt_id: null, session_id: 'session-a', scope: 'normal', batch_id: 'batch', normal_group_id: 'group',
  project_id: null, status: 'queued', started_at: null, finished_at: null, node: null, outputs: [], failure: null, ...overrides,
})
const snapshot = (jobs: JobView[]): GenerationSnapshot => ({
  version: 1, epoch: 'epoch', revision: 1, normal_group_id: 'group', jobs, batches: [],
  upstream: { http_ready: true, ws_connected: true, failure_since: null },
})

function setManagedState(value: GenerationSnapshot | null, extras: Record<string, unknown> = {}) {
  useGenerationStore.setState({ generationSnapshot: value, generationSyncIssue: null, generationSyncing: false, filterOwnSession: false, clientId: 'session-a', ...extras } as never)
}

function renderGroupedDesktop(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['stage-masters'], [])
  client.setQueryData(['mapping-masters'], [])
  return render(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

function renderBoth(state: ReturnType<typeof makeState>) {
  const desktop = renderGroupedDesktop(<DesktopLayout state={state as never} />)
  const mobile = render(<MobileLayout state={state as never} />)
  return { desktop, mobile }
}

afterEach(() => { cleanup(); setManagedState(null, { generationStartTime: null }); vi.restoreAllMocks(); vi.useRealTimers() })

describe('REQ-333 progress bars use managed snapshots on desktop and mobile', () => {
  it('shows integer percentages while preserving fractional overall and node bar widths', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T12:00:00Z'))
    const jobs = [
      job({ job_id: 'success-1', status: 'succeeded' }), job({ job_id: 'failed', status: 'failed' }),
      job({ job_id: 'run', status: 'running', started_at: '2026-10-10T00:00:00Z', node: { id: 'sampler', name: 'Sampler', value: 1, max: 3 } }),
      ...Array.from({ length: 2 }, (_, index) => job({ job_id: `queued-${index}` })),
      job({ job_id: 'studio', scope: 'studio', normal_group_id: null, batch_id: 'studio', status: 'running', node: { id: 'bad', name: 'STUDIO-LEAK', value: 99, max: 100 } }),
    ]
    setManagedState(snapshot(jobs), { nodeProgress: { percentage: 99 }, currentNode: { id: 'bad', name: 'STORE-LEAK' }, generationStartTime: Date.now() })
    const { desktop, mobile } = renderBoth(makeState({ isGeneratingHere: true, isOtherSessionGenerating: true }))
    expect(screen.getAllByText('全体進捗: 2/5 枚目')).toHaveLength(2)
    expect(screen.getAllByText('47%')).toHaveLength(2)
    expect(screen.getAllByText('実行中: Sampler')).toHaveLength(2)
    expect(screen.getAllByText('33%')).toHaveLength(2)
    expect(screen.queryByText(/STUDIO-LEAK|STORE-LEAK/)).toBeNull()
    expect(screen.getByText('経過時間: 43200秒')).toBeTruthy()
    expect(screen.getByText('経過: 43200秒')).toBeTruthy()
    expect(desktop.container.querySelector('.bg-blue-500')?.getAttribute('style')).toContain('33.33333333333333%')
    expect(mobile.container.querySelector('.bg-blue-500')?.getAttribute('style')).toContain('33.33333333333333%')
    expect(desktop.container.querySelector('.bg-accent-green.progress-shimmer')?.getAttribute('style')).toContain('46.666666666666664%')
    expect(mobile.container.querySelector('.bg-accent-green.progress-shimmer')?.getAttribute('style')).toContain('46.666666666666664%')
  })

  it('keeps Studio waits separate, uses session-only waits only when filtered, and keeps idle widths finite', () => {
    const studioWait = snapshot([
      job({ job_id: 'normal-queued' }),
      ...Array.from({ length: 8 }, (_, index) => job({ job_id: `studio-${index}`, scope: 'studio', normal_group_id: null, batch_id: 'studio', status: 'running', node: { id: 's', name: 'Studio Node', value: 5, max: 10 } })),
    ])
    setManagedState(studioWait)
    renderBoth(makeState())
    expect(screen.getAllByText('全体進捗: 0/1 枚目')).toHaveLength(2)
    expect(screen.getAllByText('実行中: Studio 待機中 (8)')).toHaveLength(2)
    expect(screen.queryByText('実行中: Studio Node')).toBeNull()
    cleanup()

    const sessionWait = snapshot([
      job({ job_id: 'own-queued', session_id: 'session-a' }),
      job({ job_id: 'other-1', session_id: 'session-b', status: 'running', node: { id: 'n', name: 'Other Node', value: 1, max: 3 } }),
      job({ job_id: 'other-2', session_id: 'session-b', status: 'queued' }),
    ])
    setManagedState(sessionWait, { filterOwnSession: true })
    renderBoth(makeState())
    expect(screen.getAllByText(/他セッションで生成中 \(2\)/)).toHaveLength(2)
    expect(screen.queryByText('実行中: Other Node')).toBeNull()
    cleanup()

    setManagedState(snapshot([
      job({ job_id: 'foreign-1', session_id: 'session-b', status: 'running' }),
      job({ job_id: 'foreign-2', session_id: 'session-b', status: 'queued' }),
    ]), { filterOwnSession: true })
    renderBoth(makeState())
    expect(screen.queryByText(/他セッションで生成中/)).toBeNull()
    expect(screen.getAllByText('Ready')).toHaveLength(2)
    cleanup()

    setManagedState(sessionWait, { filterOwnSession: false })
    const { desktop, mobile } = renderBoth(makeState())
    expect(screen.getAllByText('全体進捗: 0/3 枚目')).toHaveLength(2)
    expect(screen.getAllByText('実行中: Other Node')).toHaveLength(2)
    expect(screen.getAllByText('33%')).toHaveLength(2)
    expect(desktop.container.querySelector('.bg-blue-500')?.getAttribute('style')).toContain('33.33333333333333%')
    expect(mobile.container.querySelector('.bg-blue-500')?.getAttribute('style')).toContain('33.33333333333333%')
    cleanup()

    setManagedState(snapshot([job({ job_id: 'cancelled', status: 'cancelled' })]))
    const idle = renderBoth(makeState())
    expect(idle.desktop.container.querySelector('[style*="width: 0%"]')).toBeTruthy()
    expect(idle.mobile.container.querySelector('[style*="width: 0%"]')).toBeTruthy()
  })

  it('preserves last visible progress while reporting sync issue and keeps legacy no-snapshot fallback', () => {
    setManagedState(snapshot([job({ job_id: 'run', status: 'running', node: { id: 'n', name: 'Managed Node', value: 1, max: 4 } })]), {
      generationSyncIssue: { kind: 'error', message: '再同期に失敗しました' },
    })
    const { desktop, mobile } = renderBoth(makeState({ isGeneratingHere: true, progress: { percentage: 30 } }))
    expect(screen.getAllByText(/再同期に失敗しました/)).toHaveLength(2)
    expect(screen.getAllByText('全体進捗: 0/1 枚目')).toHaveLength(2)
    expect(screen.getAllByText('25%')).toHaveLength(4)
    cleanup()

    setManagedState(null)
    renderBoth(makeState({ isGeneratingHere: true, progress: { percentage: 30 } }))
    expect(screen.getAllByText('30%')).toHaveLength(2)
    expect(desktop.container).toBeDefined()
    expect(mobile.container).toBeDefined()
  })

  it('keeps queue, generate, and snapshot actions in the right action bar with unknown timing labels', () => {
    const runningJob = job({ job_id: 'running', status: 'running', node: { id: 'node', name: 'Sampler', value: 1, max: 4 } })
    setManagedState(snapshot([runningJob]), { generationStartTime: null, nodeProgress: { percentage: 25 } })
    const state = makeState({ totalQueueCount: 4, allQueueCount: 6 })
    localStorage.clear()
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    const view = renderGroupedDesktop(<DesktopLayout state={state as never} />)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })

    expect(view.container.querySelector('#desktop-action-bar')).toBeInTheDocument()
    expect(view.container.querySelector('[style="width: 330px;"]')).toBeInTheDocument()
    expect(view.container.querySelector('#workflow-actions-btn')).toBeInTheDocument()
    expect(view.container.querySelectorAll('#generate-btn')).toHaveLength(1)
    expect(view.container.querySelectorAll('#save-snapshot-btn')).toHaveLength(1)
    expect(view.container.querySelectorAll('.bg-accent-green.progress-shimmer')).toHaveLength(1)
    expect(view.container.querySelectorAll('.bg-blue-500.progress-shimmer')).toHaveLength(1)
    expect(screen.getByText('経過時間: 未取得')).toBeInTheDocument()
    expect(screen.getByText('残り約: 未取得')).toBeInTheDocument()

    const queueButton = screen.getByRole('button', { name: 'ジョブキュー一覧・管理を開く' })
    expect(queueButton).toHaveAttribute('title', 'ジョブキュー一覧・管理を開く')
    expect(queueButton).toHaveTextContent('Queue: 4')
    fireEvent.click(queueButton)
    expect(state.setIsJobModalOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(view.container.querySelector('#generate-btn') as HTMLElement)
    expect(state.handleGenerateSets).toHaveBeenCalledTimes(1)

    const saveButton = view.container.querySelector('#save-snapshot-btn') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    view.rerender(<DesktopLayout state={{ ...state, selectedImg: '/image.png' } as never} />)
    const enabledSaveButton = view.container.querySelector('#save-snapshot-btn') as HTMLButtonElement
    expect(enabledSaveButton.disabled).toBe(false)
    fireEvent.click(enabledSaveButton)
    expect(state.setIsSaveModalOpen).toHaveBeenCalledTimes(1)
  })

  it('computes remaining seconds from the managed running-job start time and progress', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'))
    setManagedState(snapshot([
      job({
        job_id: 'known-eta',
        status: 'running',
        started_at: '2026-10-10T11:59:30Z',
        node: { id: 'node', name: 'Sampler', value: 1, max: 2 },
      }),
    ]), { generationStartTime: null })

    const { desktop, mobile } = renderBoth(makeState({ isGeneratingHere: true }))

    expect(desktop.container).toHaveTextContent('経過時間: 30秒')
    expect(mobile.container).toHaveTextContent('経過: 30秒')
    expect(desktop.container).toHaveTextContent('残り約: 30秒')
    expect(mobile.container).toHaveTextContent('ETA 30秒')
  })
})
