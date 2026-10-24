import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../../SettingsPage'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VramGuardSection } from '../components/VramGuardSection'
import { WorkflowConnectionSection } from '../components/WorkflowConnectionSection'
import { useGenerationStore } from '../../../store/useGenerationStore'
import {
  llmPromptsApi,
  configApi,
  settingsApi,
  mappingMastersApi,
  workflowsApi,
  workflowPresetsApi,
  snapshotsApi,
  paramTypeMastersApi,
  speechTonePresetsApi,
  translateApi,
  baseModelsApi,
} from '../../../api/client'
import { stageMastersApi } from '../../../api/domains/stageMasters'
import type { SpeechTonePreset, LlmPrompt } from '../../../api/types'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import {
  resetTestStore,
  createTestQueryClient,
  setupNetworkGuard,
  teardownNetworkGuard,
  MockWebSocketController,
} from '../../../test/utils'

const systemStatsSubscription = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))

vi.mock('../../../hooks/useSystemStats', async () => {
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

vi.mock('../../../api/domains/stageMasters', () => ({
  stageMastersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../../../hooks/useConfig', () => ({
  useConfig: () => ({ data: { comfy_url: 'http://localhost:8188' } }),
}))

vi.mock('../../../hooks/useComfyWebSocket', () => ({
  resolveComfyUrl: (url: string) => url,
  useComfyWebSocket: () => ({ status: 'connected' }),
}))

vi.mock('../components/BaseModelSection', () => ({
  BaseModelSection: () => <div data-testid="base-model-section">BaseModelSection</div>,
}))

vi.mock('../../../api/client', () => ({
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
    getHistoryStatus: vi.fn().mockResolvedValue({ has_rollback: false }),
    diffAnalyze: vi.fn(),
    rollback: vi.fn(),
  },
  workflowPresetsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn(),
    reorder: vi.fn().mockResolvedValue([]),
  },
  snapshotsApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    restore: vi.fn(),
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
  baseModelsApi: {
    list: vi.fn().mockResolvedValue([{ id: 1, name: 'Model A' }, { id: 2, name: 'Model B' }]),
  },
}))

const promptFixture: LlmPrompt = {
  id: 1,
  key: 'audit_interference',
  content: 'Original prompt',
  description: 'Prompt helper',
  updated_at: '2026-01-01T00:00:00Z',
}
const modelFixture: LlmPrompt = {
  id: 2,
  key: 'llm_model',
  content: 'model-a',
  description: null,
  updated_at: '2026-01-01T00:00:00Z',
}

const initialVramSettings = {
  vram_min_free_gb: 4,
  vram_guard_enabled: true,
  vram_free_gb: 8,
  vram_total_gb: 12,
}

const stageWorkflow = (target = 1, id = 7, roughNode = 'B') => ({
  id,
  name: id === 7 ? 'Workflow' : 'Other Workflow',
  created_at: '2026-01-01',
  json_body: {
    nodes: {
      A: { class_type: 'KSampler', title: 'Main sampler' },
      B: { class_type: 'KSampler', title: 'Rough sampler' },
      C: { class_type: 'KSampler', title: 'Rough sampler C' },
      D: { class_type: 'KSampler', title: 'Rough sampler D' },
    },
  },
  mappings: [
    { master_id: 1, node_id: 'A', variant_id: 11 },
    { master_id: 1, node_id: roughNode, variant_id: 12 },
  ],
  target_base_model_id: target,
  default_applied_assets: null,
})

const stageSectionProps = {
  group: 'workflows' as const,
  isExpandedLongPress: false,
  onToggleLongPress: vi.fn(),
  isExpandedWorkflows: true,
  onToggleWorkflows: vi.fn(),
  isExpandedConnections: false,
  onToggleConnections: vi.fn(),
  showConnections: false,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('SettingsPage Integration', () => {
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
    setupNetworkGuard()
    MockWebSocketController.install()
    vi.clearAllMocks()
    localStorage.clear()
    resetTestStore({ systemStats: null })
    window.location.hash = '#dialogue'
    queryClient = createTestQueryClient({ gcTime: 1000 * 60 * 5 })
    vi.mocked(speechTonePresetsApi.list).mockResolvedValue(mockTonePresets)
    vi.mocked(llmPromptsApi.list).mockResolvedValue([promptFixture])
    vi.mocked(llmPromptsApi.getModels).mockResolvedValue(['model-a'])
    vi.mocked(llmPromptsApi.getCurrentModel).mockResolvedValue(modelFixture)
    vi.mocked(llmPromptsApi.update).mockResolvedValue(promptFixture)
    vi.mocked(llmPromptsApi.updateCurrentModel).mockResolvedValue(modelFixture)
    vi.mocked(settingsApi.getVram).mockResolvedValue(initialVramSettings)
    vi.mocked(settingsApi.updateVram).mockReset()
  })

  afterEach(() => {
    teardownNetworkGuard()
    MockWebSocketController.uninstall()
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

  describe('Tab Navigation & Shell (REQ-291)', () => {
    it('[REQ-291/AC-1] mounts all five tab panels and makes only the selected panel visible and focusable', async () => {
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

    it('[REQ-381/AC-2] applies mobile density only to explicit Settings shell and Base Model wrappers', () => {
      window.location.hash = '#workflows'
      renderComponent()

      const shell = screen.getByTestId('settings-page-shell')
      const content = screen.getByTestId('settings-content-container').parentElement
      const baseModel = screen.getByTestId('settings-card-basemodel')
      expect(shell.className).toContain('gap-3')
      expect(shell.className).toContain('md:gap-6')
      expect(content?.className).toContain('p-3')
      expect(content?.className).toContain('md:p-5')
      expect(content?.className).toContain('touch-pan-y')
      expect(content?.className).toContain('md:touch-auto')
      expect(document.getElementById('settings-panel-workflows')?.className).toContain('space-y-3')
      expect(document.getElementById('settings-panel-workflows')?.className).toContain('md:space-y-6')
      expect(baseModel.className).toContain('settings-density-basemodel')
    })

    it('[REQ-291/AC-2] retains an open tone preset draft when switching tabs', async () => {
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

    it('[REQ-291/AC-3] uses only v2 detail flags and preserves them across tab changes', async () => {
      localStorage.setItem('prompt-surgeon-settings-details-expanded-v2', JSON.stringify({ prompt: true, dialogue: false }))
      localStorage.setItem('prompt-surgeon-settings-sections-expanded', JSON.stringify({ prompts: false, speechTones: true }))
      window.location.hash = '#prompt'
      renderComponent()

      expect(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(screen.getByRole('tab', { name: 'セリフ支援' }))
      await waitFor(() => expect(window.location.hash).toBe('#dialogue'))
      expect(screen.getByRole('button', { name: 'セリフ生成の詳細設定' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('[REQ-291/AC-4] ignores malformed legacy and v2 disclosure data', () => {
      localStorage.setItem('prompt-surgeon-settings-sections-expanded', '{broken')
      localStorage.setItem('prompt-surgeon-settings-details-expanded-v2', '[]')
      window.location.hash = '#prompt'
      renderComponent()

      expect(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('[REQ-291/AC-5] preserves the exact legacy section-expansion value on mount and section toggle', () => {
      const legacySections = '{"prompts":false,"speechTones":true,"translation":false}'
      localStorage.setItem('prompt-surgeon-settings-sections-expanded', legacySections)
      window.location.hash = '#prompt'

      renderComponent()
      expect(localStorage.getItem('prompt-surgeon-settings-sections-expanded')).toBe(legacySections)

      fireEvent.click(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' }))
      expect(localStorage.getItem('prompt-surgeon-settings-sections-expanded')).toBe(legacySections)
    })

    it('[REQ-291/AC-6] keeps the settings page usable when browser storage access is denied', () => {
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

    it('[REQ-291/AC-7] subscribes to system stats for the page lifetime and cleans up on unmount', async () => {
      window.location.hash = '#workflows'
      const { unmount } = renderComponent()
      await waitFor(() => expect(systemStatsSubscription.start).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getByRole('tab', { name: 'システム・一般' }))
      await waitFor(() => expect(window.location.hash).toBe('#system'))
      expect(systemStatsSubscription.start).toHaveBeenCalledTimes(1)
      expect(systemStatsSubscription.stop).not.toHaveBeenCalled()
      act(() => useGenerationStore.getState().setSystemWsConnected(true))
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
  })

  describe('Adaptive Dual-Pane & Mobile CSS Contract (REQ-365)', () => {
    it('[REQ-365/AC-1] renders workflows tab as a dual-pane grid with WF/Base left and Mapping right at xl', () => {
      window.location.hash = '#workflows'
      renderComponent()
      const grid = screen.getByTestId('settings-workflows-grid')
      expect(grid).toHaveClass('xl:grid-cols-2', 'xl:grid-rows-[auto_1fr]', 'items-start')
      expect(screen.getByTestId('settings-card-workflow')).toHaveClass('xl:col-start-1', 'xl:row-start-1')
      expect(screen.getByTestId('settings-card-basemodel')).toHaveClass('xl:col-start-1', 'xl:row-start-2')
      expect(screen.getByTestId('settings-card-mapping')).toHaveClass('xl:col-start-2', 'xl:row-span-2')
    })

    it('[REQ-365/AC-1] orders cards workflow, mapping, base model below xl', () => {
      window.location.hash = '#workflows'
      renderComponent()
      expect(screen.getByTestId('settings-card-workflow')).toHaveClass('order-1')
      expect(screen.getByTestId('settings-card-mapping')).toHaveClass('order-2')
      expect(screen.getByTestId('settings-card-basemodel')).toHaveClass('order-3')
    })

    it('[REQ-365/AC-2] keeps bottom-nav safe padding below md and releases it from md', () => {
      renderComponent()
      const container = screen.getByTestId('settings-content-container')
      const scroller = container.parentElement as HTMLElement
      expect(scroller).toHaveClass('pb-[calc(6rem+env(safe-area-inset-bottom))]', 'md:pb-5')
      expect(scroller).not.toHaveClass('lg:pb-5')
      expect(container).toHaveClass('max-w-7xl')
    })

    it('[REQ-365/AC-3] ships the mobile card and table CSS contract', () => {
      const css = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage/SettingsResponsive.css'), 'utf-8')
      for (const token of [
        '.settings-mobile-card',
        '__target-node',
        "td[data-cell='target-node']",
        '@media (max-width: 767px)',
        'grid-template-areas',
      ]) {
        expect(css).toContain(token)
      }
      expect(css).not.toContain(`100${'vh'}`)
      expect(css.match(/!important/g) ?? []).toHaveLength(1)
    })

    it('[REQ-365/AC-9] SettingsResponsive.css no longer shrinks role=dialog elements', () => {
      const css = readFileSync(resolve(process.cwd(), 'src/pages/SettingsPage/SettingsResponsive.css'), 'utf-8')
      expect(css).not.toContain('85dvh')
      expect(css).not.toMatch(/\[role='dialog'\]\s*\{[^}]*max-height/)
    })
  })

  describe('Speech Tone Presets (REQ-286)', () => {
    it('[REQ-286/AC-1] shows speech tone presets by default and allows collapsing the section', async () => {
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

    it('[REQ-286/AC-2] opens create modal, fills form and submits new tone preset', async () => {
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

    it('[REQ-286/AC-3] opens edit modal and updates existing tone preset', async () => {
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

    it('[REQ-286/AC-4] cancels inline tone preset confirmation without mutation and deletes only after explicit confirmation', async () => {
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

  describe('Hash Routing & Prompt Draft Persistence (REQ-314)', () => {
    it('[REQ-314/AC-1] keeps hash as the selected-tab source and synchronizes tab history and storage', async () => {
      localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, 'system')
      window.history.replaceState({}, '', '/settings#prompt')
      renderComponent()

      const promptTab = screen.getByRole('tab', { name: 'プロンプト支援' })
      expect(promptTab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tabpanel', { name: 'プロンプト支援' })).toBeTruthy()
      await waitFor(() => expect(localStorage.getItem(LS_KEYS.SETTINGS_ACTIVE_TAB)).toBe('prompt'))

      fireEvent.click(screen.getByRole('tab', { name: 'セリフ支援' }))
      await waitFor(() => expect(window.location.hash).toBe('#dialogue'))
      await waitFor(() => expect(localStorage.getItem(LS_KEYS.SETTINGS_ACTIVE_TAB)).toBe('dialogue'))

      window.history.back()
      await waitFor(() => expect(screen.getByRole('tab', { name: 'プロンプト支援' })).toHaveAttribute('aria-selected', 'true'))
      window.history.forward()
      await waitFor(() => expect(screen.getByRole('tab', { name: 'セリフ支援' })).toHaveAttribute('aria-selected', 'true'))
    })

    it('[REQ-314/AC-2] starts prompt details closed and keeps an unsaved prompt edit across tab navigation', async () => {
      window.history.replaceState({}, '', '/settings#prompt')
      renderComponent()
      const details = screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })
      expect(details).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(details)

      expect(await screen.findByTestId('prompt-unified-editor')).toBeInTheDocument()
      const editor = await screen.findByDisplayValue('Original prompt')
      fireEvent.change(editor, { target: { value: 'Unsaved page draft' } })

      fireEvent.click(screen.getByRole('tab', { name: 'セリフ支援' }))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'セリフ支援' })).toHaveAttribute('aria-selected', 'true'))
      fireEvent.click(screen.getByRole('tab', { name: 'プロンプト支援' }))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'プロンプト支援' })).toHaveAttribute('aria-selected', 'true'))

      expect(screen.getByDisplayValue('Unsaved page draft')).toBeInTheDocument()
      expect(llmPromptsApi.update).not.toHaveBeenCalled()
    })
  })

  describe('VRAM Guard & Display Operations (REQ-334)', () => {
    it('[REQ-334/AC-1] keeps VRAM and thumbnail ratio under separate section headings', () => {
      render(
        <MemoryRouter initialEntries={['/settings#system']}>
          <QueryClientProvider client={queryClient}>
            <SettingsPage />
          </QueryClientProvider>
        </MemoryRouter>
      )
      expect(screen.getByRole('heading', { name: 'VRAM安全ガード設定' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '表示と操作' })).toBeInTheDocument()
      expect(screen.getByTestId('thumbnail-settings-section')).toBeInTheDocument()
    })

    it('[REQ-334/AC-2] shows success only after save resolves and reports the exact success message', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <VramGuardSection isExpanded onToggle={vi.fn()} />
        </QueryClientProvider>
      )
      await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
      vi.mocked(settingsApi.updateVram).mockResolvedValue({ ...initialVramSettings, vram_min_free_gb: 5 })
      fireEvent.change(screen.getByLabelText('最小必要空き容量 (vram_min_free_gb)'), { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
      expect(screen.queryByText('設定を保存しました')).not.toBeInTheDocument()
      expect(await screen.findByText('設定を保存しました')).toBeInTheDocument()
      expect(settingsApi.updateVram).toHaveBeenCalledWith({ vram_min_free_gb: 5, vram_guard_enabled: true })
    })

    it('[REQ-334/AC-3] preserves a failed draft across query refresh and shows the reason and unsaved state', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <VramGuardSection isExpanded onToggle={vi.fn()} />
        </QueryClientProvider>
      )
      const input = await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
      fireEvent.change(input, { target: { value: '6' } })
      queryClient.setQueryData(['settings-vram'], { ...initialVramSettings, vram_min_free_gb: 9 })
      expect(input).toHaveValue(6)

      vi.mocked(settingsApi.updateVram).mockRejectedValue(new Error('保存先に接続できません'))
      fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('保存先に接続できません')
      expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
      expect(screen.getByRole('status')).toHaveTextContent('未保存')
      expect(input).toHaveValue(6)
    })

    it('[REQ-334/AC-4] does not let an older in-flight save overwrite a newer draft', async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <VramGuardSection isExpanded onToggle={vi.fn()} />
        </QueryClientProvider>
      )
      const input = await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
      let resolveSave!: (value: typeof initialVramSettings) => void
      vi.mocked(settingsApi.updateVram).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
      fireEvent.change(input, { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
      await waitFor(() => expect(resolveSave).toBeTypeOf('function'))
      fireEvent.change(input, { target: { value: '6' } })
      await act(async () => {
        resolveSave({ ...initialVramSettings, vram_min_free_gb: 5 })
        await Promise.resolve()
      })
      expect(screen.queryByText('設定を保存しました')).not.toBeInTheDocument()
      expect(input).toHaveValue(6)
      expect(screen.getByRole('status')).toHaveTextContent('未保存')
    })
  })

  describe('Workflow Connection Stage Groups & Draft Session (REQ-347)', () => {
    beforeEach(() => {
      vi.mocked(mappingMastersApi.list).mockResolvedValue([{
        id: 1,
        group_id: null,
        base_key: 'steps',
        name: 'Steps',
        param_name: 'steps',
        input_type: 'int',
        expected_class_types: null,
        base_title_patterns: null,
        sort_order: 1,
        variants: [
          { id: 11, master_id: 1, stage_id: 1, stage_key: 'main', stage_name: 'Main', stage_suffix: '', custom_role_override: null, computed_role: 'Steps', extra_title_patterns: null, is_enabled: true },
          { id: 12, master_id: 1, stage_id: 2, stage_key: 'rough', stage_name: 'Rough', stage_suffix: 'Rough', custom_role_override: null, computed_role: 'Rough Steps', extra_title_patterns: null, is_enabled: true },
        ],
      }])
      vi.mocked(stageMastersApi.list).mockResolvedValue([
        { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
        { id: 2, key: 'rough', name: 'Rough', suffix: 'Rough', search_keywords: ['rough'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 2 },
      ])
      vi.mocked(workflowsApi.list).mockResolvedValue([{ id: 7, name: 'Workflow', created_at: '2026-01-01' } as any])
      vi.mocked(workflowsApi.get).mockResolvedValue(stageWorkflow() as any)
      vi.mocked(workflowsApi.update).mockResolvedValue(stageWorkflow() as any)
    })

    const mountWorkflowConnection = () => {
      return render(
        <QueryClientProvider client={queryClient}>
          <WorkflowConnectionSection {...stageSectionProps} />
        </QueryClientProvider>
      )
    }

    const openSettings = async () => {
      fireEvent.click(await screen.findByRole('button', { name: '対応付け・設定' }))
      await screen.findByRole('heading', { name: 'Workflow の対応付け' })
    }

    it('[REQ-347/AC-1] keeps a re-edited draft when the previous save and its refetch finish, then saves the latest value', async () => {
      const firstSave = deferred<unknown>()
      vi.mocked(workflowsApi.update).mockReturnValueOnce(firstSave.promise as any).mockResolvedValueOnce(stageWorkflow(2) as any)
      vi.mocked(workflowsApi.get).mockResolvedValue(stageWorkflow(1) as any)
      mountWorkflowConnection()
      await openSettings()
      const mainNode = await screen.findByRole('combobox', { name: /Main .*のノード/ })
      const roughNode = await screen.findByRole('combobox', { name: /Rough .*のノード/ })
      expect(mainNode).toHaveValue('A')
      expect(roughNode).toHaveValue('B')
      fireEvent.change(roughNode, { target: { value: 'C' } })
      const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
      fireEvent.change(model, { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledTimes(1))
      fireEvent.change(model, { target: { value: '1' } })
      fireEvent.change(roughNode, { target: { value: 'D' } })
      vi.mocked(workflowsApi.get).mockResolvedValue(stageWorkflow(2, 7, 'C') as any)
      firstSave.resolve(stageWorkflow(2, 7, 'C'))
      await waitFor(() => expect(screen.getByText('変更は未保存です')).toBeTruthy())
      expect(model).toHaveValue('1')
      expect(mainNode).toHaveValue('A')
      expect(roughNode).toHaveValue('D')
      expect(screen.queryByText('設定を保存しました')).toBeNull()
      await waitFor(() => expect(screen.getByRole('button', { name: '対応付けを保存' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledTimes(2))
      expect(vi.mocked(workflowsApi.update).mock.calls[1][0]).toBe(7)
      expect(vi.mocked(workflowsApi.update).mock.calls[1][1].target_base_model_id).toBe(1)
      expect(vi.mocked(workflowsApi.update).mock.calls[1][1].mappings).toEqual([
        { master_id: 1, node_id: 'A', variant_id: 11 },
        { master_id: 1, node_id: 'D', variant_id: 12 },
      ])
      await screen.findByText('設定を保存しました')
    })

    it('[REQ-347/AC-2] does not show an old save rejection over a newer draft and does not retry automatically', async () => {
      const failedSave = deferred<unknown>()
      vi.mocked(workflowsApi.update).mockReturnValueOnce(failedSave.promise as any)
      mountWorkflowConnection()
      await openSettings()
      const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
      fireEvent.change(model, { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      fireEvent.change(model, { target: { value: '1' } })
      failedSave.reject(new Error('old failure'))
      await waitFor(() => expect(screen.getByText('変更は未保存です')).toBeTruthy())
      expect(model).toHaveValue('1')
      expect(screen.queryByRole('alert')).toBeNull()
      expect(workflowsApi.update).toHaveBeenCalledTimes(1)
    })

    it('[REQ-347/AC-3] keeps a failed current snapshot marked unsaved and reports the failure', async () => {
      vi.mocked(workflowsApi.update).mockRejectedValueOnce(new Error('offline'))
      mountWorkflowConnection()
      await openSettings()
      fireEvent.change(await screen.findByRole('combobox', { name: 'ベースモデル関連' }), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました')
      expect(screen.getByText('変更は未保存です')).toBeTruthy()
    })

    it('[REQ-347/AC-4] blocks a warm cached form until the first GET hydrates and resets saved state when reopened', async () => {
      const firstGet = deferred<ReturnType<typeof stageWorkflow>>()
      vi.mocked(workflowsApi.list).mockResolvedValue([
        { id: 7, name: 'Workflow', created_at: '2026-01-01' } as any,
        { id: 8, name: 'Other Workflow', created_at: '2026-01-01' } as any,
      ])
      vi.mocked(workflowsApi.get).mockReturnValueOnce(firstGet.promise as any).mockResolvedValue(stageWorkflow(2, 7, 'C') as any)
      vi.mocked(workflowsApi.update).mockResolvedValue(stageWorkflow(2, 7, 'D') as any)
      queryClient.setQueryData(['workflow-config', 7], stageWorkflow(1, 7, 'B'))
      mountWorkflowConnection()
      fireEvent.click((await screen.findAllByRole('button', { name: '対応付け・設定' }))[0])
      expect(await screen.findByText('設定を読み込み中...')).toBeTruthy()
      expect(screen.queryByRole('combobox', { name: /Main .*のノード/ })).toBeNull()
      expect(screen.queryByRole('combobox', { name: /Rough .*のノード/ })).toBeNull()
      expect(screen.queryByRole('combobox', { name: 'ベースモデル関連' })).toBeNull()
      expect(screen.queryByRole('textbox', { name: '設定JSONをインポート' })).toBeNull()
      expect(screen.queryByRole('button', { name: '対応付けを保存' })).toBeNull()
      expect(workflowsApi.update).not.toHaveBeenCalled()

      firstGet.resolve(stageWorkflow(2, 7, 'C'))
      const main = await screen.findByRole('combobox', { name: /Main .*のノード/ })
      const rough = await screen.findByRole('combobox', { name: /Rough .*のノード/ })
      const model = await screen.findByRole('combobox', { name: 'ベースモデル関連' })
      expect(main).toHaveValue('A')
      expect(rough).toHaveValue('C')
      expect(model).toHaveValue('2')

      fireEvent.change(rough, { target: { value: 'D' } })
      await queryClient.invalidateQueries({ queryKey: ['workflow-config', 7] })
      await waitFor(() => expect(workflowsApi.get).toHaveBeenCalledTimes(2))
      expect(rough).toHaveValue('D')
      expect(screen.getByText('変更は未保存です')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      await screen.findByText('設定を保存しました')
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
      expect(screen.queryByText('設定を保存しました')).toBeNull()
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
      await screen.findByRole('combobox', { name: /Rough .*のノード/ })
      expect(screen.queryByText('設定を保存しました')).toBeNull()
    })

    it('[REQ-347/AC-5] isolates a completed save from a switched session and permits the new session to hydrate', async () => {
      const oldSave = deferred<unknown>()
      vi.mocked(workflowsApi.list).mockResolvedValue([
        { id: 7, name: 'Workflow', created_at: '2026-01-01' } as any,
        { id: 8, name: 'Other Workflow', created_at: '2026-01-01' } as any,
      ])
      vi.mocked(workflowsApi.get).mockImplementation(((id: number) => Promise.resolve(stageWorkflow(id === 8 ? 2 : 1, id))) as any)
      vi.mocked(workflowsApi.update).mockReturnValueOnce(oldSave.promise as any)
      queryClient.setQueryData(['workflow', 7], { id: 7, marker: 'cached' })
      mountWorkflowConnection()
      const settingsButtons = await screen.findAllByRole('button', { name: '対応付け・設定' })
      fireEvent.click(settingsButtons[0])
      await screen.findByRole('heading', { name: 'Workflow の対応付け' })
      fireEvent.change(await screen.findByRole('combobox', { name: 'ベースモデル関連' }), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: '対応付けを保存' }))
      await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledTimes(1))
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[0])
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
      await screen.findByRole('heading', { name: 'Other Workflow の対応付け' })
      expect(await screen.findByRole('combobox', { name: 'ベースモデル関連' })).toHaveValue('2')
      oldSave.resolve(stageWorkflow(2))
      await waitFor(() => expect(queryClient.getQueryState(['workflow', 7])?.isInvalidated).toBe(true))
      expect(screen.queryByText('設定を保存しました')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Other Workflow の対応付け' })).toBeTruthy()
      expect(workflowsApi.get).toHaveBeenCalledWith(8)
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
      vi.mocked(workflowsApi.get).mockImplementation(((id: number) => Promise.resolve(stageWorkflow(1, id))) as any)
      fireEvent.click(screen.getAllByRole('button', { name: '対応付け・設定' })[1])
      await waitFor(() => expect(vi.mocked(workflowsApi.get).mock.calls.filter(([id]) => id === 8)).toHaveLength(2))
      await waitFor(() => expect(screen.getByRole('combobox', { name: 'ベースモデル関連' })).toHaveValue('1'))
    })
  })
})
