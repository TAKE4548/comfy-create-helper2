import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { llmPromptsApi } from '../../api/client'
import type { LlmPrompt } from '../../api/types'
import { LS_KEYS } from '../../utils/localStorageKeys'
import { SettingsPage } from '../SettingsPage'

vi.mock('../../hooks/useSystemStats', () => ({ useSystemStats: vi.fn() }))
vi.mock('../../store/useGenerationStore', () => {
  const defaultState = {
    isConnected: true,
    generationSnapshot: null,
    generationSyncing: false,
    systemStats: null,
  }
  const hook = vi.fn((selector) => (selector ? selector(defaultState) : defaultState)) as any
  hook.getState = () => defaultState
  hook.setState = vi.fn()
  return { useGenerationStore: hook }
})
vi.mock('../../api/client', () => ({
  llmPromptsApi: {
    list: vi.fn(), getModels: vi.fn(), getCurrentModel: vi.fn(),
    update: vi.fn(), updateCurrentModel: vi.fn(),
  },
}))

vi.mock('../SettingsPage/components/WorkflowConnectionSection', () => ({
  WorkflowConnectionSection: () => <div>Workflow settings</div>,
}))
vi.mock('../SettingsPage/components/MappingMasterSection', () => ({
  MappingMasterSection: () => <div>Mapping settings</div>,
}))
vi.mock('../SettingsPage/components/BaseModelSection', () => ({
  BaseModelSection: () => <div>Base model settings</div>,
}))
vi.mock('../SettingsPage/components/ThumbnailSettingsSection', () => ({
  ThumbnailSettingsSection: () => <div>Thumbnail settings</div>,
}))
vi.mock('../SettingsPage/components/TranslationSettingsSection', () => ({
  TranslationSettingsSection: () => <div>Translation settings</div>,
}))
vi.mock('../SettingsPage/components/SpeechToneSection', () => ({
  SpeechToneSection: () => <div>Speech tone settings</div>,
  SpeechTonePresetModal: () => null,
}))
vi.mock('../SettingsPage/components/BubbleDetectionSection', () => ({
  BubbleDetectionSection: () => <div>Bubble settings</div>,
}))
vi.mock('../SettingsPage/components/ServiceConnectionCard', () => ({
  ServiceConnectionCard: () => <div>Service connections</div>,
}))
vi.mock('../SettingsPage/components/VramGuardSection', () => ({
  VramGuardSection: () => <div>VRAM settings</div>,
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter><SettingsPage /></BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage REQ-314 integration boundaries', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/settings#prompt')
    vi.clearAllMocks()
    vi.mocked(llmPromptsApi.list).mockResolvedValue([promptFixture])
    vi.mocked(llmPromptsApi.getModels).mockResolvedValue(['model-a'])
    vi.mocked(llmPromptsApi.getCurrentModel).mockResolvedValue(modelFixture)
    vi.mocked(llmPromptsApi.update).mockResolvedValue(promptFixture)
    vi.mocked(llmPromptsApi.updateCurrentModel).mockResolvedValue(modelFixture)
  })

  afterEach(() => cleanup())

  it('keeps hash as the selected-tab source and synchronizes tab history and storage', async () => {
    localStorage.setItem(LS_KEYS.SETTINGS_ACTIVE_TAB, 'system')
    renderPage()

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

  it('starts prompt details closed and keeps an unsaved prompt edit across tab navigation', async () => {
    renderPage()
    const details = screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })
    expect(details).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(details)

    const promptButton = await screen.findByRole('button', { name: /干渉タグ診断/ })
    fireEvent.click(promptButton)
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
