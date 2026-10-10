import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsApi } from '../../api/client'
import { SettingsPage } from '../SettingsPage'
import { VramGuardSection } from '../SettingsPage/components/VramGuardSection'

vi.mock('../../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../api/client')>()
  return { ...original, settingsApi: { ...original.settingsApi, getVram: vi.fn(), updateVram: vi.fn() } }
})
vi.mock('../../hooks/useSystemStats', () => ({ useSystemStats: vi.fn() }))
vi.mock('../../store/useGenerationStore', () => ({ useGenerationStore: (selector: (state: { systemStats: null }) => unknown) => selector({ systemStats: null }) }))
vi.mock('../SettingsPage/components/BaseModelSection', () => ({ BaseModelSection: () => null }))
vi.mock('../SettingsPage/components/ThumbnailSettingsSection', () => ({ ThumbnailSettingsSection: () => <div>サムネイル比率設定</div> }))
vi.mock('../SettingsPage/components/TranslationSettingsSection', () => ({ TranslationSettingsSection: () => null }))
vi.mock('../SettingsPage/components/LlmSettingsSection', () => ({ LlmSettingsSection: () => null }))
vi.mock('../SettingsPage/components/SpeechToneSection', () => ({ SpeechToneSection: () => null, SpeechTonePresetModal: () => null }))
vi.mock('../SettingsPage/components/BubbleDetectionSection', () => ({ BubbleDetectionSection: () => null }))
vi.mock('../SettingsPage/components/MappingMasterSection', () => ({ MappingMasterSection: () => null }))
vi.mock('../SettingsPage/components/WorkflowConnectionSection', () => ({ WorkflowConnectionSection: () => null }))
vi.mock('../SettingsPage/components/ServiceConnectionCard', () => ({ ServiceConnectionCard: () => null }))

const initialSettings = {
  vram_min_free_gb: 4,
  vram_guard_enabled: true,
  vram_free_gb: 8,
  vram_total_gb: 12,
}

function renderVram() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><VramGuardSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>)
  return client
}

beforeEach(() => {
  vi.mocked(settingsApi.getVram).mockResolvedValue(initialSettings)
  vi.mocked(settingsApi.updateVram).mockReset()
})

describe('REQ-334 Settings page and VRAM save state', () => {
  it('keeps VRAM and thumbnail ratio under separate section headings', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<MemoryRouter initialEntries={['/settings#system']}><QueryClientProvider client={client}><SettingsPage /></QueryClientProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'VRAM安全ガード設定' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '表示と操作' })).toBeInTheDocument()
    expect(screen.getByText('サムネイル比率設定')).toBeInTheDocument()
  })

  it('shows success only after save resolves and reports the exact success message', async () => {
    renderVram()
    await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
    vi.mocked(settingsApi.updateVram).mockResolvedValue({ ...initialSettings, vram_min_free_gb: 5 })
    fireEvent.change(screen.getByLabelText('最小必要空き容量 (vram_min_free_gb)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
    expect(screen.queryByText('設定を保存しました')).not.toBeInTheDocument()
    expect(await screen.findByText('設定を保存しました')).toBeInTheDocument()
    expect(settingsApi.updateVram).toHaveBeenCalledWith({ vram_min_free_gb: 5, vram_guard_enabled: true })
  })

  it('preserves a failed draft across query refresh and shows the reason and unsaved state', async () => {
    const client = renderVram()
    const input = await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
    fireEvent.change(input, { target: { value: '6' } })
    client.setQueryData(['settings-vram'], { ...initialSettings, vram_min_free_gb: 9 })
    expect(input).toHaveValue(6)

    vi.mocked(settingsApi.updateVram).mockRejectedValue(new Error('保存先に接続できません'))
    fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存先に接続できません')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(screen.getByRole('status')).toHaveTextContent('未保存')
    expect(input).toHaveValue(6)
  })

  it('does not let an older in-flight save overwrite a newer draft', async () => {
    renderVram()
    const input = await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
    let resolveSave!: (value: typeof initialSettings) => void
    vi.mocked(settingsApi.updateVram).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
    await waitFor(() => expect(resolveSave).toBeTypeOf('function'))
    fireEvent.change(input, { target: { value: '6' } })
    resolveSave({ ...initialSettings, vram_min_free_gb: 5 })
    await waitFor(() => expect(screen.getByText('設定を保存しました')).toBeInTheDocument())
    expect(input).toHaveValue(6)
    expect(screen.getByRole('status')).toHaveTextContent('未保存')
  })
})
