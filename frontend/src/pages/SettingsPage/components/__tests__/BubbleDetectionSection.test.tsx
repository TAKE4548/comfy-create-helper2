import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BubbleDetectionSection } from '../BubbleDetectionSection'
import type { BubbleCandidate } from '../../../../api/types'

const api = vi.hoisted(() => ({
  llmPromptsApi: { list: vi.fn(), update: vi.fn() },
  snapshotsApi: { list: vi.fn(), detectBubbleDebug: vi.fn() },
}))

vi.mock('../../../../api/client', () => api)

const snapshots = [
  { id: 7, workflow_id: 1, image_path: '/images/example.png', created_at: '2026-10-01T00:00:00Z' },
  { id: 8, workflow_id: 1, image_path: null, created_at: '2026-10-02T00:00:00Z' },
]

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { ...render(<QueryClientProvider client={queryClient}><BubbleDetectionSection isExpanded onToggle={vi.fn()} /></QueryClientProvider>), queryClient }
}

function loadImage() {
  const image = screen.getByAltText('作例画像 #7') as HTMLImageElement
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1000 }, naturalHeight: { configurable: true, value: 500 } })
  fireEvent.load(image)
}

describe('BubbleDetectionSection REQ-334 preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.llmPromptsApi.list.mockResolvedValue([{ key: 'bubble_detection_params', content: '{"min_area":1000,"min_brightness":150}' }])
    api.snapshotsApi.list.mockResolvedValue(snapshots)
    api.snapshotsApi.detectBubbleDebug.mockResolvedValue({ candidates: [{ x: 100, y: 50, w: 200, h: 100, status: 'accepted', area: 20000, aspect_ratio: 2, mean_brightness: 240 }] })
  })
  afterEach(() => cleanup())

  it('previews the real selected sample with unsaved sensitivity and overlays scaled candidates', async () => {
    renderSection()
    await screen.findByAltText('作例画像 #7')
    loadImage()
    fireEvent.change(screen.getByLabelText('最小面積 (min_area: 画素数)'), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText('最小輝度 (min_brightness: 0-255)'), { target: { value: '180' } })
    fireEvent.click(screen.getByRole('button', { name: '現在の感度でプレビュー' }))

    await waitFor(() => expect(api.snapshotsApi.detectBubbleDebug).toHaveBeenCalledWith(7, null, { min_area: 1250, min_brightness: 180 }))
    const overlay = await screen.findByTestId('bubble-candidate-overlay')
    expect(overlay).toHaveStyle({ left: '10%', top: '10%', width: '20%', height: '20%' })
    expect(screen.getByText('検出候補: 1 件')).toBeTruthy()
    expect(api.llmPromptsApi.update).not.toHaveBeenCalled()
  })

  it('retains sensitivity on error and drops a stale result after settings change', async () => {
    renderSection()
    await screen.findByAltText('作例画像 #7')
    loadImage()
    api.snapshotsApi.detectBubbleDebug.mockRejectedValueOnce(new Error('preview failed'))
    fireEvent.click(screen.getByRole('button', { name: '現在の感度でプレビュー' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('preview failed')
    expect(screen.getByLabelText('最小面積 (min_area: 画素数)')).toHaveValue(1000)

    let resolvePreview!: (value: { candidates: BubbleCandidate[] }) => void
    api.snapshotsApi.detectBubbleDebug.mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '現在の感度でプレビュー' }))
    fireEvent.change(screen.getByLabelText('最小面積 (min_area: 画素数)'), { target: { value: '1500' } })
    resolvePreview({ candidates: [{ x: 1, y: 1, w: 5, h: 5, status: 'stale', area: 25, aspect_ratio: 1, mean_brightness: 240 }] })
    await waitFor(() => expect(screen.getByLabelText('最小面積 (min_area: 画素数)')).toHaveValue(1500))
    expect(screen.queryByTestId('bubble-candidate-overlay')).toBeNull()
  })

  it('shows the exact save success only after persistence resolves', async () => {
    renderSection()
    await screen.findByAltText('作例画像 #7')
    fireEvent.change(screen.getByLabelText('最小面積 (min_area: 画素数)'), { target: { value: '1350' } })
    expect(screen.queryByText('設定を保存しました')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.llmPromptsApi.update).toHaveBeenCalledWith('bubble_detection_params', { content: '{"min_area":1350,"min_brightness":150}' }))
    expect(await screen.findByRole('button', { name: '設定を保存しました' })).toBeInTheDocument()
  })

  it('retains drafts across save failure and server refetch, and ignores stale save success', async () => {
    const { queryClient } = renderSection()
    await screen.findByAltText('作例画像 #7')
    const areaInput = screen.getByLabelText('最小面積 (min_area: 画素数)')
    fireEvent.change(areaInput, { target: { value: '1400' } })
    api.llmPromptsApi.update.mockRejectedValueOnce(new Error('storage unavailable'))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('storage unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent('設定は未保存です')
    expect(areaInput).toHaveValue(1400)
    queryClient.setQueryData(['llm-prompts'], [{ key: 'bubble_detection_params', content: '{"min_area":700,"min_brightness":40}' }])
    await waitFor(() => expect(areaInput).toHaveValue(1400))

    let resolveSave!: (value: unknown) => void
    api.llmPromptsApi.update.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.llmPromptsApi.update).toHaveBeenCalledTimes(2))
    fireEvent.change(areaInput, { target: { value: '1750' } })
    resolveSave({})
    await waitFor(() => expect(areaInput).toHaveValue(1750))
    expect(screen.queryByRole('button', { name: '設定を保存しました' })).toBeNull()
  })
})
