import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmSettingsGroup } from '../LlmSettingsSection'
import { server } from '../../../../test/mocks/server'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  getModels: vi.fn(),
  getCurrentModel: vi.fn(),
  updateCurrentModel: vi.fn(),
  update: vi.fn(),
  playground: vi.fn(),
}))

vi.mock('../../../../api/client', () => ({ llmPromptsApi: api }))

import { LlmSettingsSection } from '../LlmSettingsSection'

const records = [
  'audit_interference', 'audit_interference_anima', 'audit_vocabulary', 'audit_physical',
  'scene_generate', 'scene_generate_anima', 'speech_draft_vlm_prompt',
  'speech_draft_llm_prompt', 'speech_rewrite_system_prompt', 'translation_ja_to_en',
  'translation_en_to_ja', 'llm_params_translation', 'llm_params_scene_generate',
  'llm_params_audit', 'llm_params_speech_draft', 'speech_draft_vlm_model',
  'speech_draft_llm_model', 'translation_model', 'translation_debounce',
  'translation_provider', 'unknown_prompt',
].map((key, id) => ({
  id, key, content: key.startsWith('llm_params_')
    ? JSON.stringify({ temperature: 0.2, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 })
    : key === 'translation_debounce' ? '650' : `value:${key}`,
  description: null, updated_at: '2026-01-01T00:00:00Z',
}))

const props = (group?: LlmSettingsGroup) => ({
  group, isExpandedModel: false, onToggleModel: vi.fn(), isExpandedPrompts: false,
  onTogglePrompts: vi.fn(), isExpandedParams: false, onToggleParams: vi.fn(),
})

function mount(group?: LlmSettingsGroup, footer?: React.ReactNode, expanded = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><LlmSettingsSection {...props(group)} isExpandedModel={expanded} isExpandedPrompts={expanded} isExpandedParams={expanded} modelFooter={footer} /></QueryClientProvider>)
  return { ...view, client }
}

async function loadTransportBackedComponent() {
  vi.doUnmock('../../../../api/client')
  vi.resetModules()
  return (await import('../LlmSettingsSection')).LlmSettingsSection
}

function mountTransportBacked(Component: typeof LlmSettingsSection, group?: LlmSettingsGroup) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={client}><Component {...props(group)} isExpandedModel isExpandedPrompts isExpandedParams /></QueryClientProvider>)
  return { ...view, client }
}

function installLlmTransport() {
  const serverRecords = records.map((record) => ({ ...record }))
  const writes: Array<{ key: string; content: string }> = []
  server.use(
    http.get('/api/llm-prompts', () => HttpResponse.json(serverRecords.map((record) => ({ ...record })))),
    http.get('/api/llm-prompts/models', () => HttpResponse.json(['model-a', 'model-b'])),
    http.get('/api/llm-prompts/current-model', () => HttpResponse.json({ id: 0, key: 'llm_current_model', content: 'model-a', description: null, updated_at: '2026-01-01T00:00:00Z' })),
    http.put('/api/llm-prompts/current-model', async ({ request }) => {
      const body = await request.json() as { model: string }
      return HttpResponse.json({ id: 0, key: 'llm_current_model', content: body.model, description: null, updated_at: '2026-01-01T00:00:00Z' })
    }),
    http.put('/api/llm-prompts/:key', async ({ params, request }) => {
      const key = String(params.key)
      const body = await request.json() as { content: string }
      writes.push({ key, content: body.content })
      const index = serverRecords.findIndex((record) => record.key === key)
      if (index >= 0) serverRecords[index] = { ...serverRecords[index], content: body.content }
      return HttpResponse.json({ id: index, key, content: body.content, description: null, updated_at: '2026-01-01T00:00:00Z' })
    }),
  )
  return writes
}

const keysIn = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll<HTMLElement>(selector)].map((node) => node.id.replace(/^(prompt-expand-|prompt-content-|settings-)/, ''))
const ready = async (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector('h3')).not.toBeNull())
const paramInputs = (container: HTMLElement, heading: string) => {
  const title = [...container.querySelectorAll('h3')].find((node) => node.textContent === heading)
  return [...(title?.closest('.rounded-xl')?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? [])]
}

const originalMatchMedia = window.matchMedia
function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('LlmSettingsSection grouped contracts', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

  afterAll(() => server.close())

  afterEach(() => {
    server.resetHandlers()
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia })
  })

  beforeEach(() => {
    api.list.mockReset().mockImplementation(async () => records.map((record) => ({ ...record })))
    api.getModels.mockReset().mockResolvedValue(['model-a', 'model-b'])
    api.getCurrentModel.mockReset().mockResolvedValue({ key: 'llm_current_model', content: 'model-a' })
    api.updateCurrentModel.mockReset().mockResolvedValue({})
    api.update.mockReset().mockResolvedValue({})
    api.playground.mockReset().mockResolvedValue({ rendered_prompt: 'expanded system', result: 'preview result', token_limit: null })
  })

  it.each([
    ['prompt', ['audit_interference', 'audit_interference_anima', 'audit_vocabulary', 'audit_physical', 'scene_generate', 'scene_generate_anima'], ['llm_params_scene_generate', 'llm_params_audit']],
    ['dialogue', ['speech_draft_vlm_prompt', 'speech_draft_llm_prompt', 'speech_rewrite_system_prompt'], ['llm_params_speech_draft']],
    ['translation', ['translation_ja_to_en', 'translation_en_to_ja'], ['llm_params_translation']],
  ] as const)('%s shows only its exact prompt and parameter records', async (group, expectedPrompts, expectedParams) => {
    const { container } = mount(group)
    await ready(container)
    if (group === 'prompt') {
      expect(container.querySelectorAll('[id^="prompt-expand-"]')).toHaveLength(0)
      expect([...container.querySelectorAll<HTMLOptionElement>('#prompt-type-select option')].map((o) => o.value)).toEqual(expectedPrompts)
    } else {
      expect(keysIn(container, '[id^="prompt-expand-"]')).toEqual(expectedPrompts)
    }
    const shownParams = group === 'prompt' ? expectedParams.slice(1) : expectedParams
    expect([...container.querySelectorAll('h3')].map((node) => node.textContent)).toEqual(shownParams.map((key) => ({
      llm_params_audit: 'プロンプト診断パラメータ設定', llm_params_scene_generate: 'Scene Generator パラメータ設定',
      llm_params_speech_draft: 'セリフ下書きパラメータ設定', llm_params_translation: '翻訳パラメータ設定',
    }[key])))
    expect(container.textContent).not.toContain('unknown_prompt')
    expect(container.textContent).not.toContain('translation_debounce')
    expect(container.textContent).not.toContain('translation_provider')
  })

  it('keeps grouped detail bodies collapsed, then opens prompt and params together with unique aria wiring', async () => {
    const view = mount('prompt')
    const { container, client } = view
    await ready(container)
    const toggle = screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const body = document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement
    expect(body.hidden).toBe(true)
    expect(container.querySelector('#settings-llm-model-select')).toBeVisible()
    fireEvent.click(toggle)
    view.rerender(<QueryClientProvider client={client}><LlmSettingsSection {...props('prompt')} isExpandedPrompts={true} /></QueryClientProvider>)
    const expandedToggle = screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' })
    const expandedBody = document.getElementById(expandedToggle.getAttribute('aria-controls')!) as HTMLElement
    expect(expandedToggle).toHaveAttribute('aria-expanded', 'true')
    expect(expandedBody.hidden).toBe(false)
    expect(container.querySelectorAll('[id$="-details-toggle"]')).toHaveLength(1)
    expect(container.querySelectorAll('[id$="-details-body"]')).toHaveLength(1)
    expect(expandedToggle.getAttribute('aria-controls')).toBe(expandedBody.id)
    expect(container.querySelectorAll('[id^="prompt-expand-"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="prompt-unified-editor"]')).toHaveLength(1)
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(5)
  })

  it('renders prompt and dialogue instances together with independent, unique detail targets', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(<QueryClientProvider client={client}>
      <><LlmSettingsSection {...props('prompt')} /><LlmSettingsSection {...props('dialogue')} /></>
    </QueryClientProvider>)
    await waitFor(() => expect(container.querySelectorAll('h3')).toHaveLength(2))
    const toggles = [...container.querySelectorAll<HTMLButtonElement>('[id$="-details-toggle"]')]
    const targets = toggles.map((toggle) => toggle.getAttribute('aria-controls'))
    expect(toggles).toHaveLength(2)
    expect(new Set(targets).size).toBe(2)
    expect(toggles.every((toggle) => toggle.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(targets.every((target) => document.getElementById(target!)?.hidden)).toBe(true)
    expect(container.querySelectorAll('select').length).toBeGreaterThan(0)
  })

  it('supports translation details and legacy independent toggles, and places footer only in dialogue model card', async () => {
    const footer = <span>footer-marker</span>
    const translation = mount('translation', footer)
    await ready(translation.container)
    expect(translation.container.querySelectorAll('[id^="prompt-expand-"]')).toHaveLength(2)
    expect(translation.container.querySelectorAll('input[type="number"]')).toHaveLength(5)
    expect(translation.container.querySelector('#settings-translation-debounce')).toBeNull()
    expect(translation.container.querySelector('#settings-llm-model-select')).toBeNull()
    expect(translation.container.textContent).not.toContain('footer-marker')
    translation.unmount()

    const dialogue = mount('dialogue', footer)
    await ready(dialogue.container)
    expect(dialogue.container.querySelectorAll('#settings-llm-model-select')).toHaveLength(0)
    expect(dialogue.container.textContent?.match(/footer-marker/g)).toHaveLength(1)
    dialogue.unmount()

    const legacy = mount(undefined, undefined, true)
    await ready(legacy.container)
    expect(legacy.container.querySelectorAll('[id^="prompt-expand-"]')).toHaveLength(11)
    expect(legacy.container.querySelectorAll('input[type="number"]')).toHaveLength(20)
    expect(legacy.container.querySelector('#settings-translation-debounce')).not.toBeNull()
    fireEvent.click(screen.getByText('LLM System Prompts'))
    expect(legacy.container.querySelectorAll('[id^="prompt-expand-"]')).toHaveLength(11)
  })

  it('uses unique model selectors, sends exact model and prompt payloads, and refreshes both model queries', async () => {
    const { container } = mount(undefined, undefined, true)
    await ready(container)
    expect(new Set([...container.querySelectorAll('select')].map((select) => select.id)).size).toBe(container.querySelectorAll('select').length)
    fireEvent.change(container.querySelector('#settings-llm-model-select')!, { target: { value: 'model-b' } })
    await waitFor(() => expect(api.updateCurrentModel).toHaveBeenCalledWith('model-b'))
    fireEvent.change(container.querySelector('#settings-translation-model-select')!, { target: { value: 'model-b' } })
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('translation_model', { content: 'model-b' }))
    fireEvent.change(container.querySelector('#settings-speech-vlm-model-select')!, { target: { value: 'model-b' } })
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('speech_draft_vlm_model', { content: 'model-b' }))
    fireEvent.click(container.querySelector('#settings-llm-model-refresh')!)
    await waitFor(() => {
      expect(api.getModels.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(api.getCurrentModel.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows all speech prompt roles and saves original keys with edited and empty content', async () => {
    const { container } = mount('dialogue')
    await ready(container)
    const roles = [
      ['speech_draft_vlm_prompt', '画像理解：画像の状況や要素を読み取ります。'],
      ['speech_draft_llm_prompt', 'セリフ文章化：読み取った状況からセリフを作成します。'],
      ['speech_rewrite_system_prompt', '口調変換：キャラクターに合わせてセリフを整えます。'],
    ]
    for (const [key, role] of roles) {
      fireEvent.click(container.querySelector(`#prompt-expand-${key}`)!)
      expect(container.textContent).toContain(role)
    }
    fireEvent.click(container.querySelector('#prompt-expand-speech_draft_vlm_prompt')!)
    fireEvent.change(container.querySelector('#prompt-content-speech_draft_vlm_prompt')!, { target: { value: '' } })
    fireEvent.click(container.querySelector('#prompt-save-speech_draft_vlm_prompt')!)
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('speech_draft_vlm_prompt', { content: '' }))
  })

  it('keeps dirty parameters through cache refetch, saves exact JSON, and accepts server values after matching save', async () => {
    const { client, container } = mount('prompt')
    await ready(container)
    const dirtyInput = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(dirtyInput, { target: { value: '0.8' } })
    const server = records.map((record) => record.key === 'llm_params_scene_generate'
      ? { ...record, content: JSON.stringify({ temperature: 1.1, top_p: 0.7, max_tokens: 900, presence_penalty: 0, frequency_penalty: 0 }) }
      : { ...record })
    client.setQueryData(['llm-prompts'], server)
    await waitFor(() => expect(paramInputs(container, 'プロンプト診断パラメータ設定')[0]).toHaveValue(0.8))
    fireEvent.change(container.querySelector('#prompt-type-select')!, { target: { value: 'scene_generate' } })
    await waitFor(() => expect(paramInputs(container, 'Scene Generator パラメータ設定')[0]).toHaveValue(1.1))
    fireEvent.change(container.querySelector('#prompt-type-select')!, { target: { value: 'audit_interference' } })
    const save = [...container.querySelectorAll('h3')].find((node) => node.textContent === 'プロンプト診断パラメータ設定')?.closest('.rounded-xl')?.querySelector('button')
    fireEvent.click(save!)
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('llm_params_audit', {
      content: JSON.stringify({ temperature: 0.8, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    }))
  })

  it('preserves edits made during an in-flight save and ignores invalid parameter JSON with usable defaults', async () => {
    let resolveSave!: (value: unknown) => void
    api.update.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve }))
    const { client, container } = mount('prompt')
    await ready(container)
    const first = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(first, { target: { value: '0.8' } })
    const save = [...container.querySelectorAll('h3')].find((node) => node.textContent === 'プロンプト診断パラメータ設定')?.closest('.rounded-xl')?.querySelector('button')!
    fireEvent.click(save)
    await waitFor(() => expect(api.update).toHaveBeenCalled())
    fireEvent.change(first, { target: { value: '1.2' } })
    resolveSave({})
    await waitFor(() => expect(first).toHaveValue(1.2))
    const invalid = records.map((record) => record.key === 'llm_params_audit' ? { ...record, content: '{bad json' } : { ...record })
    client.setQueryData(['llm-prompts'], invalid)
    await waitFor(() => expect(first).toHaveValue(1.2))
    expect(container.querySelectorAll('input[type="number"]')[0]).toBeEnabled()
  })

  it('releases a saved dirty key only after the matching server value arrives', async () => {
    let server = records.map((record) => ({ ...record }))
    api.list.mockImplementation(async () => server.map((record) => ({ ...record })))
    api.update.mockImplementation(async (key: string, body: { content: string }) => {
      server = server.map((record) => record.key === key ? { ...record, content: body.content } : record)
      return {}
    })
    const { client, container } = mount('prompt')
    await ready(container)
    const temperature = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(temperature, { target: { value: '0.9' } })
    const save = [...container.querySelectorAll('h3')].find((node) => node.textContent === 'プロンプト診断パラメータ設定')?.closest('.rounded-xl')?.querySelector('button')
    fireEvent.click(save!)
    await waitFor(() => expect(server.find((record) => record.key === 'llm_params_audit')?.content).toContain('0.9'))
    await waitFor(() => expect(paramInputs(container, 'プロンプト診断パラメータ設定')[0]).toHaveValue(0.9))
    const newerServer = server.map((record) => record.key === 'llm_params_audit'
      ? { ...record, content: JSON.stringify({ temperature: 1.4, top_p: 0.6, max_tokens: 800, presence_penalty: 0.1, frequency_penalty: -0.1 }) }
      : { ...record })
    client.setQueryData(['llm-prompts'], newerServer)
    await waitFor(() => expect(paramInputs(container, 'プロンプト診断パラメータ設定')[0]).toHaveValue(1.4))
  })

  it('shows parameter defaults and keeps model selection operable when no models are returned', async () => {
    api.getModels.mockResolvedValue([])
    const { container } = mount('translation')
    await ready(container)
    expect(container.querySelector('#settings-translation-model-select')).toBeEnabled()
    expect(container.querySelectorAll('input[type="number"]')[0]).toHaveValue(0.2)
    expect(screen.getByText('翻訳パラメータ設定')).toBeVisible()
  })

  it('previews unsaved preset, input, and variables with expanded output and unknown context limit', async () => {
    api.list.mockResolvedValue(records.map((record) => record.key === 'audit_interference'
      ? { ...record, content: 'System {{name}}' }
      : { ...record }))
    const { container } = mount('prompt', undefined, true)
    await ready(container)
    const presetEditor = container.querySelector<HTMLTextAreaElement>('#prompt-content-audit_interference')!
    fireEvent.change(presetEditor, { target: { value: 'Unsaved {{name}}' } })
    fireEvent.change(screen.getByLabelText('Playground input'), { target: { value: 'Describe {{name}}' } })
    fireEvent.change(screen.getByLabelText('Playground variables'), { target: { value: '{"name":"Mage"}' } })

    fireEvent.click(screen.getByRole('button', { name: 'Preview prompt' }))

    await waitFor(() => expect(api.playground).toHaveBeenCalledWith({
      system_prompt: 'Unsaved {{name}}',
      text: 'Describe {{name}}',
      variables: { name: 'Mage' },
      model: 'model-a',
      llm_params: JSON.parse(records.find((record) => record.key === 'llm_params_audit')!.content),
    }))
    expect(api.update).not.toHaveBeenCalled()
    expect(await screen.findByText('preview result')).toBeVisible()
    expect(screen.getByText(/Context token limit: 未取得/)).toBeVisible()
    expect(screen.getByTestId('playground-prompt-preview')).toHaveTextContent('Unsaved {{name}}')
    fireEvent.click(screen.getByRole('button', { name: 'Expanded system prompt' }))
    expect(screen.getByTestId('playground-prompt-preview')).toHaveTextContent('expanded system')
  })

  it('preserves Playground drafts on failure and ignores a response made stale by editing input', async () => {
    const { container } = mount('prompt', undefined, true)
    await ready(container)
    fireEvent.change(screen.getByLabelText('Playground input'), { target: { value: 'Keep this draft' } })
    api.playground.mockRejectedValueOnce(new Error('Playground offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Preview prompt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Playground offline')
    expect(screen.getByLabelText('Playground input')).toHaveValue('Keep this draft')
    expect(api.update).not.toHaveBeenCalled()

    let resolvePreview!: (value: { rendered_prompt: string; result: string; token_limit: number | null }) => void
    api.playground.mockImplementationOnce(() => new Promise((resolve) => { resolvePreview = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview prompt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previewing…' }))
    expect(api.playground).toHaveBeenCalledTimes(2)
    fireEvent.change(screen.getByLabelText('Playground input'), { target: { value: 'New draft' } })
    resolvePreview({ rendered_prompt: 'stale', result: 'stale result', token_limit: 4096 })
    await waitFor(() => expect(screen.queryByText('stale result')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Playground input')).toHaveValue('New draft')
  })

  it('shows exact save success only after the prompt update resolves', async () => {
    const { container } = mount('prompt', undefined, true)
    await ready(container)
    fireEvent.change(container.querySelector('#prompt-content-audit_interference')!, { target: { value: 'Saved prompt draft' } })
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    fireEvent.click(container.querySelector('#prompt-save-audit_interference')!)

    await waitFor(() => expect(api.update).toHaveBeenCalledWith('audit_interference', { content: 'Saved prompt draft' }))
    expect(await screen.findByText('設定を保存しました')).toBeInTheDocument()
  })

  it('shows the save failure reason, preserves drafts, and ignores stale success for a newer edit', async () => {
    api.update.mockRejectedValueOnce(new Error('storage unavailable'))
    const { container } = mount('prompt', undefined, true)
    await ready(container)
    const editor = container.querySelector<HTMLTextAreaElement>('#prompt-content-audit_interference')!
    fireEvent.change(editor, { target: { value: 'Retryable draft' } })
    fireEvent.click(container.querySelector('#prompt-save-audit_interference')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('storage unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(editor).toHaveValue('Retryable draft')
    expect(screen.queryByText('設定を保存しました')).toBeNull()

    let resolveSave!: (value: unknown) => void
    api.update.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    fireEvent.click(container.querySelector('#prompt-save-audit_interference')!)
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2))
    fireEvent.change(editor, { target: { value: 'Newer unsaved draft' } })
    resolveSave({})
    await waitFor(() => expect(editor).toHaveValue('Newer unsaved draft'))
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  describe('unified prompt editor', () => {
    const typeSelect = (container: HTMLElement) => container.querySelector<HTMLSelectElement>('#prompt-type-select')!
    const pick = (container: HTMLElement, key: string) => fireEvent.change(typeSelect(container), { target: { value: key } })
    const sceneParams = JSON.stringify({ temperature: 1.3, top_p: 1, max_tokens: 2000, presence_penalty: 0, frequency_penalty: 0 })
    const withSceneParams = () => api.list.mockImplementation(async () => records.map((record) => (
      record.key === 'llm_params_scene_generate' ? { ...record, content: sceneParams } : { ...record }
    )))

    it('[REQ-365/AC-5] switches the prompt body textarea immediately when the type selector changes', async () => {
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      expect(container.querySelector<HTMLTextAreaElement>('#prompt-content-audit_interference')!).toHaveValue('value:audit_interference')
      pick(container, 'scene_generate')
      expect(container.querySelector('#prompt-content-audit_interference')).toBeNull()
      expect(container.querySelector<HTMLTextAreaElement>('#prompt-content-scene_generate')!).toHaveValue('value:scene_generate')
      expect(container.querySelector('#prompt-save-scene_generate')).not.toBeNull()
    })

    it('[REQ-365/AC-5] links Temperature and Max Tokens to the selected type param group', async () => {
      withSceneParams()
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      expect(paramInputs(container, 'プロンプト診断パラメータ設定')[0]).toHaveValue(0.2)
      expect(paramInputs(container, 'プロンプト診断パラメータ設定')[1]).toHaveValue(1000)
      expect(container.querySelectorAll('h3')).toHaveLength(1)
      pick(container, 'scene_generate')
      expect(paramInputs(container, 'Scene Generator パラメータ設定')[0]).toHaveValue(1.3)
      expect(paramInputs(container, 'Scene Generator パラメータ設定')[1]).toHaveValue(2000)
      expect(container.querySelectorAll('h3')).toHaveLength(1)
    })

    it('[REQ-365/AC-5] keeps unsaved body and param drafts when switching types and back', async () => {
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      fireEvent.change(container.querySelector('#prompt-content-audit_interference')!, { target: { value: 'draft body' } })
      fireEvent.change(paramInputs(container, 'プロンプト診断パラメータ設定')[0], { target: { value: '0.7' } })
      pick(container, 'scene_generate')
      pick(container, 'audit_interference')
      expect(container.querySelector<HTMLTextAreaElement>('#prompt-content-audit_interference')!).toHaveValue('draft body')
      expect(paramInputs(container, 'プロンプト診断パラメータ設定')[0]).toHaveValue(0.7)
    })

    it('[REQ-365/AC-5] saves params of the selected group with the exact existing payload', async () => {
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      pick(container, 'scene_generate')
      const save = [...container.querySelectorAll('h3')].find((n) => n.textContent === 'Scene Generator パラメータ設定')?.closest('.rounded-xl')?.querySelector('button')!
      fireEvent.click(save)
      await waitFor(() => expect(api.update).toHaveBeenCalledWith('llm_params_scene_generate', {
        content: JSON.stringify({ temperature: 0.2, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
      }))
    })

    it('[REQ-365/AC-5] shows the shared model read-only and does not add a per-type model save', async () => {
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      expect(screen.getByTestId('prompt-unified-params')).toHaveTextContent('使用モデル: model-a（全プロンプト共通。変更は上の「現在のモデル」）')
      pick(container, 'scene_generate_anima')
      fireEvent.click(container.querySelector('#prompt-save-scene_generate_anima')!)
      await waitFor(() => expect(api.update).toHaveBeenCalledWith('scene_generate_anima', { content: 'value:scene_generate_anima' }))
      expect(api.updateCurrentModel).not.toHaveBeenCalled()
      expect(screen.getByTestId('prompt-unified-params').querySelector('select')).toBeNull()
    })

    it('[REQ-365/AC-5] still routes the details toggle through onTogglePrompts', async () => {
      const onTogglePrompts = vi.fn()
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { container } = render(<QueryClientProvider client={client}><LlmSettingsSection {...props('prompt')} onTogglePrompts={onTogglePrompts} /></QueryClientProvider>)
      await ready(container)
      fireEvent.click(screen.getByRole('button', { name: 'プロンプト診断・生成の詳細設定' }))
      expect(onTogglePrompts).toHaveBeenCalledTimes(1)
    })

    it('[REQ-365/AC-5] disables the textarea when the selected prompt record is not fetched', async () => {
      api.list.mockImplementation(async () => records.filter((r) => r.key !== 'scene_generate').map((r) => ({ ...r })))
      const { container } = mount('prompt', undefined, true)
      await ready(container)
      pick(container, 'scene_generate')
      expect(container.querySelector('#prompt-content-scene_generate')).toBeDisabled()
      expect(container.textContent).toContain('このプロンプトはまだ取得されていません。')
    })
  })

  it('[REQ-381/AC-7] commits valid mobile numeric edits on blur and Enter only once', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const temperature = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(temperature, { target: { value: '0.8' } })
    expect(writes).toHaveLength(0)
    fireEvent.keyDown(temperature, { key: 'Enter' })
    fireEvent.blur(temperature)
    await waitFor(() => expect(writes).toEqual([{
      key: 'llm_params_audit',
      content: JSON.stringify({ temperature: 0.8, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    }]))
  })

  it('[REQ-381/AC-7] preserves explicit desktop numeric Save', async () => {
    const writes = installLlmTransport()
    setMobileViewport(false)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const temperature = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(temperature, { target: { value: '0.8' } })
    fireEvent.blur(temperature)
    expect(writes).toHaveLength(0)
    const save = [...container.querySelectorAll('h3')]
      .find((node) => node.textContent === 'プロンプト診断パラメータ設定')
      ?.closest('.rounded-xl')?.querySelector('button')
    fireEvent.click(save!)
    await waitFor(() => expect(writes.map(({ key }) => key)).toContain('llm_params_audit'))
    expect(writes[0]).toEqual({
      key: 'llm_params_audit',
      content: JSON.stringify({ temperature: 0.8, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    })
  })

  it('[REQ-381/AC-7] does not commit an empty invalid numeric draft', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const temperature = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(temperature, { target: { value: '' } })
    fireEvent.blur(temperature)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(temperature.value).toBe('')
    expect(writes).toHaveLength(0)
  })

  it('[REQ-381/AC-7] keeps exact numeric text until blur and sends the parsed number once', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const temperature = paramInputs(container, 'プロンプト診断パラメータ設定')[0]
    fireEvent.change(temperature, { target: { value: '0.50' } })
    expect(temperature.value).toBe('0.50')
    expect(writes).toHaveLength(0)
    fireEvent.blur(temperature)
    await waitFor(() => expect(writes).toEqual([{
      key: 'llm_params_audit',
      content: JSON.stringify({ temperature: 0.5, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    }]))
  })

  it('[REQ-381/AC-7] blocks the whole resource while any numeric field is invalid', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const [temperature, , topP] = paramInputs(container, 'プロンプト診断パラメータ設定')
    fireEvent.change(temperature, { target: { value: '' } })
    fireEvent.change(topP, { target: { value: '0.8' } })
    fireEvent.blur(topP)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(temperature.value).toBe('')
    expect(topP.value).toBe('0.8')
    expect(writes).toHaveLength(0)

    fireEvent.change(temperature, { target: { value: '0.6' } })
    fireEvent.blur(temperature)
    await waitFor(() => expect(writes).toEqual([{
      key: 'llm_params_audit',
      content: JSON.stringify({ temperature: 0.6, top_p: 0.8, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    }]))
  })

  it('[REQ-381/AC-7] commits mobile ranges on pointerup or keyboard release but not pointercancel', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const heading = [...container.querySelectorAll('h3')].find((node) => node.textContent === 'プロンプト診断パラメータ設定')
    const range = heading?.closest('.rounded-xl')?.querySelector<HTMLInputElement>('input[type="range"]')
    expect(range).not.toBeNull()

    fireEvent.change(range!, { target: { value: '0.7' } })
    fireEvent.pointerCancel(range!)
    fireEvent.blur(range!)
    expect(writes).toHaveLength(0)

    fireEvent.change(range!, { target: { value: '0.9' } })
    fireEvent.pointerUp(range!)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({
      key: 'llm_params_audit',
      content: JSON.stringify({ temperature: 0.9, top_p: 1, max_tokens: 1000, presence_penalty: 0, frequency_penalty: 0 }),
    })

    fireEvent.change(range!, { target: { value: '1.1' } })
    fireEvent.keyUp(range!, { key: 'ArrowRight' })
    await waitFor(() => expect(writes).toHaveLength(2))
  })

  it('[REQ-381/AC-8] keeps prompt drafts explicit-save on mobile', async () => {
    const writes = installLlmTransport()
    setMobileViewport(true)
    const Component = await loadTransportBackedComponent()
    const { container } = mountTransportBacked(Component, 'prompt')
    await ready(container)
    const key = (container.querySelector('#prompt-type-select') as HTMLSelectElement).value
    const textarea = container.querySelector<HTMLTextAreaElement>(`#prompt-content-${key}`)!
    fireEvent.change(textarea, { target: { value: 'edited prompt draft' } })
    fireEvent.blur(textarea)
    expect(writes).toHaveLength(0)
    fireEvent.click(container.querySelector(`#prompt-save-${key}`)!)
    await waitFor(() => expect(writes).toEqual([{ key, content: 'edited prompt draft' }]))
  })
})
