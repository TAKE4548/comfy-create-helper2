import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TranslationSettingsSection } from '../TranslationSettingsSection'
import { llmPromptsApi, settingsApi, translateApi } from '../../../../api/client'
import { VramGuardSection } from '../VramGuardSection'

vi.mock('../../../../api/client', () => ({
  llmPromptsApi: {
    list: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 1, key: 'test', content: 'val', updated_at: '2026-01-01T00:00:00Z' }),
  },
  translateApi: {
    getStats: vi.fn().mockResolvedValue({ cached_entries_count: 5 }),
    testConnection: vi.fn().mockResolvedValue({ success: true, sample_translation: '少女、美しい空' }),
    clearCache: vi.fn().mockResolvedValue({ count: 5 }),
  },
  settingsApi: { getVram: vi.fn(), updateVram: vi.fn() },
}))

describe('TranslationSettingsSection', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(llmPromptsApi.list).mockResolvedValue([
      { id: 1, key: 'translation_provider', content: 'google_cloud', updated_at: '2026-01-01T00:00:00Z' },
      { id: 2, key: 'translation_api_key', content: 'test-api-key', updated_at: '2026-01-01T00:00:00Z' },
      { id: 3, key: 'translation_api_url', content: 'https://custom.api.url', updated_at: '2026-01-01T00:00:00Z' },
    ])
    vi.mocked(settingsApi.getVram).mockResolvedValue({
      vram_min_free_gb: 4,
      vram_guard_enabled: true,
      vram_free_gb: 8,
      vram_total_gb: 12,
    })
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  it('renders correctly and loads existing translation settings', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Google Cloud Translation API')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Translation Settings/ }).querySelector('svg.lucide-chevron-down')).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses a decorative Lucide marker for the VRAM threshold instead of an arrow glyph', async () => {
    render(<QueryClientProvider client={queryClient}><VramGuardSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
    const threshold = screen.getByText(/閾値:/).closest('span')
    expect(threshold?.querySelector('svg.lucide-chevron-up')).toHaveAttribute('aria-hidden', 'true')
    expect(threshold).not.toHaveTextContent('▲')
  })

  it('saves settings with object payload { content: ... } on submit', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Google Cloud Translation API')).toBeInTheDocument()
    })

    // Switch to LLM provider
    const llmRadio = screen.getByLabelText(/ローカル LLM/i)
    fireEvent.click(llmRadio)

    // Click save button
    const saveButton = screen.getByRole('button', { name: /設定を保存/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_provider', { content: 'llm' })
      expect(llmPromptsApi.update).not.toHaveBeenCalledWith('translation_api_key', expect.anything())
      expect(llmPromptsApi.update).not.toHaveBeenCalledWith('translation_api_url', expect.anything())
    })
  })

  it('renders FuguMT option with recommended CPU badge', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('FuguMT')).toBeInTheDocument()
      expect(screen.getByText('推奨 (CPU)')).toBeInTheDocument()
    })
  })

  it('switches provider details immediately and keeps the LLM editor mounted while hidden', async () => {
    const view = render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )
    await screen.findByText('Google Cloud Translation API')
    expect(screen.getByPlaceholderText(/AIzaSy/i)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/ローカル LLM/i))
    expect(screen.queryByPlaceholderText(/AIzaSy/i)).toBeNull()
    expect(screen.getByLabelText(/ローカル LLM/i)).toBeChecked()

    fireEvent.click(screen.getByLabelText(/FuguMT/i))
    expect(screen.getByText(/完全オフライン/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/DeepL Auth Key/i)).toBeNull()
    expect(screen.getByText('翻訳用LLM詳細設定').parentElement?.parentElement?.querySelector('[hidden]')).not.toBeNull()
    view.unmount()
  })

  it('clamps and saves translation debounce in 50ms increments', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )
    await screen.findByText('Google Cloud Translation API')
    fireEvent.change(screen.getByLabelText('翻訳入力待ち時間'), { target: { value: '2040' } })
    await waitFor(() => {
      expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_debounce', { content: '2000' })
    })
    expect(screen.getByText('2000ms')).toBeInTheDocument()
  })

  it('preserves provider edits made while a save is in flight', async () => {
    let resolveSave: (() => void) | undefined
    vi.mocked(llmPromptsApi.update).mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = () => resolve({ id: 1, key: 'translation_provider', content: 'llm', updated_at: '2026-01-01T00:00:00Z' })
    }))
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )
    await screen.findByText('Google Cloud Translation API')
    fireEvent.click(screen.getByLabelText(/ローカル LLM/i))
    fireEvent.click(screen.getByRole('button', { name: /設定を保存/i }))
    await waitFor(() => expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_provider', { content: 'llm' }))

    fireEvent.click(screen.getByLabelText(/DeepL API/i))
    resolveSave?.()
    await waitFor(() => expect(screen.getByLabelText(/DeepL API/i)).toBeChecked())
    expect(screen.getByPlaceholderText(/xxxx-/i)).toBeInTheDocument()
    expect(screen.getByText(/設定を保存すると翻訳プレビュー/i)).toBeInTheDocument()
  })

  it('keeps hidden credential drafts without blocking a saved offline provider', async () => {
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await screen.findByText('Google Cloud Translation API')
    fireEvent.change(screen.getByPlaceholderText(/AIzaSy/i), { target: { value: 'draft-google-key' } })
    fireEvent.click(screen.getByLabelText(/FuguMT/i))
    fireEvent.click(screen.getByRole('button', { name: /設定を保存/i }))
    await waitFor(() => expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_provider', { content: 'fugumt' }))
    await waitFor(() => expect(screen.queryByText(/設定を保存すると翻訳プレビュー/i)).toBeNull())

    fireEvent.click(screen.getByLabelText(/Google Cloud Translation API/i))
    expect(screen.getByPlaceholderText(/AIzaSy/i)).toHaveValue('draft-google-key')
    expect(screen.getByText(/設定を保存すると翻訳プレビュー/i)).toBeInTheDocument()
  })

  it('does not hydrate clean provider state from a stale post-save refetch', async () => {
    let resolveStale: ((value: Awaited<ReturnType<typeof llmPromptsApi.list>>) => void) | undefined
    vi.mocked(llmPromptsApi.list)
      .mockResolvedValueOnce([{ id: 1, key: 'translation_provider', content: 'google_cloud', updated_at: '2026-01-01T00:00:00Z' }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await screen.findByText('Google Cloud Translation API')
    fireEvent.click(screen.getByLabelText(/ローカル LLM/i))
    fireEvent.click(screen.getByRole('button', { name: /設定を保存/i }))
    await waitFor(() => expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_provider', { content: 'llm' }))
    await waitFor(() => expect(llmPromptsApi.list).toHaveBeenCalledTimes(2))
    resolveStale?.([{ id: 1, key: 'translation_provider', content: 'google_cloud', updated_at: '2026-01-01T00:00:00Z' }])
    await waitFor(() => expect(screen.getByLabelText(/ローカル LLM/i)).toBeChecked())
  })

  it('hides API key and URL inputs and shows offline guidance when FuguMT is selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('FuguMT')).toBeInTheDocument()
    })

    const fuguRadio = screen.getByLabelText(/FuguMT/i)
    fireEvent.click(fuguRadio)

    expect(screen.queryByPlaceholderText(/AIzaSy/i)).toBeNull()
    expect(screen.getByText(/完全オフライン/i)).toBeInTheDocument()
  })

  it('saves settings with only translation_provider when FuguMT is selected', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('FuguMT')).toBeInTheDocument()
    })

    const fuguRadio = screen.getByLabelText(/FuguMT/i)
    fireEvent.click(fuguRadio)

    const saveButton = screen.getByRole('button', { name: /設定を保存/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_provider', { content: 'fugumt' })
      expect(llmPromptsApi.update).not.toHaveBeenCalledWith('translation_api_key', expect.anything())
      expect(llmPromptsApi.update).not.toHaveBeenCalledWith('translation_api_url', expect.anything())
    })
  })

  it('calls testConnection with only provider fugumt and displays result', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('FuguMT')).toBeInTheDocument()
    })

    const fuguRadio = screen.getByLabelText(/FuguMT/i)
    fireEvent.click(fuguRadio)

    const testButton = screen.getByRole('button', { name: /疎通テスト/i })
    fireEvent.click(testButton)

    await waitFor(() => {
      expect(translateApi.testConnection).toHaveBeenCalledWith({ provider: 'fugumt' })
      expect(screen.getByText('疎通テスト成功')).toBeInTheDocument()
      expect(screen.getByText(/少女、美しい空/i)).toBeInTheDocument()
    })
  })

  it('checks FuguMT radio by default when loaded from database', async () => {
    vi.mocked(llmPromptsApi.list).mockResolvedValueOnce([
      { id: 1, key: 'translation_provider', content: 'fugumt', updated_at: '2026-01-01T00:00:00Z' },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <TranslationSettingsSection isExpanded={true} onToggle={vi.fn()} />
      </QueryClientProvider>
    )

    await waitFor(() => {
      const fuguRadio = screen.getByLabelText(/FuguMT/i) as HTMLInputElement
      expect(fuguRadio.checked).toBe(true)
    })
  })

  it('tests the current unsaved credentials and displays the provider response without saving', async () => {
    vi.mocked(translateApi.testConnection).mockResolvedValueOnce({ success: true, sample_translation: '未保存キーでの翻訳' })
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByDisplayValue('test-api-key')).toBeInTheDocument())
    fireEvent.change(screen.getByDisplayValue('test-api-key'), { target: { value: 'draft-secret-value' } })
    fireEvent.change(screen.getByDisplayValue('https://custom.api.url'), { target: { value: 'https://draft.example' } })
    fireEvent.click(screen.getByRole('button', { name: /疎通テスト/i }))

    await waitFor(() => {
      expect(translateApi.testConnection).toHaveBeenCalledWith({ provider: 'google_cloud', api_key: 'draft-secret-value', api_url: 'https://draft.example' })
      expect(screen.getByText('疎通テスト成功')).toBeInTheDocument()
      expect(screen.getByText(/未保存キーでの翻訳/)).toBeInTheDocument()
    })
    expect(llmPromptsApi.update).not.toHaveBeenCalled()
  })

  it('displays the API connection failure reason', async () => {
    vi.mocked(translateApi.testConnection).mockResolvedValueOnce({ success: false, sample_translation: '', error: 'invalid credentials' })
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByText('Google Cloud Translation API')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /疎通テスト/i }))
    expect(await screen.findByText('疎通テスト失敗')).toBeInTheDocument()
    expect(screen.getByText('invalid credentials')).toBeInTheDocument()
  })

  it('ignores a connection response after provider changes and prevents duplicate requests', async () => {
    let resolveTest!: (result: { success: boolean; sample_translation: string }) => void
    vi.mocked(translateApi.testConnection).mockReturnValueOnce(new Promise((resolve) => { resolveTest = resolve }))
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByText('Google Cloud Translation API')).toBeInTheDocument())
    const testButton = screen.getByRole('button', { name: /疎通テスト/i })
    fireEvent.click(testButton)
    expect(testButton).toBeDisabled()
    fireEvent.click(testButton)
    expect(translateApi.testConnection).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText(/FuguMT/i))
    resolveTest({ success: true, sample_translation: 'stale secret result' })
    await waitFor(() => expect(screen.getByRole('button', { name: /疎通テスト/i })).toBeEnabled())
    expect(screen.queryByText(/stale secret result/)).toBeNull()
  })

  it('shows exact save success and preserves the draft with an unsaved reason after save failure', async () => {
    render(<QueryClientProvider client={queryClient}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByText('Google Cloud Translation API')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /設定を保存/i }))
    await waitFor(() => expect(screen.getByText(/設定を保存しました/)).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('test-api-key'), { target: { value: 'retryable-secret' } })
    vi.mocked(llmPromptsApi.update).mockRejectedValueOnce(new Error('provider unavailable'))
    fireEvent.click(screen.getByRole('button', { name: /設定を保存/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('provider unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(screen.getByDisplayValue('retryable-secret')).toBeInTheDocument()
    expect(screen.queryByText('設定を保存しました')).toBeNull()
  })
})
