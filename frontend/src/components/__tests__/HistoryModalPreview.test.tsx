import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistoryModalPreview } from '../HistoryModalPreview'
import { promptMetadataApi, snapshotsApi } from '../../api/client'
import type { Workflow } from '../../api/types'
import { buildGenerationRecord, PROMPT_RECORD_KEY } from '../../utils/generationRecord'

vi.mock('../../api/client', () => ({
  albumsApi: { list: vi.fn().mockResolvedValue([{ name: 'Album A', items: [{ snapshot_id: 1 }] }, { name: 'Album B', items: [{ snapshot_id: 1 }] }]) },
  snapshotsApi: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  lorasApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  tagSetsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  promptMetadataApi: {
    get: vi.fn(),
    create: vi.fn(),
  },
}))

describe('HistoryModalPreview', () => {
  let queryClient: QueryClient
  const generationParams = (prompt: string, aspect: string, seed: number, steps: number) => {
    const workflow: Workflow = { id: 1, name: 'Recorded', created_at: '', json_body: {}, mappings: [
      { id: 1, master_id: 1, node_id: '1', role: 'positive', param_name: 'text', input_type: 'textarea', display_name: 'Prompt' },
      { id: 2, master_id: 2, node_id: '2', role: 'resolution_aspect', param_name: 'aspect', input_type: 'combo', display_name: 'Aspect ratio' },
      { id: 3, master_id: 3, node_id: '3', role: 'Sampler_Seed', param_name: 'seed', input_type: 'int', display_name: 'Seed' },
      { id: 4, master_id: 4, node_id: '4', role: 'steps', param_name: 'steps', input_type: 'int', display_name: 'Steps' },
    ] }
    const graph = { '1': { inputs: { text: prompt } }, '2': { inputs: { aspect } }, '3': { inputs: { seed } }, '4': { inputs: { steps } } }
    return { [PROMPT_RECORD_KEY]: JSON.stringify(buildGenerationRecord(workflow, graph, graph, {})) }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(promptMetadataApi.get).mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'image/png' }) }))
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it('[REQ-316/AC-1] treats empty saved params as authoritative and offers info even with missing metadata', async () => {
    vi.mocked(snapshotsApi.get).mockResolvedValueOnce({ id: 1, workflow_id: 1, params: {}, image_path: '', created_at: 'saved', loras: [], tag_sets: [] })
    localStorage.setItem('prompt-surgeon-meta-test-prompt-id-123', JSON.stringify({ paramValues: { Quality: 'must not appear' } }))
    renderComponent({ snapshotIds: [1] })
    fireEvent.click(screen.getByRole('button', { name: 'Show info' }))
    expect(await screen.findByText('未記録の項目がある可能性があります')).toBeInTheDocument()
    expect(screen.queryByText('must not appear')).not.toBeInTheDocument()
    expect(screen.getByText('Album A、Album B')).toBeInTheDocument()
    expect(promptMetadataApi.get).not.toHaveBeenCalled()
  })

  it('[REQ-316/AC-2] locks the image and close/navigation while saving tag associations', async () => {
    const saved = { id: 1, workflow_id: 1, params: {}, image_path: '', created_at: 'saved', loras: [], tag_sets: [] }
    vi.mocked(snapshotsApi.get).mockResolvedValue(saved)
    let finish!: (snapshot: typeof saved) => void
    vi.mocked(snapshotsApi.patch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const onClose = vi.fn(), onChangeIndex = vi.fn()
    const { rerender } = renderComponent({ images: ['image-a', 'image-b'], snapshotIds: [1, null], onClose, onChangeIndex })
    fireEvent.click(screen.getByRole('button', { name: 'Show info' }))
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'タグ関連を編集' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    rerender(<QueryClientProvider client={queryClient}><HistoryModalPreview isOpen onClose={onClose} images={['image-a', 'image-b']} currentIndex={1}
      onChangeIndex={onChangeIndex} snapshotIds={[1, null]} /></QueryClientProvider>)
    expect(screen.getByAltText('Preview 2')).toHaveAttribute('src', 'image-a')
    expect(onClose).not.toHaveBeenCalled()
    expect(onChangeIndex).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    finish(saved)
    await waitFor(() => expect(screen.getByAltText('Preview 2')).toHaveAttribute('src', 'image-b'))
  })

  const renderComponent = (props: Partial<React.ComponentProps<typeof HistoryModalPreview>> = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      images: ['/output/image1.png?t=test-prompt-id-123'],
      currentIndex: 0,
      onChangeIndex: vi.fn(),
      snapshotIds: [null],
    }
    return render(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview {...defaultProps} {...props} />
      </QueryClientProvider>
    )
  }

  it('renders Info button when metadata is available from localStorage and toggles panel', async () => {
    localStorage.setItem(
      'prompt-surgeon-meta-test-prompt-id-123',
      JSON.stringify({
        paramValues: {
          prompt: '1girl, fantasy, solo',
          negative: 'low quality',
          aspect_ratio: '16:9',
          sampler_name: 'euler_ancestral',
          scheduler: 'karras',
          cfg_scale: '7.5',
          steps: '30',
          seed: '999888',
        },
      })
    )

    renderComponent()

    const infoButton = await screen.findByRole('button', { name: /show info/i })
    expect(infoButton).toBeDefined()

    fireEvent.click(infoButton)
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))

    // Panel content assertions
    expect(await screen.findByText('1girl, fantasy, solo')).toBeDefined()
    expect(screen.getByText('low quality')).toBeDefined()
    expect(screen.getByText('16:9')).toBeDefined()
    expect(screen.getByText('euler_ancestral')).toBeDefined()
    expect(screen.getByText('karras')).toBeDefined()
    expect(screen.getByText('7.5')).toBeDefined()
    expect(screen.getByText('30')).toBeDefined()
    expect(screen.getByText('999888')).toBeDefined()
  })

  it('fetches server metadata when not found in localStorage', async () => {
    vi.mocked(promptMetadataApi.get).mockResolvedValue({
      prompt_id: 'test-prompt-id-123',
      workflow_id: 1,
      param_values: {
        prompt: 'cyberpunk street',
        resolution_aspect: '3:4',
        steps: '25',
      },
      applied_assets: null,
      created_at: '2026-09-07T00:00:00',
    })

    renderComponent()

    await waitFor(() => {
      expect(promptMetadataApi.get).toHaveBeenCalledWith('test-prompt-id-123')
    })

    const infoButton = await screen.findByRole('button', { name: /show info/i })
    fireEvent.click(infoButton)
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))

    expect(await screen.findByText('cyberpunk street')).toBeDefined()
    expect(screen.getByText('3:4')).toBeDefined()
    expect(screen.getByText('25')).toBeDefined()
  })

  it('keeps the new image isolated while its server metadata is pending, then shows its recorded facts', async () => {
    localStorage.setItem('prompt-surgeon-meta-image-a', JSON.stringify({ paramValues: generationParams('A recorded prompt', '1:1', 111, 20) }))
    let resolveB!: (value: { prompt_id: string; workflow_id: number; param_values: Record<string, unknown>; applied_assets: null; created_at: string }) => void
    vi.mocked(promptMetadataApi.get).mockImplementation(() => new Promise((resolve) => { resolveB = resolve }))
    const images = ['/a.png?t=image-a', '/b.png?t=image-b']
    const { rerender } = renderComponent({ images, currentIndex: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /show info/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))
    expect(await screen.findByText('A recorded prompt')).toBeDefined()

    rerender(<QueryClientProvider client={queryClient}><HistoryModalPreview isOpen onClose={vi.fn()} images={images} currentIndex={1} onChangeIndex={vi.fn()} snapshotIds={[null, null]} /></QueryClientProvider>)
    await waitFor(() => expect(promptMetadataApi.get).toHaveBeenCalledWith('image-b'))
    expect(screen.queryByText('A recorded prompt')).toBeNull()
    expect(screen.queryByText('B recorded prompt')).toBeNull()

    resolveB({ prompt_id: 'image-b', workflow_id: 1, param_values: generationParams('B recorded prompt', '3:2', 99123, 27), applied_assets: null, created_at: 'saved' })
    expect(await screen.findByText('B recorded prompt')).toBeDefined()
    expect(screen.getByText('3:2')).toBeDefined()
    expect(screen.getAllByText('99123').length).toBeGreaterThan(0)
    expect(screen.getByText('27')).toBeDefined()
    expect(screen.queryByText('A recorded prompt')).toBeNull()
  })

  it('shows the switched image local record synchronously even when its query cache already contains null', async () => {
    localStorage.setItem('prompt-surgeon-meta-image-a', JSON.stringify({ paramValues: generationParams('A recorded prompt', '1:1', 111, 20) }))
    localStorage.setItem('prompt-surgeon-meta-image-b', JSON.stringify({ paramValues: generationParams('B recorded prompt', '3:2', 99123, 27) }))
    queryClient.setQueryData(['prompt-metadata', 'image-b'], null, { updatedAt: Date.now() - 11 * 60 * 1000 })
    const images = ['/a.png?t=image-a', '/b.png?t=image-b']
    const { rerender } = renderComponent({ images, currentIndex: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /show info/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))
    expect(await screen.findByText('A recorded prompt')).toBeDefined()

    rerender(<QueryClientProvider client={queryClient}><HistoryModalPreview isOpen onClose={vi.fn()} images={images} currentIndex={1} onChangeIndex={vi.fn()} snapshotIds={[null, null]} /></QueryClientProvider>)
    expect(screen.getByText('B recorded prompt')).toBeDefined()
    expect(screen.getByText('3:2')).toBeDefined()
    expect(screen.getAllByText('99123').length).toBeGreaterThan(0)
    expect(screen.getByText('27')).toBeDefined()
    expect(screen.queryByText('A recorded prompt')).toBeNull()

    act(() => {
      queryClient.setQueryData(['prompt-metadata', 'image-a'], {
        paramValues: generationParams('Late A prompt', '1:1', 111, 20),
      })
    })
    expect(screen.getByText('B recorded prompt')).toBeDefined()
    expect(screen.queryByText('Late A prompt')).toBeNull()
  })

  it('shows local frozen facts while pending, then adds only the matching server completion time', async () => {
    const localValues = generationParams('Frozen local prompt', '1:1', 13579, 20)
    const localRecord = JSON.parse(localValues[PROMPT_RECORD_KEY])
    localRecord.prompt_id = 'image-a'
    localValues[PROMPT_RECORD_KEY] = JSON.stringify(localRecord)
    localStorage.setItem('prompt-surgeon-meta-image-a', JSON.stringify({ paramValues: localValues }))

    const remoteValues = generationParams('Different remote prompt', '3:2', 97531, 27)
    const remoteRecord = JSON.parse(remoteValues[PROMPT_RECORD_KEY])
    remoteRecord.prompt_id = 'image-a'
    remoteRecord.completed_at = '2026-10-09T12:34:56.000Z'
    remoteValues[PROMPT_RECORD_KEY] = JSON.stringify(remoteRecord)
    let resolveRemote!: (value: { prompt_id: string; workflow_id: number; param_values: Record<string, unknown>; applied_assets: null; created_at: string }) => void
    vi.mocked(promptMetadataApi.get).mockImplementationOnce(() => new Promise(resolve => { resolveRemote = resolve }))

    renderComponent({ images: ['/a.png?t=image-a'] })
    fireEvent.click(await screen.findByRole('button', { name: /show info/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /Parameters & Assets/ }))
    expect(await screen.findByText('Frozen local prompt')).toBeInTheDocument()
    expect(screen.getAllByText('13579').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未記録').length).toBeGreaterThan(0)

    await act(async () => resolveRemote({
      prompt_id: 'image-a', workflow_id: 1, param_values: remoteValues, applied_assets: null, created_at: 'saved',
    }))

    expect(await screen.findByText('2026-10-09T12:34:56.000Z')).toBeInTheDocument()
    expect(screen.getByText('Frozen local prompt')).toBeInTheDocument()
    expect(screen.getByText('1:1')).toBeInTheDocument()
    expect(screen.getAllByText('13579').length).toBeGreaterThan(0)
    expect(screen.queryByText('Different remote prompt')).toBeNull()
    expect(screen.queryByText('97531')).toBeNull()
  })

  it('renders correctly when toggled from isOpen=false to isOpen=true without hook mismatch error', async () => {
    const { rerender } = renderComponent({ isOpen: false })

    expect(screen.queryByRole('button', { name: /close preview/i })).toBeNull()

    // Rerender with isOpen=true to simulate modal opening
    rerender(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview
          isOpen={true}
          onClose={vi.fn()}
          images={['/output/image1.png?t=test-prompt-id-123']}
          currentIndex={0}
          onChangeIndex={vi.fn()}
          snapshotIds={[null]}
        />
      </QueryClientProvider>
    )

    const closeButton = await screen.findByRole('button', { name: /close preview/i })
    expect(closeButton).toBeDefined()
  })

  it('renders auto-follow toggle button and fires onToggleAutoFollow on click', async () => {
    const onToggleAutoFollow = vi.fn()
    const { rerender } = renderComponent({
      previewAutoFollow: true,
      onToggleAutoFollow,
    })

    const toggleBtn = screen.getByRole('button', { name: /最新画像を自動追従中/i })
    expect(toggleBtn).toBeDefined()
    expect(toggleBtn.id).toBe('preview-autofollow-toggle-modal')

    fireEvent.click(toggleBtn)
    expect(onToggleAutoFollow).toHaveBeenCalledTimes(1)

    rerender(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview
          isOpen={true}
          onClose={vi.fn()}
          images={['/output/image1.png?t=test-prompt-id-123']}
          currentIndex={0}
          onChangeIndex={vi.fn()}
          previewAutoFollow={false}
          onToggleAutoFollow={onToggleAutoFollow}
        />
      </QueryClientProvider>
    )

    const lockedBtn = screen.getByRole('button', { name: /現在の画像に固定中/i })
    expect(lockedBtn).toBeDefined()
  })

  it('keeps subcomponents and callbacks stable across renders to prevent unnecessary re-rendering', async () => {
    const onClose = vi.fn()
    const onChangeIndex = vi.fn()
    const { rerender } = renderComponent({
      images: ['/output/image1.png', '/output/image2.png'],
      currentIndex: 0,
      onClose,
      onChangeIndex,
    })

    // Initial render checks
    expect(screen.getByAltText('Preview 1')).toBeInTheDocument()
    const nextBtn = screen.getByRole('button', { name: '次の画像' })
    expect(nextBtn).toBeInTheDocument()
    expect(nextBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(nextBtn).toHaveClass('min-h-11', 'min-w-11')

    // Trigger mouse move to ensure resetControlsTimeout does not disrupt DOM
    fireEvent.mouseMove(screen.getByAltText('Preview 1'))

    // Re-render with same props
    rerender(
      <QueryClientProvider client={queryClient}>
        <HistoryModalPreview
          isOpen={true}
          onClose={onClose}
          images={['/output/image1.png', '/output/image2.png']}
          currentIndex={0}
          onChangeIndex={onChangeIndex}
          snapshotIds={[null, null]}
        />
      </QueryClientProvider>
    )

    expect(screen.getByAltText('Preview 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の画像' })).toBeInTheDocument()
  })

  it('uses Escape first to leave fullscreen, then to close the preview', () => {
    const onClose = vi.fn()
    renderComponent({ images: ['image-a', 'image-b'], onClose })
    const originalFullscreen = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(() => {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: null })
        document.dispatchEvent(new Event('fullscreenchange'))
      }),
    })
    const modal = document.querySelector('.modal-backdrop') as HTMLDivElement & { requestFullscreen: () => void }
    modal.requestFullscreen = vi.fn(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, writable: true, value: modal })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    fireEvent.click(screen.getByAltText('Preview 1'))
    expect(document.fullscreenElement).toBe(modal)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.fullscreenElement).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    if (originalFullscreen) Object.defineProperty(document, 'fullscreenElement', originalFullscreen)
    else delete (document as any).fullscreenElement
    if (originalExitFullscreen) Object.defineProperty(document, 'exitFullscreen', originalExitFullscreen)
    else delete (document as any).exitFullscreen
  })

  it('supports fit/100/200 zoom, enlarged-image panning, and explicit A/B boundary comparison', () => {
    renderComponent({ images: ['image-a', 'image-b', 'image-c'] })

    const image = screen.getByAltText('Preview 1')
    fireEvent.click(screen.getByRole('button', { name: '100%' }))
    expect(image).toHaveClass('max-w-none', 'max-h-none')
    fireEvent.click(screen.getByRole('button', { name: '200%' }))
    expect(image).toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' })
    const viewer = image.parentElement!
    const originalPointerEvent = window.PointerEvent
    window.PointerEvent = MouseEvent as typeof PointerEvent
    fireEvent.pointerDown(image, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(viewer, { pointerId: 1, clientX: 30, clientY: 25 })
    fireEvent.pointerUp(viewer, { pointerId: 1 })
    window.PointerEvent = originalPointerEvent
    expect(image).toHaveStyle({ transform: 'translate(20px, 15px) scale(2)' })
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(image).toHaveClass('max-w-full', 'max-h-full')

    fireEvent.click(screen.getByRole('button', { name: '画像比較' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'A画像' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'B画像' }), { target: { value: '0' } })
    expect(screen.getByAltText('Comparison A')).toHaveAttribute('src', 'image-c')
    expect(screen.getByAltText('Comparison B')).toHaveAttribute('src', 'image-a')
    const comparisonLayer = screen.getByTestId('comparison-b-layer')
    fireEvent.change(screen.getByRole('slider', { name: '比較境界' }), { target: { value: '70' } })
    expect(comparisonLayer).toHaveStyle({ clipPath: 'inset(0 30% 0 0)' })

    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(comparisonLayer).toHaveStyle({ clipPath: 'inset(0 0% 0 0)' })
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(comparisonLayer).toHaveStyle({ clipPath: 'inset(0 30% 0 0)' })
  })
})
