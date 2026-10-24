import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { server } from '../../../../test/mocks/server'
import { SpeechToneSection } from '../SpeechToneSection'
import { SettingsDraftBoundary } from '../SettingsDraftBoundary'

const preset = { id: 17, name: '丁寧', prompt: '長い指示文です。'.repeat(20), description: '説明', sort_order: 2, created_at: '2026-01-01T00:00:00Z' }
let presets = [preset]
const api = '/api/speech-tone-presets'
const clients: QueryClient[] = []
const routers: ReturnType<typeof createMemoryRouter>[] = []
let originalVisualViewportDescriptor: PropertyDescriptor | undefined

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  if (originalVisualViewportDescriptor) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewportDescriptor)
    originalVisualViewportDescriptor = undefined
  } else {
    Reflect.deleteProperty(window, 'visualViewport')
  }
  server.resetHandlers()
  routers.splice(0).forEach((router) => router.dispose())
  clients.splice(0).forEach((client) => client.clear())
})
afterAll(() => server.close())
beforeEach(() => {
  presets = [preset]
  server.use(http.get(api, () => HttpResponse.json(presets)))
})

function mountRealTone() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/settings', element: <SettingsDraftBoundary><SpeechToneSection isExpanded onToggle={() => {}} /></SettingsDraftBoundary> },
    { path: '/other', element: <p>移動先</p> },
  ], { initialEntries: ['/settings'] })
  clients.push(client)
  routers.push(router)
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { ...view, router, client }
}

async function openEdit() {
  await screen.findByRole('article', { name: '丁寧' })
  fireEvent.click(screen.getByTitle('編集'))
  return screen.getByRole('dialog', { name: '口調プリセット編集' })
}

describe('SpeechToneSection', () => {
  it('renders preset details and accessible card actions', async () => {
    mountRealTone()
    await screen.findByRole('columnheader', { name: 'プリセット名' })
    expect(screen.getByText('丁寧')).toHaveAttribute('data-label', 'プリセット名')
    expect(screen.getByText(preset.prompt)).toHaveAttribute('data-label', 'プロンプト指示')
    expect(screen.getByRole('button', { name: /プリセット追加/ })).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByTitle('編集')).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByTitle('削除')).toHaveClass('min-h-11', 'min-w-11')
  })

  it('[REQ-381/AC-8] real draft registration blocks route navigation and Cancel preserves the unsaved modal draft', async () => {
    let writes = 0
    server.use(http.put(`${api}/17`, async () => { writes += 1; return HttpResponse.json(preset) }))
    const { router } = mountRealTone()
    const dialog = await openEdit()
    const name = within(dialog).getByDisplayValue('丁寧')
    fireEvent.change(name, { target: { value: '未保存の口調' } })

    await act(async () => { await router.navigate('/other') })
    const confirm = await screen.findByRole('dialog', { name: '未保存の設定' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
    expect(within(screen.getByRole('dialog', { name: '口調プリセット編集' })).getByDisplayValue('未保存の口調')).toBeInTheDocument()
    expect(writes).toBe(0)
  })

  it('[REQ-381/AC-8] an untouched empty create form does not block navigation', async () => {
    const { router } = mountRealTone()
    fireEvent.click(await screen.findByRole('button', { name: /プリセット追加/ }))
    expect(screen.getByRole('dialog', { name: '新規口調プリセット作成' })).toBeInTheDocument()
    await act(async () => { await router.navigate('/other') })
    await screen.findByText('移動先')
    expect(router.state.location.pathname).toBe('/other')
    expect(screen.queryByRole('dialog', { name: '未保存の設定' })).not.toBeInTheDocument()
  })

  it('[REQ-381/AC-8] successful explicit Save sends normalized real-client payload and closes the modal', async () => {
    let body: unknown
    server.use(http.put(`${api}/17`, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...preset, ...(body as object) })
    }))
    mountRealTone()
    const dialog = await openEdit()
    fireEvent.change(within(dialog).getByDisplayValue('丁寧'), { target: { value: ' 新しい名前 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '口調プリセット編集' })).not.toBeInTheDocument())
    expect(body).toEqual({ name: '新しい名前', prompt: preset.prompt, description: '説明', sort_order: 2 })
  })

  it('[REQ-381/AC-10] modal keeps its common bottom sheet, scroll body, and left Cancel/right Save actions', async () => {
    mountRealTone()
    const dialog = await openEdit()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
    expect(dialog.closest('.fixed.inset-0.z-50')).toBeNull()
    const form = dialog.querySelector('form')
    expect((form as HTMLFormElement).style.flexWrap).toBe('nowrap')
    expect((form as HTMLFormElement).style.minWidth).toBe('0')
    const cancel = within(dialog).getByRole('button', { name: 'キャンセル' })
    const save = within(dialog).getByRole('button', { name: '保存' })
    expect(cancel.parentElement).toBe(save.parentElement)
    expect(cancel.parentElement).toHaveClass('shrink-0', 'w-full', 'min-w-0')
    expect((cancel.parentElement as HTMLElement).style.flexWrap).toBe('nowrap')
    expect((cancel.parentElement as HTMLElement).style.minWidth).toBe('0')
    expect(cancel).toHaveClass('min-h-11', 'min-w-11')
    expect(save).toHaveClass('min-h-11', 'min-w-11')
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dialog.querySelector('form > .overflow-y-auto')).toBeInTheDocument()
  })

  it('[REQ-381/AC-10] tone sheet follows the visual viewport height and top offset', async () => {
    originalVisualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    const visualViewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visualViewport })
    mountRealTone()
    fireEvent.click(await screen.findByRole('button', { name: /プリセット追加/ }))
    const dialog = screen.getByRole('dialog', { name: '新規口調プリセット作成' })
    const backdrop = dialog.closest('.speech-tone-preset-modal-backdrop')
    expect(backdrop).not.toBeNull()

    visualViewport.height = 450
    visualViewport.offsetTop = 362
    visualViewport.dispatchEvent(new Event('resize'))

    expect(backdrop).toHaveStyle({
      '--speech-tone-visual-viewport-height': '450px',
      '--speech-tone-visual-viewport-offset': '362px',
    })
    expect(dialog).toHaveStyle({
      '--speech-tone-visual-viewport-height': '450px',
      '--speech-tone-modal-max-height': 'min(85dvh, 450px)',
    })

    visualViewport.height = 667
    visualViewport.offsetTop = 0
    visualViewport.dispatchEvent(new Event('resize'))
    expect(dialog).toHaveStyle({ '--speech-tone-modal-max-height': 'min(85dvh, 667px)' })
  })

  it('[REQ-381/AC-2] keeps the existing responsive preset card and mobile touch targets', async () => {
    mountRealTone()
    await screen.findByRole('article', { name: '丁寧' })
    const row = screen.getByRole('article', { name: '丁寧' }).closest('tr')
    expect(row).toHaveClass('block', 'md:table-row')
    expect(screen.getByTitle('編集')).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByRole('button', { name: '丁寧 をテスト対象にする' })).toHaveClass('touch-manipulation')
  })

  it('retains the real preview and inline delete confirmation flows', async () => {
    server.use(
      http.post(`${api}/rewrite`, async ({ request }) => {
        const body = await request.json() as { text: string }
        return HttpResponse.json({ rewritten_text: `${body.text}（変換済み）` })
      }),
      http.delete(`${api}/17`, () => {
        presets = []
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mountRealTone()
    const dialog = await openEdit()
    fireEvent.change(within(dialog).getByLabelText('プレビュー用セリフ'), { target: { value: 'こんにちは' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'プレビュー実行' }))
    expect(await within(dialog).findByText('こんにちは（変換済み）')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

    fireEvent.click(screen.getByTitle('削除'))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('丁寧')
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('削除'))
    fireEvent.click(screen.getByRole('button', { name: '削除を確認' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: '丁寧' })).not.toBeInTheDocument())
  })

  it('ignores a stale real preview response after its source draft changes', async () => {
    let release!: () => void
    server.use(http.post(`${api}/rewrite`, async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return HttpResponse.json({ rewritten_text: '古いプレビュー' })
    }))
    mountRealTone()
    const dialog = await openEdit()
    const prompt = within(dialog).getByPlaceholderText(/ツンデレな口調で/)
    fireEvent.change(within(dialog).getByLabelText('プレビュー用セリフ'), { target: { value: '入力' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'プレビュー実行' }))
    await waitFor(() => expect(release).toBeDefined())
    fireEvent.change(prompt, { target: { value: '変更後のプロンプト' } })
    await act(async () => { release() })
    await waitFor(() => expect(within(dialog).queryByText('古いプレビュー')).not.toBeInTheDocument())
    expect(prompt).toHaveValue('変更後のプロンプト')
  })

  it('retains the preset test panel and surfaces its real rewrite failure', async () => {
    server.use(http.post(`${api}/rewrite`, () => HttpResponse.json({ message: 'service unavailable' }, { status: 503 })))
    mountRealTone()
    await screen.findByRole('article', { name: '丁寧' })
    fireEvent.click(screen.getByRole('button', { name: '丁寧 をテスト対象にする' }))
    fireEvent.change(screen.getByLabelText('テスト入力'), { target: { value: '入力を保持' } })
    fireEvent.click(screen.getByRole('button', { name: 'テスト実行' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('service unavailable')
    expect(screen.getByLabelText('テスト入力')).toHaveValue('入力を保持')
  })

  it('retains successful preset testing and prevents duplicate real requests while pending', async () => {
    let release!: () => void
    let requests = 0
    server.use(http.post(`${api}/rewrite`, async () => {
      requests += 1
      await new Promise<void>((resolve) => { release = resolve })
      return HttpResponse.json({ rewritten_text: '変換結果' })
    }))
    mountRealTone()
    await screen.findByRole('article', { name: '丁寧' })
    const run = screen.getByRole('button', { name: 'テスト実行' })
    expect(run).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '丁寧 をテスト対象にする' }))
    fireEvent.change(screen.getByLabelText('テスト入力'), { target: { value: 'こんにちは' } })
    fireEvent.click(run)
    await waitFor(() => expect(release).toBeDefined())
    fireEvent.click(run)
    expect(requests).toBe(1)
    await act(async () => { release() })
    expect(await screen.findByLabelText('テスト出力')).toHaveTextContent('変換結果')
  })

  it('[REQ-381/AC-8] failed Save keeps the real modal draft and exposes the server error', async () => {
    server.use(http.put(`${api}/17`, () => HttpResponse.json({ message: '保存失敗' }, { status: 503 })))
    mountRealTone()
    const dialog = await openEdit()
    fireEvent.change(within(dialog).getByDisplayValue('丁寧'), { target: { value: '保持される名前' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('保存に失敗しました')
    expect(within(dialog).getByDisplayValue('保持される名前')).toBeInTheDocument()
  })

  it('[REQ-381/AC-8] deferred Save keeps route Leave disabled and prevents an old acknowledgement from clearing a newer edit', async () => {
    let release!: () => void
    let requestStarted!: () => void
    const started = new Promise<void>((resolve) => { requestStarted = resolve })
    server.use(http.put(`${api}/17`, async ({ request }) => {
      await request.json()
      requestStarted()
      await new Promise<void>((resolve) => { release = resolve })
      return HttpResponse.json({ ...preset, name: '送信済みの名前' })
    }))
    const { router } = mountRealTone()
    const dialog = await openEdit()
    const name = within(dialog).getByDisplayValue('丁寧')
    fireEvent.change(name, { target: { value: '送信済みの名前' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await started
    await waitFor(() => expect(name).toBeDisabled())
    expect(within(dialog).getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '閉じる' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '口調プリセット編集' })).toBeInTheDocument()

    await act(async () => { await router.navigate('/other') })
    const confirm = await screen.findByRole('dialog', { name: '未保存の設定' })
    const leave = within(confirm).getAllByRole('button').find((button) => button.textContent !== 'キャンセル')
    expect(leave).toBeDefined()
    expect(leave).toBeDisabled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }))
    expect(router.state.location.pathname).toBe('/settings')
    expect(within(screen.getByRole('dialog', { name: '口調プリセット編集' })).getByDisplayValue('送信済みの名前')).toBeInTheDocument()

    await act(async () => { release() })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '口調プリセット編集' })).not.toBeInTheDocument())
  })

  it('creates a preset through the real HTTP client and preserves explicit Save semantics', async () => {
    let body: unknown
    server.use(http.post(api, async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...preset, id: 18, ...(body as object) })
    }))
    mountRealTone()
    fireEvent.click(await screen.findByRole('button', { name: /プリセット追加/ }))
    const dialog = screen.getByRole('dialog', { name: '新規口調プリセット作成' })
    fireEvent.change(within(dialog).getByPlaceholderText('例: ツンデレ風, お嬢様風'), { target: { value: ' 新規 ' } })
    fireEvent.change(within(dialog).getByPlaceholderText(/ツンデレな口調で/), { target: { value: ' 口調 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新規口調プリセット作成' })).not.toBeInTheDocument())
    expect(body).toEqual({ name: '新規', prompt: '口調', sort_order: 0 })
  })
})
