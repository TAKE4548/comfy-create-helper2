import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from '../SettingsPage'
import { speechTonePresetsApi } from '../../api/client'
import type { SpeechTonePreset } from '../../api/types'

vi.mock('../../api/client', () => ({
  llmPromptsApi: {
    list: vi.fn().mockResolvedValue([]),
    getModels: vi.fn().mockResolvedValue(['model-a', 'model-b']),
    getCurrentModel: vi.fn().mockResolvedValue({ key: 'llm_current_model', content: 'model-a' }),
    updateCurrentModel: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  configApi: {
    get: vi.fn().mockResolvedValue({ comfy_url: 'http://localhost:8188' }),
  },
  mappingMastersApi: {
    list: vi.fn().mockResolvedValue([]),
    getUsages: vi.fn().mockResolvedValue({ usages: [] }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    reorder: vi.fn().mockResolvedValue([]),
  },
  workflowsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ mappings: [] }),
    update: vi.fn().mockResolvedValue({}),
    copy: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  workflowPresetsApi: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
    reorder: vi.fn().mockResolvedValue([]),
  },
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  paramTypeMastersApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  speechTonePresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    rewrite: vi.fn(),
  },
  translateApi: {
    translatePrompt: vi.fn().mockResolvedValue({ translated_prompt: '', meta: { total_chunks: 0, cached_chunks: 0, api_requested_chunks: 0, billed_characters: 0, provider: 'google_cloud' } }),
    testConnection: vi.fn().mockResolvedValue({ success: true, sample_translation: 'テスト' }),
    getStats: vi.fn().mockResolvedValue({ cached_entries_count: 0 }),
    clearCache: vi.fn().mockResolvedValue({ message: 'OK', cleared_count: 0 }),
  },
}))

vi.mock('../../hooks/useComfyWebSocket', () => ({
  resolveComfyUrl: (url: string) => url,
  useComfyWebSocket: () => ({ status: 'connected' }),
}))

vi.mock('../SettingsPage/components/BaseModelSection', () => ({
  BaseModelSection: () => <div data-testid="base-model-section">BaseModelSection</div>,
}))

describe('SettingsPage - Speech Tone Presets', () => {
  let queryClient: QueryClient

  const mockTonePresets: SpeechTonePreset[] = [
    {
      id: 1,
      name: 'ツンデレ風',
      prompt: 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
      description: 'ツンデレ口調',
      sort_order: 0,
      created_at: '2026-08-20T00:00:00Z',
    },
    {
      id: 2,
      name: 'お嬢様風',
      prompt: '上品なお嬢様言葉で「〜ですわ」をつけて。',
      description: 'お嬢様口調',
      sort_order: 1,
      created_at: '2026-08-20T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.mocked(speechTonePresetsApi.list).mockResolvedValue(mockTonePresets)
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    )
  }

  it('renders speech tone presets section and lists presets upon expanding', async () => {
    renderComponent()

    expect(screen.getByText('セリフ口調プリセット設定')).toBeDefined()

    // Expand section
    fireEvent.click(screen.getByText('セリフ口調プリセット設定'))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
      expect(screen.getByText('お嬢様風')).toBeDefined()
      expect(screen.getByText('ツンデレ口調')).toBeDefined()
    })
  })

  it('opens create modal, fills form and submits new tone preset', async () => {
    const newPreset: SpeechTonePreset = {
      id: 3,
      name: '武士風',
      prompt: '〜でござる口調で',
      description: '武士',
      sort_order: 2,
      created_at: '2026-08-23T00:00:00Z',
    }
    vi.mocked(speechTonePresetsApi.create).mockResolvedValue(newPreset)

    renderComponent()

    // Click Add Preset button
    const addBtn = screen.getByText('プリセット追加')
    fireEvent.click(addBtn)

    expect(screen.getByTestId('speech-tone-preset-modal')).toBeDefined()
    expect(screen.getByText('新規口調プリセット作成')).toBeDefined()

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/例: ツンデレ風/), {
      target: { value: '武士風' },
    })
    fireEvent.change(screen.getByPlaceholderText(/例: ツンデレな口調で/), {
      target: { value: '〜でござる口調で' },
    })
    fireEvent.change(screen.getByPlaceholderText(/例: キャラクターAの標準的な口調/), {
      target: { value: '武士' },
    })

    // Submit
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(speechTonePresetsApi.create).toHaveBeenCalledWith({
        name: '武士風',
        prompt: '〜でござる口調で',
        description: '武士',
        sort_order: 0,
      })
      expect(screen.queryByTestId('speech-tone-preset-modal')).toBeNull()
    })
  })

  it('opens edit modal and updates existing tone preset', async () => {
    const updatedPreset: SpeechTonePreset = {
      ...mockTonePresets[0],
      name: 'ツンデレ改',
      prompt: 'さらにツンデレな口調で',
    }
    vi.mocked(speechTonePresetsApi.update).mockResolvedValue(updatedPreset)

    renderComponent()
    fireEvent.click(screen.getByText('セリフ口調プリセット設定'))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    // Click edit button for first preset
    const editButtons = screen.getAllByTitle('編集')
    fireEvent.click(editButtons[0])

    expect(screen.getByTestId('speech-tone-preset-modal')).toBeDefined()
    expect(screen.getByText('口調プリセット編集')).toBeDefined()

    const nameInput = screen.getByPlaceholderText(/例: ツンデレ風/) as HTMLInputElement
    expect(nameInput.value).toBe('ツンデレ風')

    fireEvent.change(nameInput, { target: { value: 'ツンデレ改' } })
    const promptInput = screen.getByPlaceholderText(/例: ツンデレな口調で/)
    fireEvent.change(promptInput, { target: { value: 'さらにツンデレな口調で' } })

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(speechTonePresetsApi.update).toHaveBeenCalledWith(1, {
        name: 'ツンデレ改',
        prompt: 'さらにツンデレな口調で',
        description: 'ツンデレ口調',
        sort_order: 0,
      })
      expect(screen.queryByTestId('speech-tone-preset-modal')).toBeNull()
    })
  })

  it('deletes tone preset upon confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(speechTonePresetsApi.delete).mockResolvedValue(undefined)

    renderComponent()
    fireEvent.click(screen.getByText('セリフ口調プリセット設定'))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    const deleteButtons = screen.getAllByTitle('削除')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('口調プリセット「ツンデレ風」を削除しますか？')
      expect(speechTonePresetsApi.delete).toHaveBeenCalledWith(1)
    })
  })
})
