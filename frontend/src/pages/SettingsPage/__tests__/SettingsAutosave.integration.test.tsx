import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { server } from '../../../test/mocks/server'
import { SettingsDraftBoundary } from '../components/SettingsDraftBoundary'
import { BubbleDetectionSection } from '../components/BubbleDetectionSection'
import { TranslationSettingsSection } from '../components/TranslationSettingsSection'
import { WorkflowConnectionSection } from '../components/WorkflowConnectionSection'
import { LS_KEYS } from '../../../utils/localStorageKeys'
import { BaseModelSection } from '../components/BaseModelSection'
import { VramGuardSection } from '../components/VramGuardSection'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { cleanup(); server.resetHandlers() })
afterAll(() => server.close())

function mountRealSettingsSection(initialPath = '/settings', mobile = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: mobile && query.includes('max-width'), media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/settings', element: <SettingsDraftBoundary><BubbleDetectionSection isExpanded onToggle={() => {}} /></SettingsDraftBoundary> },
    { path: '/translation', element: <SettingsDraftBoundary><TranslationSettingsSection isExpanded onToggle={() => {}} /></SettingsDraftBoundary> },
    { path: '/workflow', element: <SettingsDraftBoundary><WorkflowConnectionSection group="system" showConnections={false} isExpandedLongPress onToggleLongPress={() => {}} isExpandedWorkflows={false} onToggleWorkflows={() => {}} isExpandedConnections={false} onToggleConnections={() => {}} /></SettingsDraftBoundary> },
    { path: '/vram', element: <SettingsDraftBoundary><VramGuardSection isExpanded onToggle={() => {}} /></SettingsDraftBoundary> },
    { path: '/other', element: <p>移動先</p> },
  ], { initialEntries: [initialPath] })
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { ...view, client, router }
}

const bubbleRecord = { id: 1, key: 'bubble_detection_params', content: JSON.stringify({ min_area: 1000, min_brightness: 150 }), updated_at: '2026-01-01T00:00:00Z' }

function setupHandlers(onPut: (body: unknown) => Response | Promise<Response> = () => HttpResponse.json({ ...bubbleRecord })) {
  server.use(
    http.get('/api/llm-prompts', () => HttpResponse.json([bubbleRecord])),
    http.get('/api/snapshots', () => HttpResponse.json([])),
    http.put('/api/llm-prompts/:key', async ({ request }) => onPut(await request.json())),
  )
}

function mountRealBaseModelSettings() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query.includes('max-width'), media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/settings', element: <SettingsDraftBoundary><BaseModelSection /></SettingsDraftBoundary> },
    { path: '/other', element: <p>移動先</p> },
  ], { initialEntries: ['/settings'] })
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { ...view, client, router }
}

describe('Settings autosave integration', () => {
  it('[REQ-381/AC-7] sends a real bubble update after a mobile number field is confirmed', async () => {
    setupHandlers()
    mountRealSettingsSection()
    const area = await screen.findByLabelText('最小面積 (min_area: 画素数)')
    fireEvent.change(area, { target: { value: '1500' } })
    expect(screen.queryByText('設定を保存しました')).not.toBeInTheDocument()
    fireEvent.blur(area)
    expect(await screen.findByText('設定を保存しました')).toBeInTheDocument()
    expect(area).toHaveValue(1500)
  })

  it('[REQ-381/AC-7] keeps an invalid bubble number raw and prevents an API request', async () => {
    let requestCount = 0
    setupHandlers(() => { requestCount += 1; return HttpResponse.json({ ...bubbleRecord }) })
    mountRealSettingsSection()
    const area = await screen.findByLabelText('最小面積 (min_area: 画素数)')
    fireEvent.change(area, { target: { value: '' } })
    fireEvent.blur(area)
    expect(area).toHaveValue(null)
    expect(screen.getByRole('alert')).toHaveTextContent('未保存')
    expect(requestCount).toBe(0)
  })

  it('[REQ-381/AC-7] keeps the draft and error visible after the real API rejects a save', async () => {
    setupHandlers(() => HttpResponse.json({ detail: 'invalid' }, { status: 422 }))
    const { router } = mountRealSettingsSection()
    const area = await screen.findByLabelText('最小面積 (min_area: 画素数)')
    fireEvent.change(area, { target: { value: '1550' } })
    fireEvent.blur(area)
    expect(await screen.findByRole('alert')).toHaveTextContent('未保存')
    expect(area).toHaveValue(1550)
    await act(async () => { await router.navigate('/other') })
    const dialog = await screen.findByRole('dialog', { name: '未保存の設定' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))
    expect(router.state.location.pathname).toBe('/settings')
    expect(screen.getByLabelText('最小面積 (min_area: 画素数)')).toHaveValue(1550)
  })

  it('[REQ-381/AC-7] waits for a mobile range release before sending the translation debounce value', async () => {
    const prompts = [
      { ...bubbleRecord, key: 'translation_provider', content: 'fugumt' },
      { ...bubbleRecord, key: 'translation_api_key', content: '' },
      { ...bubbleRecord, key: 'translation_api_url', content: '' },
      { ...bubbleRecord, key: 'translation_debounce', content: '500' },
    ]
    const requests: unknown[] = []
    server.use(
      http.get('/api/llm-prompts', () => HttpResponse.json(prompts)),
      http.get('/api/snapshots', () => HttpResponse.json([])),
      http.get('/api/translate/stats', () => HttpResponse.json({ cached_entries_count: 0 })),
      http.get('/api/translate/dictionary', () => HttpResponse.json({ rules: [] })),
      http.get('/api/llm-prompts/models', () => HttpResponse.json([])),
      http.get('/api/llm-prompts/current-model', () => HttpResponse.json(null)),
      http.put('/api/llm-prompts/:key', async ({ request }) => {
        const body = await request.json()
        requests.push(body)
        return HttpResponse.json({ ...bubbleRecord, content: (body as { content: string }).content })
      }),
    )
    mountRealSettingsSection('/translation')
    expect(await screen.findByText('FuguMT')).toBeInTheDocument()
    const slider = document.querySelector<HTMLInputElement>('#translation-debounce')
    expect(slider).not.toBeNull()
    if (!slider) throw new Error('translation debounce slider was not rendered')
    fireEvent.change(slider, { target: { value: '750' } })
    expect(requests).toHaveLength(0)
    fireEvent.pointerUp(slider)
    await screen.findByText(/750ms/)
    expect(requests).toContainEqual({ content: '750' })
  })

  it('[REQ-381/AC-7] retains a failed translation debounce draft until explicit retry', async () => {
    const prompts = [
      { ...bubbleRecord, key: 'translation_provider', content: 'fugumt' },
      { ...bubbleRecord, key: 'translation_api_key', content: '' },
      { ...bubbleRecord, key: 'translation_api_url', content: '' },
      { ...bubbleRecord, key: 'translation_debounce', content: '500' },
    ]
    let requestCount = 0
    server.use(
      http.get('/api/llm-prompts', () => HttpResponse.json(prompts)),
      http.get('/api/snapshots', () => HttpResponse.json([])),
      http.get('/api/translate/stats', () => HttpResponse.json({ cached_entries_count: 0 })),
      http.get('/api/translate/dictionary', () => HttpResponse.json({ rules: [] })),
      http.get('/api/llm-prompts/models', () => HttpResponse.json([])),
      http.get('/api/llm-prompts/current-model', () => HttpResponse.json(null)),
      http.put('/api/llm-prompts/:key', async ({ request }) => {
        requestCount += 1
        const body = await request.json()
        return requestCount === 1
          ? HttpResponse.json({ detail: 'offline' }, { status: 503 })
          : HttpResponse.json({ ...bubbleRecord, content: (body as { content: string }).content })
      }),
    )
    mountRealSettingsSection('/translation')
    expect(await screen.findByText('FuguMT')).toBeInTheDocument()
    const slider = document.querySelector<HTMLInputElement>('#translation-debounce')
    if (!slider) throw new Error('translation debounce slider was not rendered')
    fireEvent.change(slider, { target: { value: '800' } })
    fireEvent.pointerUp(slider)
    expect(await screen.findByRole('alert')).toHaveTextContent('未保存')
    expect(slider).toHaveValue('800')
    expect(requestCount).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await screen.findByText('設定を保存しました')
    expect(requestCount).toBe(2)
  })

  it('[REQ-381/AC-7] keeps the workflow long-press value in memory and reports denied storage', async () => {
    server.use(http.get('/api/config', () => HttpResponse.json({ comfy_url: 'http://localhost:8188' })))
    const { router } = mountRealSettingsSection('/workflow')
    const slider = document.querySelector<HTMLInputElement>('#settings-longpress-multiselect')
    expect(slider).not.toBeNull()
    if (!slider) throw new Error('long-press slider was not rendered')
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    fireEvent.change(slider, { target: { value: '1.4' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('未保存')
    expect(slider).toHaveValue('1.4')
    expect(localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT)).toBeNull()
    storageSpy.mockRestore()
    expect(router.state.location.pathname).toBe('/workflow')
  })

  it('[REQ-381/AC-12] confirms unsaved base-model form edits before navigation', async () => {
    server.use(
      http.get('/api/base-models', () => HttpResponse.json([])),
      http.get('/api/checkpoint-mappings', () => HttpResponse.json([])),
      http.get('/api/comfy/checkpoints', () => HttpResponse.json([])),
    )
    const { router } = mountRealBaseModelSettings()
    fireEvent.click(screen.getByRole('button', { name: 'モデルマスタ管理' }))
    fireEvent.click(await screen.findByRole('button', { name: 'モデル追加' }))
    fireEvent.change(screen.getByPlaceholderText('モデル名を入力してください'), { target: { value: 'Draft model' } })
    await act(async () => { await router.navigate('/other') })
    expect(await screen.findByRole('dialog', { name: '未保存の設定' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings')
  })

  it('[REQ-381/AC-7] commits the VRAM threshold on mobile release with one real API payload', async () => {
    const requests: unknown[] = []
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', async ({ request }) => {
        const body = await request.json()
        requests.push(body)
        return HttpResponse.json({ vram_min_free_gb: 6, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })
      }),
    )
    mountRealSettingsSection('/vram')
    const slider = await screen.findByRole('slider', { name: '最小必要空き容量スライダー' })
    fireEvent.change(slider, { target: { value: '6' } })
    expect(requests).toHaveLength(0)
    fireEvent.pointerUp(slider)
    await screen.findByText('設定を保存しました')
    expect(requests).toEqual([{ vram_min_free_gb: 6, vram_guard_enabled: true }])
  })

  it('[REQ-381/AC-7] retains the VRAM threshold draft and error after a 503 response', async () => {
    let requestCount = 0
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', () => { requestCount += 1; return HttpResponse.json({ detail: 'offline' }, { status: 503 }) }),
    )
    mountRealSettingsSection('/vram')
    const slider = await screen.findByRole('slider', { name: '最小必要空き容量スライダー' })
    fireEvent.change(slider, { target: { value: '7' } })
    fireEvent.pointerUp(slider)
    expect(await screen.findByRole('alert')).toHaveTextContent('未保存')
    expect(slider).toHaveValue('7')
    expect(requestCount).toBe(1)
  })

  it('[REQ-381/AC-7] preserves desktop VRAM explicit Save behavior', async () => {
    const requests: unknown[] = []
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', async ({ request }) => {
        requests.push(await request.json())
        return HttpResponse.json({ vram_min_free_gb: 8, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })
      }),
    )
    mountRealSettingsSection('/vram', false)
    const slider = await screen.findByRole('slider', { name: '最小必要空き容量スライダー' })
    fireEvent.change(slider, { target: { value: '8' } })
    expect(requests).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'VRAM安全ガード設定を保存' }))
    await screen.findByText('設定を保存しました')
    expect(requests).toEqual([{ vram_min_free_gb: 8, vram_guard_enabled: true }])
  })

  it('[REQ-381/AC-7] sends a guard toggle with the last valid threshold while preserving invalid threshold text', async () => {
    const requests: unknown[] = []
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', async ({ request }) => {
        requests.push(await request.json())
        return HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: false, vram_free_gb: 6, vram_total_gb: 12 })
      }),
    )
    mountRealSettingsSection('/vram')
    const threshold = await screen.findByLabelText('最小必要空き容量 (vram_min_free_gb)')
    fireEvent.change(threshold, { target: { value: '' } })
    fireEvent.click(screen.getByRole('checkbox'))
    await screen.findByText('設定を保存しました')
    expect(requests).toEqual([{ vram_min_free_gb: 4, vram_guard_enabled: false }])
    expect(threshold).toHaveValue(null)
    expect(screen.getByText('未保存')).toBeInTheDocument()
  })

  it('[REQ-381/AC-7] property-checks threshold boundaries, invalid zero, and duplicate release events', async () => {
    const requests: Array<{ vram_min_free_gb: number; vram_guard_enabled: boolean }> = []
    let serverMin = 4
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: serverMin, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', async ({ request }) => {
        const body = await request.json() as { vram_min_free_gb: number; vram_guard_enabled: boolean }
        requests.push(body)
        serverMin = body.vram_min_free_gb
        return HttpResponse.json({ ...body, vram_free_gb: 6, vram_total_gb: 12 })
      }),
    )
    mountRealSettingsSection('/vram')
    const slider = await screen.findByRole('slider', { name: '最小必要空き容量スライダー' })
    const numberInput = screen.getByLabelText('最小必要空き容量 (vram_min_free_gb)')
    fireEvent.change(numberInput, { target: { value: '0' } })
    fireEvent.blur(numberInput)
    expect(requests).toHaveLength(0)
    for (const value of [2, 14]) {
      if (value === serverMin) continue
      const count = requests.length
      fireEvent.change(slider, { target: { value: String(value) } })
      fireEvent.pointerUp(slider)
      await waitFor(() => expect(requests).toHaveLength(count + 1))
      expect(requests[count]).toEqual({ vram_min_free_gb: value, vram_guard_enabled: true })
    }
    await fc.assert(fc.asyncProperty(fc.integer({ min: 4, max: 28 }), async (halfGb) => {
      const value = halfGb / 2
      const count = requests.length
      const unchanged = value === serverMin
      fireEvent.change(slider, { target: { value: String(value) } })
      expect(requests).toHaveLength(count)
      fireEvent.pointerUp(slider)
      fireEvent.keyUp(slider)
      fireEvent.blur(slider)
      if (unchanged) {
        expect(requests).toHaveLength(count)
      } else {
        await waitFor(() => expect(requests).toHaveLength(count + 1))
        expect(requests[count]).toEqual({ vram_min_free_gb: value, vram_guard_enabled: true })
      }
      await waitFor(() => expect(slider).toHaveValue(String(value)))
    }), { numRuns: 8 })
  })

  it('[REQ-381/AC-7] keeps the newest VRAM revision when an older delayed save acknowledges', async () => {
    const requests: number[] = []
    let releaseFirst: (() => void) | undefined
    server.use(
      http.get('/api/settings/vram', () => HttpResponse.json({ vram_min_free_gb: 4, vram_guard_enabled: true, vram_free_gb: 6, vram_total_gb: 12 })),
      http.put('/api/settings/vram', async ({ request }) => {
        const body = await request.json() as { vram_min_free_gb: number; vram_guard_enabled: boolean }
        requests.push(body.vram_min_free_gb)
        if (requests.length === 1) await new Promise<void>((resolve) => { releaseFirst = resolve })
        return HttpResponse.json({ ...body, vram_free_gb: 6, vram_total_gb: 12 })
      }),
    )
    mountRealSettingsSection('/vram')
    const slider = await screen.findByRole('slider', { name: '最小必要空き容量スライダー' })
    fireEvent.change(slider, { target: { value: '6' } })
    fireEvent.pointerUp(slider)
    await waitFor(() => expect(requests).toEqual([6]))
    fireEvent.change(slider, { target: { value: '8' } })
    fireEvent.pointerUp(slider)
    expect(requests).toEqual([6])
    releaseFirst?.()
    await waitFor(() => expect(requests).toEqual([6, 8]))
    await waitFor(() => expect(slider).toHaveValue('8'))
  })
})
