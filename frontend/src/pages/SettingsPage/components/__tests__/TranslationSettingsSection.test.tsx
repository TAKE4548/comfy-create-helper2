import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TranslationSettingsSection } from '../TranslationSettingsSection'
import { llmPromptsApi, translateApi } from '../../../../api/client'

vi.mock('../../../../api/client', () => ({
  llmPromptsApi: {
    list: vi.fn().mockResolvedValue([
      { id: 1, key: 'translation_provider', content: 'google_cloud', updated_at: '2026-01-01T00:00:00Z' },
      { id: 2, key: 'translation_api_key', content: 'test-api-key', updated_at: '2026-01-01T00:00:00Z' },
      { id: 3, key: 'translation_api_url', content: 'https://custom.api.url', updated_at: '2026-01-01T00:00:00Z' },
    ]),
    update: vi.fn().mockResolvedValue({ id: 1, key: 'test', content: 'val', updated_at: '2026-01-01T00:00:00Z' }),
  },
  translateApi: {
    getStats: vi.fn().mockResolvedValue({ cached_entries_count: 5 }),
    testConnection: vi.fn().mockResolvedValue({ success: true, sample_translation: 'テスト' }),
    clearCache: vi.fn().mockResolvedValue({ count: 5 }),
  },
}))

describe('TranslationSettingsSection', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
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
      expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_api_key', { content: 'test-api-key' })
      expect(llmPromptsApi.update).toHaveBeenCalledWith('translation_api_url', { content: 'https://custom.api.url' })
    })
  })
})
