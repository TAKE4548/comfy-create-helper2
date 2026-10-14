import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DictionaryPanel } from '../DictionaryPanel'
import { TranslationSettingsSection } from '../TranslationSettingsSection'

const api = vi.hoisted(() => ({
  llmPromptsApi: { list: vi.fn(), update: vi.fn() },
  translateApi: { getStats: vi.fn(), testConnection: vi.fn(), clearCache: vi.fn(), getDictionary: vi.fn(), saveDictionary: vi.fn() },
}))

vi.mock('../../../../api/client', () => api)
vi.mock('../TranslationPreviewCard', () => ({ TranslationPreviewCard: () => null }))
vi.mock('../LlmSettingsSection', () => ({ LlmSettingsSection: () => null }))

const initial = { rules: [{ source: 'old', replacement: '古い' }] }

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><DictionaryPanel /></QueryClientProvider>)
}

describe('DictionaryPanel REQ-334', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.llmPromptsApi.list.mockResolvedValue([])
    api.llmPromptsApi.update.mockResolvedValue(undefined)
    api.translateApi.getStats.mockResolvedValue({ cached_entries_count: 0 })
    api.translateApi.testConnection.mockResolvedValue({ success: true, sample_translation: 'OK' })
    api.translateApi.clearCache.mockResolvedValue({ count: 0 })
    api.translateApi.getDictionary.mockResolvedValue(initial)
    api.translateApi.saveDictionary.mockImplementation(async (rules) => ({ rules }))
  })
  afterEach(() => cleanup())

  it('loads, adds, and edits rules by persisting the complete list', async () => {
    renderPanel()
    await screen.findByText('old')
    fireEvent.change(screen.getByLabelText('置換前'), { target: { value: 'Mythra' } })
    fireEvent.change(screen.getByLabelText('置換後'), { target: { value: 'ミスラ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ルールを追加' }))
    await waitFor(() => expect(api.translateApi.saveDictionary).toHaveBeenCalledWith([
      { source: 'old', replacement: '古い' }, { source: 'Mythra', replacement: 'ミスラ' },
    ]))
    expect(await screen.findByRole('status')).toHaveTextContent('設定を保存しました')

    fireEvent.click(screen.getAllByRole('button', { name: '編集' })[1])
    fireEvent.change(screen.getByLabelText('置換後'), { target: { value: 'ミスラ改' } })
    fireEvent.click(screen.getByRole('button', { name: '変更を保存' }))
    await waitFor(() => expect(api.translateApi.saveDictionary).toHaveBeenLastCalledWith([
      { source: 'old', replacement: '古い' }, { source: 'Mythra', replacement: 'ミスラ改' },
    ]))
  })

  it('requires inline delete confirmation and saves only after confirming', async () => {
    renderPanel()
    await screen.findByText('old')
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(screen.getByText('「old」を削除しますか？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(api.translateApi.saveDictionary).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除を確定' }))
    await waitFor(() => expect(api.translateApi.saveDictionary).toHaveBeenCalledWith([]))
  })

  it('keeps draft fields and shows the failure reason when full-list persistence fails', async () => {
    renderPanel()
    await screen.findByText('old')
    fireEvent.change(screen.getByLabelText('置換前'), { target: { value: 'draft term' } })
    fireEvent.change(screen.getByLabelText('置換後'), { target: { value: 'draft value' } })
    api.translateApi.saveDictionary.mockRejectedValueOnce(new Error('dictionary unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'ルールを追加' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('dictionary unavailable')
    expect(screen.getByLabelText('置換前')).toHaveValue('draft term')
    expect(screen.getByLabelText('置換後')).toHaveValue('draft value')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
  })

  it('mounts in the actual Translation Settings section', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><TranslationSettingsSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
    expect(await screen.findByRole('region', { name: '翻訳置換辞書' })).toBeInTheDocument()
  })
})
