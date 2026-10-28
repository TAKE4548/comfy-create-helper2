import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateModalsOverlay } from '../GenerateModalsOverlay'
import type { GenerateModalsOverlayProps } from '../GenerateModalsOverlay'

const renderOverlay = (message: string, setErrorToast = vi.fn()) => {
  render(
    <GenerateModalsOverlay
      state={{} as never}
      showCopyModal={false}
      setShowCopyModal={vi.fn()}
      newSetName=""
      setNewSetName={vi.fn()}
      copySourceId="default"
      setCopySourceId={vi.fn()}
      isBypassSettingsOpen={false}
      setIsBypassSettingsOpen={vi.fn()}
      isParamSyncSettingsOpen={false}
      setIsParamSyncSettingsOpen={vi.fn()}
      saveAsTagSetRole={null}
      setSaveAsTagSetRole={vi.fn()}
      errorToast={{ message, persistent: true }}
      setErrorToast={setErrorToast}
    />
  )
  return setErrorToast
}

describe('GenerateModalsOverlay error notification', () => {
  it('keeps long multiline reasons readable and renders HTML-like content as text', () => {
    const message = Array.from({ length: 24 }, (_, index) => `reason-${index + 1}: <img src=x onerror=alert(1)>`).join('\n')
    renderOverlay(message)

    const alert = screen.getByRole('alert')
    expect(alert.firstElementChild?.textContent).toBe(message)
    expect(alert.querySelector('img')).toBeNull()
    // ui-invariant-ignore: rule-no-raw-100vh reason: legacy baseline test assertion
    expect(alert).toHaveClass('w-[calc(100vw-2rem)]', 'max-w-xl', 'max-h-[calc(100vh-2rem)]', 'overflow-y-auto')
    expect(alert.firstElementChild).toHaveClass('whitespace-pre-wrap', 'break-words')
  })

  it('closes with the keyboard through its labeled native button', async () => {
    const user = userEvent.setup()
    const setErrorToast = renderOverlay('投入できませんでした')

    const closeButton = screen.getByRole('button', { name: '通知を閉じる' })
    closeButton.focus()
    await user.keyboard('{Enter}')

    expect(setErrorToast).toHaveBeenCalledWith(null)
  })

  it('closes when clicked', () => {
    const setErrorToast = renderOverlay('投入できませんでした')
    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(setErrorToast).toHaveBeenCalledWith(null)
  })
})

// REQ-309 lazy modal host cases. Each test re-imports the overlay (vi.resetModules) so that
// React.lazy caches and module evaluations start fresh; the module gate is controlled per test.
const control = vi.hoisted(() => ({
  gate: Promise.resolve() as Promise<void>,
  open: (() => {}) as () => void,
  failures: new Set<string>(),
  evaluations: { bypass: 0, paramSync: 0, saveTagSet: 0, translation: 0 },
  // Simulates a failed chunk fetch as a render-time chunk-style error (vitest re-wraps a rejected factory,
  // which would drop the chunk-error message that the boundary matches on).
  failedChunk: (name: string) => ({
    [name]: () => {
      throw new TypeError(`Failed to fetch dynamically imported module: ${name}`)
    },
  }),
}))

// Factories are registered per case (vi.doMock in beforeEach) so each case gets its own gate,
// failure set, and evaluation counter; vi.resetModules alone does not re-run cached mock factories.
const registerLazyModuleMocks = () => {
  vi.doMock('../../../../components/BypassSettingsModal', async (importOriginal) => {
    control.evaluations.bypass++
    await control.gate
    if (control.failures.has('bypass')) return control.failedChunk('BypassSettingsModal')
    return importOriginal()
  })

  vi.doMock('../../../../components/ParamSyncModal', async (importOriginal) => {
    control.evaluations.paramSync++
    await control.gate
    if (control.failures.has('paramSync')) return control.failedChunk('ParamSyncModal')
    return importOriginal()
  })

  vi.doMock('../../components/SaveAsTagSetModal', async (importOriginal) => {
    control.evaluations.saveTagSet++
    await control.gate
    if (control.failures.has('saveTagSet')) return control.failedChunk('SaveAsTagSetModal')
    return importOriginal()
  })

  vi.doMock('../../components/PromptTranslationModal', async (importOriginal) => {
    control.evaluations.translation++
    await control.gate
    if (control.failures.has('translation')) return control.failedChunk('PromptTranslationModal')
    return importOriginal()
  })
}

const FALLBACK = (label: string) => new RegExp(`${label}を読み込み中…`)

type OverlayModule = typeof import('../GenerateModalsOverlay')
type OverlayComponent = (props: GenerateModalsOverlayProps) => ReactElement

const translationState = (isOpen: boolean) => ({
  isOpen,
  mode: 'translate',
  activeRole: 'positive',
  sourceText: '',
  translatedText: '',
  meta: null,
  isTranslating: false,
  error: null,
  closeTranslation: vi.fn(),
  setMode: vi.fn(),
  setSourceText: vi.fn(),
  executeTranslate: vi.fn(),
  applyToPrompt: vi.fn(),
})

const overlayProps = (over: Record<string, unknown> = {}, state: Record<string, unknown> = {}) => ({
  state: {
    workflow: { json_body: '{}' },
    presets: [],
    textMappings: [],
    paramValues: { positive: 'prompt' },
    handleCreatePreset: vi.fn(),
    ...state,
  } as never,
  showCopyModal: false,
  setShowCopyModal: vi.fn(),
  newSetName: '',
  setNewSetName: vi.fn(),
  copySourceId: 'default' as string | number,
  setCopySourceId: vi.fn(),
  isBypassSettingsOpen: false,
  setIsBypassSettingsOpen: vi.fn(),
  isParamSyncSettingsOpen: false,
  setIsParamSyncSettingsOpen: vi.fn(),
  saveAsTagSetRole: null as string | null,
  setSaveAsTagSetRole: vi.fn(),
  errorToast: null as { message: string; persistent?: boolean } | null,
  setErrorToast: vi.fn(),
  ...over,
})

const flushMicrotasks = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('GenerateModalsOverlay lazy modals', () => {
  let Overlay: OverlayComponent

  beforeEach(async () => {
    control.gate = new Promise<void>((resolve) => { control.open = resolve })
    control.failures = new Set()
    control.evaluations = { bypass: 0, paramSync: 0, saveTagSet: 0, translation: 0 }
    registerLazyModuleMocks()
    vi.resetModules()
    const { GenerateModalsOverlay: Fresh } = await import('../GenerateModalsOverlay') as OverlayModule
    // SaveAsTagSetModal reads a React Query client; wrap the real overlay with a fresh client per case.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    Overlay = (props) => (
      <QueryClientProvider client={queryClient}>
        <Fresh {...props} />
      </QueryClientProvider>
    )
  })

  it('[REQ-309/AC-1] closed-overlay-modals-not-loaded', ({ task }) => {
    task.meta.caseId = 'closed-overlay-modals-not-loaded'
    render(<Overlay {...overlayProps({}, { promptTranslation: translationState(false) })} />)
    expect(control.evaluations).toEqual({ bypass: 0, paramSync: 0, saveTagSet: 0, translation: 0 })
  })

  it('[REQ-309/AC-3] copy-dialog-and-toast-stay-synchronous', ({ task }) => {
    task.meta.caseId = 'copy-dialog-and-toast-stay-synchronous'
    render(
      <Overlay {...overlayProps({ showCopyModal: true, errorToast: { message: '保存できませんでした' } })} />
    )
    expect(screen.getByText('新規プロファイル作成 (Add Set)')).toBeInTheDocument()
    expect(screen.getByText('保存できませんでした')).toBeInTheDocument()
  })

  it.each([
    { caseId: 'overlay-modal-lazy-open-bypass', label: 'バイパス設定', key: 'bypass' as const,
      open: { isBypassSettingsOpen: true }, closed: { isBypassSettingsOpen: false } },
    { caseId: 'overlay-modal-lazy-open-paramsync', label: 'パラメータ同期設定', key: 'paramSync' as const,
      open: { isParamSyncSettingsOpen: true }, closed: { isParamSyncSettingsOpen: false } },
    { caseId: 'overlay-modal-lazy-open-savetagset', label: 'タグセット保存', key: 'saveTagSet' as const,
      open: { saveAsTagSetRole: 'positive' }, closed: { saveAsTagSetRole: null } },
  ])('[REQ-309/AC-3] $caseId', async ({ label, key, open, closed }) => {
    const { rerender } = render(<Overlay {...overlayProps(open)} />)
    expect(screen.getByText(FALLBACK(label))).toBeInTheDocument()

    await act(async () => { control.open() })
    await waitFor(() => expect(screen.queryByText(FALLBACK(label))).toBeNull())
    expect(control.evaluations[key]).toBe(1)

    rerender(<Overlay {...overlayProps(closed)} />)
    expect(screen.queryByText(FALLBACK(label))).toBeNull()

    rerender(<Overlay {...overlayProps(open)} />)
    await flushMicrotasks()
    expect(screen.queryByText(FALLBACK(label))).toBeNull()
    expect(control.evaluations[key]).toBe(1)
  })

  it('[REQ-309/AC-3] overlay-modal-lazy-open-translation', async ({ task }) => {
    task.meta.caseId = 'overlay-modal-lazy-open-translation'
    const { rerender } = render(
      <Overlay {...overlayProps({}, { promptTranslation: translationState(true) })} />
    )
    expect(screen.getByText(FALLBACK('プロンプト翻訳'))).toBeInTheDocument()

    await act(async () => { control.open() })
    await waitFor(() => expect(screen.queryByText(FALLBACK('プロンプト翻訳'))).toBeNull())

    rerender(<Overlay {...overlayProps({}, { promptTranslation: translationState(false) })} />)
    rerender(<Overlay {...overlayProps({}, { promptTranslation: translationState(true) })} />)
    await flushMicrotasks()
    expect(screen.queryByText(FALLBACK('プロンプト翻訳'))).toBeNull()
    expect(control.evaluations.translation).toBe(1)
  })

  it('[REQ-309/AC-3] overlay-modal-lazy-open-translation-empty-fixture', async ({ task }) => {
    task.meta.caseId = 'overlay-modal-lazy-open-translation-empty-fixture'
    render(<Overlay {...overlayProps({}, { promptTranslation: {} })} />)
    await flushMicrotasks()
    expect(screen.queryByText(FALLBACK('プロンプト翻訳'))).toBeNull()
    expect(control.evaluations.translation).toBe(0)
  })

  it('[REQ-309/AC-3] overlay-load-failure-local-alert', async ({ task }) => {
    task.meta.caseId = 'overlay-load-failure-local-alert'
    control.failures = new Set(['bypass', 'translation'])
    // The rejected chunk import is reported by jsdom as an uncaught error even when the boundary handles it.
    // Suppress only that expected event for this case.
    const swallowExpected = (event: ErrorEvent) => { event.preventDefault() }
    window.addEventListener('error', swallowExpected)
    try {
      render(
        <Overlay
          {...overlayProps(
            { isBypassSettingsOpen: true, showCopyModal: true, errorToast: { message: '保存できませんでした' } },
            { promptTranslation: translationState(true) }
          )}
        />
      )
      await act(async () => { control.open() })

      await waitFor(
        () => expect(screen.getByText(/バイパス設定を読み込めませんでした/)).toBeInTheDocument(),
        { timeout: 4000 }
      )
      await waitFor(
        () => expect(screen.getByText(/プロンプト翻訳を読み込めませんでした/)).toBeInTheDocument(),
        { timeout: 4000 }
      )
      expect(screen.getByText('新規プロファイル作成 (Add Set)')).toBeInTheDocument()
      expect(screen.getByText('保存できませんでした')).toBeInTheDocument()
    } finally {
      window.removeEventListener('error', swallowExpected)
    }
  })

  it('[REQ-309/AC-3] overlay-close-while-loading', async ({ task }) => {
    task.meta.caseId = 'overlay-close-while-loading'
    const { rerender } = render(<Overlay {...overlayProps({ isBypassSettingsOpen: true })} />)
    expect(screen.getByText(FALLBACK('バイパス設定'))).toBeInTheDocument()

    rerender(<Overlay {...overlayProps({ isBypassSettingsOpen: false })} />)
    expect(screen.queryByText(FALLBACK('バイパス設定'))).toBeNull()

    await act(async () => { control.open() })
    await flushMicrotasks()
    expect(screen.queryByText(FALLBACK('バイパス設定'))).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
