import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { useGenerationStore } from '../../store/useGenerationStore'
import { speechTonePresetsApi } from '../../api/client'
import type { SpeechTonePreset } from '../../api/types'

const systemStatsSubscription = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))

vi.mock('../../hooks/useSystemStats', async () => {
  const React = await import('react')
  return {
    useSystemStats: () => {
      React.useEffect(() => {
        systemStatsSubscription.start()
        return () => systemStatsSubscription.stop()
      }, [])
    },
  }
})

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
  settingsApi: {
    getVram: vi.fn().mockResolvedValue({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 2, vram_total_gb: 12 }),
    updateVram: vi.fn().mockResolvedValue({}),
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
    useGenerationStore.setState({ systemStats: null })
    window.location.hash = '#dialogue'
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
        <BrowserRouter>
          <SettingsPage />
        </BrowserRouter>
      </QueryClientProvider>
    )
  }

  it('mounts all five tab panels and makes only the selected panel visible and focusable', async () => {
    window.location.hash = '#workflows'
    renderComponent()

    const tablist = screen.getByRole('tablist', { name: '設定カテゴリー' })
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(5)
    const workflows = document.getElementById('settings-panel-workflows')
    const prompt = document.getElementById('settings-panel-prompt')
    const dialogue = document.getElementById('settings-panel-dialogue')
    const translation = document.getElementById('settings-panel-translation')
    const system = document.getElementById('settings-panel-system')
    expect([workflows, prompt, dialogue, translation, system].every(Boolean)).toBe(true)
    expect(workflows).not.toHaveAttribute('hidden')
    expect(workflows).toHaveAttribute('tabindex', '0')
    for (const panel of [prompt, dialogue, translation, system]) {
      expect(panel).toHaveAttribute('hidden')
      expect(panel).toHaveAttribute('tabindex', '-1')
    }
  })

  it('retains an open tone preset draft when switching tabs', async () => {
    renderComponent()
    fireEvent.click(await screen.findByText('プリセット追加'))
    const nameInput = screen.getByPlaceholderText(/例: ツンデレ風/) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '未保存の口調' } })

    fireEvent.click(screen.getByRole('tab', { name: '翻訳' }))
    await waitFor(() => expect(window.location.hash).toBe('#translation'))
    fireEvent.click(screen.getByRole('tab', { name: 'セリフ支援' }))
    await waitFor(() => expect(window.location.hash).toBe('#dialogue'))

    expect(screen.getByPlaceholderText(/例: ツンデレ風/)).toHaveValue('未保存の口調')
    expect(screen.getByTestId('speech-tone-preset-modal')).toBeInTheDocument()
  })

  it('uses only v2 detail flags and preserves them across tab changes', async () => {
    localStorage.setItem('prompt-surgeon-settings-details-expanded-v2', JSON.stringify({ prompt: true, dialogue: false }))
    localStorage.setItem('prompt-surgeon-settings-sections-expanded', JSON.stringify({ prompts: false, speechTones: true }))
    window.location.hash = '#prompt'
    renderComponent()

    expect(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'セリフ支援' }))
    await waitFor(() => expect(window.location.hash).toBe('#dialogue'))
    expect(screen.getByRole('button', { name: 'セリフ生成の詳細設定' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('ignores malformed legacy and v2 disclosure data', () => {
    localStorage.setItem('prompt-surgeon-settings-sections-expanded', '{broken')
    localStorage.setItem('prompt-surgeon-settings-details-expanded-v2', '[]')
    window.location.hash = '#prompt'
    renderComponent()

    expect(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('preserves the exact legacy section-expansion value on mount and section toggle', () => {
    const legacySections = '{"prompts":false,"speechTones":true,"translation":false}'
    localStorage.setItem('prompt-surgeon-settings-sections-expanded', legacySections)
    window.location.hash = '#prompt'

    renderComponent()
    expect(localStorage.getItem('prompt-surgeon-settings-sections-expanded')).toBe(legacySections)

    fireEvent.click(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' }))
    expect(localStorage.getItem('prompt-surgeon-settings-sections-expanded')).toBe(legacySections)
  })

  it('keeps the settings page usable when browser storage access is denied', () => {
    const denied = () => {
      throw new DOMException('Storage access denied', 'SecurityError')
    }
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    try {
      expect(() => renderComponent()).not.toThrow()
      expect(screen.getByRole('tablist', { name: '設定カテゴリー' })).toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  it('subscribes to system stats for the page lifetime and cleans up on unmount', async () => {
    window.location.hash = '#workflows'
    const { unmount } = renderComponent()
    await waitFor(() => expect(systemStatsSubscription.start).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('tab', { name: 'システム・一般' }))
    await waitFor(() => expect(window.location.hash).toBe('#system'))
    expect(systemStatsSubscription.start).toHaveBeenCalledTimes(1)
    expect(systemStatsSubscription.stop).not.toHaveBeenCalled()
    act(() => useGenerationStore.getState().setSystemStats({
      cpu_pct: 10,
      ram_used_gb: 4,
      ram_total_gb: 16,
      ram_pct: 25,
      gpu_pct: 20,
      vram_used_gb: 3,
      vram_total_gb: 12,
      vram_pct: 25,
      ts: Date.now(),
    }))
    expect(await screen.findByText('9.0 GB')).toBeInTheDocument()
    unmount()
    expect(systemStatsSubscription.stop).toHaveBeenCalledTimes(1)
  })

  it('shows speech tone presets by default and allows collapsing the section', async () => {
    renderComponent()
    const dialoguePanel = screen.getByRole('tabpanel', { name: 'セリフ支援' })

    expect(screen.getByText('セリフ口調プリセット設定')).toBeDefined()

    await waitFor(() => {
      expect(within(dialoguePanel).getByText('ツンデレ風', { exact: true })).toBeDefined()
      expect(within(dialoguePanel).getByText('お嬢様風', { exact: true })).toBeDefined()
      expect(within(dialoguePanel).getAllByText('ツンデレ口調', { exact: true })).toHaveLength(2)
    })

    fireEvent.click(screen.getByText('セリフ口調プリセット設定'))
    await waitFor(() => expect(within(dialoguePanel).queryByText('ツンデレ風', { exact: true })).not.toBeInTheDocument())
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
    fireEvent.click(within(screen.getByTestId('speech-tone-preset-modal')).getByRole('button', { name: '保存' }))

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
    const dialoguePanel = screen.getByRole('tabpanel', { name: 'セリフ支援' })

    await waitFor(() => {
      expect(within(dialoguePanel).getByText('ツンデレ風', { exact: true })).toBeDefined()
    })

    // Click edit button for first preset
    const editButtons = within(dialoguePanel).getAllByTitle('編集')
    fireEvent.click(editButtons[0])

    expect(screen.getByTestId('speech-tone-preset-modal')).toBeDefined()
    expect(screen.getByText('口調プリセット編集')).toBeDefined()

    const nameInput = screen.getByPlaceholderText(/例: ツンデレ風/) as HTMLInputElement
    expect(nameInput.value).toBe('ツンデレ風')

    fireEvent.change(nameInput, { target: { value: 'ツンデレ改' } })
    const promptInput = screen.getByPlaceholderText(/例: ツンデレな口調で/)
    fireEvent.change(promptInput, { target: { value: 'さらにツンデレな口調で' } })

    fireEvent.click(within(screen.getByTestId('speech-tone-preset-modal')).getByRole('button', { name: '保存' }))

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

  it('cancels inline tone preset confirmation without mutation and deletes only after explicit confirmation', async () => {
    vi.mocked(speechTonePresetsApi.delete).mockResolvedValue(undefined)

    renderComponent()
    const dialoguePanel = screen.getByRole('tabpanel', { name: 'セリフ支援' })

    await waitFor(() => {
      expect(within(dialoguePanel).getByText('ツンデレ風', { exact: true })).toBeDefined()
    })

    const clickPresetDelete = () => fireEvent.click(within(dialoguePanel).getAllByTitle('削除')[0])
    clickPresetDelete()
    expect(within(dialoguePanel).getByText('「ツンデレ風」を削除しますか？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(speechTonePresetsApi.delete).not.toHaveBeenCalled()
    expect(within(dialoguePanel).getAllByText('ツンデレ口調', { exact: true })).toHaveLength(2)

    clickPresetDelete()
    await waitFor(() => {
      expect(within(dialoguePanel).getByText('「ツンデレ風」を削除しますか？')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: '削除を確認' }))
    await waitFor(() => {
      expect(speechTonePresetsApi.delete).toHaveBeenCalledWith(1)
    })
    expect(speechTonePresetsApi.delete).toHaveBeenCalledTimes(1)
  })
})
