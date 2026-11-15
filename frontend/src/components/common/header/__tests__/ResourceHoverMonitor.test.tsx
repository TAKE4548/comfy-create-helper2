import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { ResourceHoverMonitor } from '../ResourceHoverMonitor'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { SystemStats } from '../../../../store/types'
import { useManagerStatus } from '../../../../hooks/useManagerStatus'
import { resetManagerOperationStoreForTests, tryBeginManagerOperation } from '../../../../hooks/useComfyFreeMemory'
import type { ManagerStatus } from '../../../../api/domains/systemManager'

// Plain delegating function (not vi.fn) so vi.restoreAllMocks() in existing tests cannot clear it.
let managerReturn: ReturnType<typeof useManagerStatus>
vi.mock('../../../../hooks/useManagerStatus', () => ({ useManagerStatus: () => managerReturn }))

const idleStatus = {
  fe: { running: true, status: 'running' },
  be: { running: true, status: 'running' },
  comfy: { running: true, status: 'LISTEN', execution_state: 'idle', queue_running: 0, queue_pending: 0 },
  action_in_progress: null,
} as unknown as ManagerStatus

function setManager(status: ManagerStatus | null = idleStatus, available = true, refetch: () => Promise<unknown> = () => Promise.resolve()) {
  const refetchMock = vi.fn(refetch)
  managerReturn = { status, available, refetch: refetchMock } as unknown as ReturnType<typeof useManagerStatus>
  return refetchMock
}

const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response)
const ACCEPTED_BODY = { status: 'ok', action: 'free-memory', outcome: 'accepted' }

function stubFetch(onPost: () => Promise<Response>) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === 'POST' ? onPost() : Promise.resolve(jsonResponse(idleStatus)))
  vi.stubGlobal('fetch', fetchMock)
  return () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length
}

const DEFAULT_ANCHOR = { top: 11, bottom: 39, left: 300, right: 330, x: 300, y: 11, width: 30, height: 28, toJSON() {} }

/** Environment-API-level geometry stub only (no component/placement mocks). */
function stubGeometry({
  vw = 1280,
  vh = 800,
  anchor = DEFAULT_ANCHOR,
}: { vw?: number; vh?: number; anchor?: Record<string, unknown> } = {}) {
  window.innerWidth = vw
  window.innerHeight = vh
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(anchor as DOMRect)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 250 })
}

/** Header-aware geometry: [data-page-header-root] returns the header rect; other elements get DEFAULT_ANCHOR. */
function stubGeometryWithHeader({ vw, vh, headerBottom }: { vw: number; vh: number; headerBottom: number }) {
  window.innerWidth = vw
  window.innerHeight = vh
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-page-header-root]')) {
      return { top: 0, bottom: headerBottom, left: 0, right: vw, x: 0, y: 0, width: vw, height: headerBottom, toJSON() {} } as DOMRect
    }
    return DEFAULT_ANCHOR as DOMRect
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 250 })
}

const mockStats: SystemStats = {
  cpu_pct: 35.4,
  ram_pct: 62.1,
  ram_used_gb: 9.8,
  ram_total_gb: 16.0,
  gpu_pct: 45.0,
  vram_pct: 78.5,
  vram_used_gb: 6.3,
  vram_total_gb: 8.0,
  ts: 1234567890,
}

describe('ResourceHoverMonitor', () => {
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight

  beforeEach(() => {
    useGenerationStore.setState({ systemStats: mockStats })
    setManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetManagerOperationStoreForTests()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).offsetWidth
    window.innerWidth = originalInnerWidth
    window.innerHeight = originalInnerHeight
  })

  it('renders chips in strict order CPU -> RAM -> GPU -> VRAM on desktop', () => {
    const { container } = render(<ResourceHoverMonitor />)
    const chipsContainer = container.querySelector('.hidden.sm\\:flex')
    expect(chipsContainer).toBeTruthy()
    const text = chipsContainer?.textContent ?? ''
    
    const cpuIdx = text.indexOf('CPU')
    const ramIdx = text.indexOf('RAM')
    const gpuIdx = text.indexOf('GPU')
    const vramIdx = text.indexOf('VRAM')

    expect(cpuIdx).toBeGreaterThanOrEqual(0)
    expect(ramIdx).toBeGreaterThan(cpuIdx)
    expect(gpuIdx).toBeGreaterThan(ramIdx)
    expect(vramIdx).toBeGreaterThan(gpuIdx)
  })

  it('applies purple accent styling to VRAM chip', () => {
    const { container } = render(<ResourceHoverMonitor />)
    const chips = container.querySelectorAll('.hidden.sm\\:flex > span')
    expect(chips.length).toBe(4)
    const vramChip = chips[3]
    expect(vramChip.textContent).toContain('VRAM')
    expect(vramChip.className).toContain('text-purple-400')
  })

  it('expands 250px HoverCard on mouse enter and hides on mouse leave', () => {
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')

    expect(screen.queryByTestId('resource-hover-card')).toBeNull()

    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard).toBeTruthy()
    expect(hoverCard.className).toContain('w-[250px]')
    expect(hoverCard.textContent).toContain('6.3 / 8.0 GB')
    expect(hoverCard.textContent).toContain('9.8 / 16.0 GB')

    fireEvent.mouseLeave(monitor)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('safely handles null telemetry with fallback placeholders (RT-1)', () => {
    useGenerationStore.setState({ systemStats: null })
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')

    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill.textContent).toContain('VRAM --%')
    expect(pill.textContent).toContain('▼')

    fireEvent.mouseEnter(monitor)
    const hoverCard = screen.getByTestId('resource-hover-card')
    expect(hoverCard.textContent).toContain('-- / -- GB')
    expect(hoverCard.textContent).toContain('--%')
  })

  it('renders mobile collapsed pill with 96px width and VRAM percentage', () => {
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill.className).toContain('w-[96px]')
    expect(pill.textContent).toContain('VRAM 79%')
    expect(pill.textContent).toContain('▼')
  })

  it('[REQ-363/AC-6] displays dropdown card with proportional VRAM and RAM gauges anchored below pill', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')

    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay.className).toContain('w-[240px]')
    expect(overlay.hasAttribute('data-header-menu-panel')).toBe(true)
    expect(overlay.style.position).toBe('fixed')
    expect(overlay.style.top).toBe('45px')
    expect(overlay.className).toContain('z-[var(--z-header-menu)]')
    expect(overlay.className).toContain('bg-surface-2')

    // Proportional progress bars & dynamic update
    const vramBar = overlay.querySelector('.bg-purple-500') as HTMLElement
    const ramBar = overlay.querySelector('.bg-blue-500') as HTMLElement
    expect(vramBar).toBeTruthy()
    expect(ramBar).toBeTruthy()
    expect(vramBar.style.width).toBe('78.5%')
    expect(ramBar.style.width).toBe('62.1%')

    // Dynamic telemetry update check
    act(() => {
      useGenerationStore.setState({ systemStats: { ...mockStats, vram_pct: 95.0 } })
    })
    expect(vramBar.style.width).toBe('95%')

    expect(overlay.textContent).toContain('VRAM')
    expect(overlay.textContent).toContain('6.3 / 8.0 GB')
    expect(overlay.textContent).toContain('RAM')
    expect(overlay.textContent).toContain('9.8 / 16.0 GB')
    expect(overlay.textContent).toContain('CPU: 35%')
    expect(overlay.textContent).toContain('GPU: 45%')

    const closeBtn = screen.getByTestId('mobile-overlay-close')
    fireEvent.click(closeBtn)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
    expect(screen.getByTestId('mobile-vram-pill')).toBeTruthy()
    expect(pill).toHaveAttribute('aria-expanded', 'false')
  })

  // --- A3: mobile overlay (HeaderDropdown) ---

  it('[REQ-346/AC-1] mobile overlay is rendered in a body-level fixed layer below the pill', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.style.position).toBe('fixed')
    expect(overlay.style.top).toBe('45px')
    expect(overlay.className).not.toContain('absolute')
  })

  it('[REQ-346/AC-4] pill press toggles the overlay closed; close button and outside pointerdown also close', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    const pill = screen.getByTestId('mobile-vram-pill')

    fireEvent.click(pill)
    expect(screen.queryByTestId('mobile-resource-overlay')).not.toBeNull()
    fireEvent.click(pill)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()

    fireEvent.click(pill)
    fireEvent.click(screen.getByTestId('mobile-overlay-close'))
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()

    fireEvent.click(pill)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
  })

  it('[REQ-346/AC-6] closes the mobile overlay when the viewport grows to 640px or wider, stays open while resizing within the mobile range', () => {
    stubGeometry({ vw: 375, vh: 667 })
    render(<ResourceHoverMonitor />)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))

    window.innerWidth = 600
    fireEvent(window, new Event('resize'))
    expect(screen.queryByTestId('mobile-resource-overlay')).not.toBeNull()

    window.innerWidth = 800
    fireEvent(window, new Event('resize'))
    expect(screen.queryByTestId('mobile-resource-overlay')).toBeNull()
  })

  it('[REQ-346/AC-3] mobile overlay height is capped by viewport height (maxHeight)', () => {
    stubGeometry({ vw: 375, vh: 360 })
    render(<ResourceHoverMonitor />)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay.style.maxHeight).toBe('307px')
    expect(overlay.className).toContain('overflow-y-auto')
  })

  // --- A4: desktop hover card (HeaderDropdown, hover-driven) ---

  it('[REQ-346/AC-1] hover card is a body-level fixed layer below the monitor and does not live inside it', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')
    expect(screen.queryByTestId('resource-hover-card-bridge')).toBeNull()
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()

    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    expect(monitor.contains(card)).toBe(false)
    expect(card.parentElement).toBe(document.body)
    expect(card.style.position).toBe('fixed')
    expect(card.style.top).toBe('45px')
    expect(card.hasAttribute('data-header-menu-panel')).toBe(true)
    expect(card.hasAttribute('role')).toBe(false)
    expect(card.querySelector(':scope > [role="group"][aria-label="リソース詳細"]')).not.toBeNull()
    expect(card.className).toContain('z-[var(--z-header-menu)]')
    expect(card.className).toContain('w-[250px]')
    expect(card.className).toContain('hidden')
    expect(card.className).toContain('sm:block')

    const bridge = screen.getByTestId('resource-hover-card-bridge')
    expect(monitor.contains(bridge)).toBe(false)
    expect(bridge.parentElement).toBe(document.body)
    expect(bridge.style.position).toBe('fixed')
    expect(bridge.style.height).toBe('7px')
    expect(bridge.getAttribute('aria-hidden')).toBe('true')
    expect(bridge.hasAttribute('data-header-menu-bridge')).toBe(true)
  })

  it('[REQ-346/AC-1] A4 hover card top is the header bottom + 6 and the bridge spans the trigger bottom to the card top', () => {
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118 })
    render(<div data-page-header-root=""><ResourceHoverMonitor /></div>)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    const card = screen.getByTestId('resource-hover-card')
    expect(card.style.top).toBe('124px')
    expect(card.style.maxHeight).toBe('668px')
    const bridge = screen.getByTestId('resource-hover-card-bridge')
    expect(bridge.style.top).toBe('39px')
    expect(bridge.style.height).toBe('86px')
    expect(bridge.style.left).toBe('300px')
    expect(bridge.style.width).toBe('30px')
  })

  it('[REQ-346/AC-1] A3 mobile overlay top is the header bottom + 6 (mobile wrapped header)', () => {
    stubGeometryWithHeader({ vw: 375, vh: 667, headerBottom: 118 })
    render(<div data-page-header-root=""><ResourceHoverMonitor /></div>)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay.style.top).toBe('124px')
    expect(screen.queryByTestId('mobile-resource-overlay-bridge')).toBeNull()
  })

  it('[REQ-346/AC-6] A4 renders no bridge while the card has no layout box (display:none below 640px)', () => {
    stubGeometry()
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 })
    render(<ResourceHoverMonitor />)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    expect(screen.queryByTestId('resource-hover-card-bridge')).toBeNull()
  })

  it('[REQ-346/AC-6] A4 bridge height follows the header bottom on resize/scroll', () => {
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 118 })
    render(<div data-page-header-root=""><ResourceHoverMonitor /></div>)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    expect(screen.getByTestId('resource-hover-card-bridge').style.height).toBe('86px')

    vi.restoreAllMocks()
    stubGeometryWithHeader({ vw: 1280, vh: 800, headerBottom: 150 })
    fireEvent(window, new Event('scroll'))
    expect(screen.getByTestId('resource-hover-card-bridge').style.height).toBe('118px')
    expect(screen.getByTestId('resource-hover-card').style.top).toBe('156px')
  })

  it('[REQ-346/AC-4] pointerdown on the A4 bridge does not close the card; outside pointerdown closes it', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    const bridge = screen.getByTestId('resource-hover-card-bridge')
    fireEvent.pointerDown(bridge)
    fireEvent.mouseDown(bridge)
    expect(screen.queryByTestId('resource-hover-card')).not.toBeNull()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('[REQ-346/AC-2] moving the pointer from the monitor or bridge into the card keeps it open (hover continuity)', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')
    fireEvent.mouseEnter(monitor)
    const card = screen.getByTestId('resource-hover-card')
    const bridge = screen.getByTestId('resource-hover-card-bridge')

    fireEvent.mouseOut(monitor, { relatedTarget: card })
    expect(screen.queryByTestId('resource-hover-card')).not.toBeNull()
    fireEvent.mouseOut(bridge, { relatedTarget: card })
    const kept = screen.getByTestId('resource-hover-card')
    expect(kept.textContent).toContain('CPU:')
    expect(kept.textContent).toContain('GPU:')
  })

  it('[REQ-346/AC-4] leaving the monitor/card or pressing outside closes the hover card; there is no click toggle', () => {
    stubGeometry()
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')

    fireEvent.mouseEnter(monitor)
    fireEvent.click(monitor)
    expect(screen.queryByTestId('resource-hover-card')).not.toBeNull()

    fireEvent.mouseOut(screen.getByTestId('resource-hover-card'), { relatedTarget: document.body })
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()

    fireEvent.mouseEnter(monitor)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()

    fireEvent.mouseEnter(monitor)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('[REQ-346/AC-3] hover card height is capped by the viewport (maxHeight) and scrolls inside', () => {
    stubGeometry({ vw: 1280, vh: 360 })
    render(<ResourceHoverMonitor />)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    const card = screen.getByTestId('resource-hover-card')
    expect(card.style.maxHeight).toBe('307px')
    expect(card.className).toContain('overflow-y-auto')
    expect(card.className).toContain('overscroll-contain')
  })

  it('[REQ-346/AC-5] hover card stays inside the viewport for 640, 768 and 1280 wide viewports (align end)', () => {
    for (const vw of [640, 768, 1280]) {
      stubGeometry({ vw, vh: 800, anchor: { top: 11, bottom: 39, left: vw - 200, right: vw, x: vw - 200, y: 11, width: 200, height: 28, toJSON() {} } })
      const { unmount } = render(<ResourceHoverMonitor />)
      fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
      const card = screen.getByTestId('resource-hover-card')
      expect(parseFloat(card.style.left)).toBe(vw - 258)
      expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(8)
      unmount()
      vi.restoreAllMocks()
    }
  })

  it('[REQ-346/AC-6] hover card recomputes maxHeight on resize while hovered and closes when the monitor scrolls offscreen', () => {
    stubGeometry({ vw: 1280, vh: 667 })
    render(<ResourceHoverMonitor />)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    expect(screen.getByTestId('resource-hover-card').style.maxHeight).toBe('614px')

    window.innerHeight = 360
    fireEvent(window, new Event('resize'))
    expect(screen.getByTestId('resource-hover-card').style.maxHeight).toBe('307px')

    vi.restoreAllMocks()
    stubGeometry({ vw: 1280, vh: 360, anchor: { ...DEFAULT_ANCHOR, bottom: -10 } })
    fireEvent(window, new Event('scroll'))
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
  })

  it('[REQ-346/AC-1] telemetry null still renders the hover card inside the fixed layer', () => {
    stubGeometry()
    useGenerationStore.setState({ systemStats: null })
    render(<ResourceHoverMonitor />)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    const card = screen.getByTestId('resource-hover-card')
    expect(card.parentElement).toBe(document.body)
    expect(card.style.position).toBe('fixed')
  })

  // --- REQ-412: ComfyUI free-memory action in the resource panels ---

  const openCard = () => {
    render(<ResourceHoverMonitor />)
    const monitor = screen.getByTestId('resource-hover-monitor')
    fireEvent.mouseEnter(monitor)
    return monitor
  }
  const freeButton = () => screen.getByTestId('resource-free-memory-button') as HTMLButtonElement

  it('[REQ-412/AC-1] hover card shows the ComfyUI free-memory button as its last section and stays open when the pointer moves onto it', async () => {
    stubGeometry()
    const posts = stubFetch(() => Promise.resolve(jsonResponse(ACCEPTED_BODY)))
    const monitor = openCard()
    const card = screen.getByTestId('resource-hover-card')
    const group = card.querySelector(':scope > [role="group"]') as HTMLElement
    expect(group.lastElementChild).toBe(screen.getByTestId('resource-free-memory'))
    expect(freeButton().textContent).toContain('ComfyUI メモリ解放')
    expect(screen.getByRole('button', { name: 'ComfyUI メモリ解放' })).toBe(freeButton())
    await waitFor(() => expect(freeButton()).toBeEnabled())

    fireEvent.mouseOut(monitor, { relatedTarget: freeButton() })
    fireEvent.mouseOut(screen.getByTestId('resource-hover-card-bridge'), { relatedTarget: freeButton() })
    expect(screen.queryByTestId('resource-hover-card')).not.toBeNull()

    fireEvent.click(freeButton())
    await waitFor(() => expect(posts()).toBe(1))
  })

  it('[REQ-412/AC-2] mobile overlay shows the free-memory button as its last section and a tap sends the request', async () => {
    stubGeometry({ vw: 375, vh: 667 })
    const posts = stubFetch(() => Promise.resolve(jsonResponse(ACCEPTED_BODY)))
    render(<ResourceHoverMonitor />)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay.lastElementChild).toBe(screen.getByTestId('resource-free-memory'))
    expect(overlay.contains(freeButton())).toBe(true)
    await waitFor(() => expect(freeButton()).toBeEnabled())
    fireEvent.click(freeButton())
    await waitFor(() => expect(posts()).toBe(1))
  })

  it('[REQ-412/AC-3] the header button is disabled with a busy indicator until the response and status refresh finish', async () => {
    stubGeometry()
    let resolvePost!: (r: Response) => void
    const posts = stubFetch(() => new Promise<Response>((resolve) => { resolvePost = resolve }))
    const refetchResolvers: Array<() => void> = []
    const refetch = setManager(idleStatus, true, () => new Promise<void>((resolve) => { refetchResolvers.push(resolve) }))
    openCard()
    await waitFor(() => expect(freeButton()).toBeEnabled())

    fireEvent.click(freeButton())
    await waitFor(() => expect(freeButton()).toBeDisabled())
    expect(freeButton().getAttribute('aria-busy')).toBe('true')
    expect(freeButton().querySelector('svg.animate-spin')).not.toBeNull()
    fireEvent.click(freeButton())
    fireEvent.click(freeButton())
    expect(posts()).toBe(1)

    await act(async () => { resolvePost(jsonResponse(ACCEPTED_BODY)) })
    await waitFor(() => expect(refetchResolvers.length).toBe(1))
    expect(freeButton()).toBeDisabled()
    await act(async () => { refetchResolvers[0]() })
    await waitFor(() => expect(refetchResolvers.length).toBe(2))
    expect(freeButton()).toBeDisabled()
    await act(async () => { refetchResolvers[1]() })
    await waitFor(() => expect(freeButton()).toBeEnabled())
    expect(refetch).toHaveBeenCalledTimes(2)
    expect(freeButton().getAttribute('aria-busy')).toBe('false')
    expect(posts()).toBe(1)
  })

  it('[REQ-412/AC-4] acceptance feedback is shown in the panel and survives closing and reopening the card', async () => {
    stubGeometry()
    stubFetch(() => Promise.resolve(jsonResponse(ACCEPTED_BODY)))
    const monitor = openCard()
    await waitFor(() => expect(freeButton()).toBeEnabled())
    fireEvent.click(freeButton())
    const accepted = '解放要求を受け付けました。空き容量は監視値で確認してください'
    await waitFor(() => expect(screen.getByTestId('resource-free-memory-status').textContent).toBe(accepted))
    await waitFor(() => expect(freeButton()).toBeEnabled())
    const status = screen.getByTestId('resource-free-memory-status')
    expect(status.getAttribute('role')).toBe('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).not.toMatch(/完了|解放しました/)

    fireEvent.mouseOut(screen.getByTestId('resource-hover-card'), { relatedTarget: document.body })
    expect(screen.queryByTestId('resource-hover-card')).toBeNull()
    fireEvent.mouseEnter(monitor)
    expect(screen.getByTestId('resource-free-memory-status').textContent).toBe(accepted)
  })

  const comfyWith = (comfy: Record<string, unknown>) => ({ ...idleStatus, comfy }) as unknown as ManagerStatus
  it.each([
    ['unreachable manager', () => { setManager(null, false) }, 'Manager状態を確認できません。'],
    ['executing', () => { setManager(comfyWith({ running: true, status: 'LISTEN', execution_state: 'executing', queue_running: 1, queue_pending: 0 })) }, 'ComfyUIで生成中です。'],
    ['queued', () => { setManager(comfyWith({ running: true, status: 'LISTEN', execution_state: 'idle', queue_running: 0, queue_pending: 2 })) }, 'ComfyUIのキューが空ではありません。'],
    ['not LISTEN', () => { setManager(comfyWith({ running: false, status: 'stopped' })) }, 'ComfyUIが停止中または状態不明です。'],
    ['action_in_progress', () => { setManager({ ...idleStatus, action_in_progress: 'comfy:start' } as unknown as ManagerStatus) }, '別のサービス操作中です。'],
    ['local operation lock', () => { setManager(); tryBeginManagerOperation('comfy:start') }, '別のサービス操作中です。'],
  ])('[REQ-412/AC-5] the header button is disabled with the reason for each non-idle state (%s)', (_name, arrange, reason) => {
    stubGeometry()
    const posts = stubFetch(() => Promise.resolve(jsonResponse(ACCEPTED_BODY)))
    arrange()
    openCard()
    expect(freeButton()).toBeDisabled()
    expect(screen.getByTestId('resource-free-memory-reason').textContent).toBe(reason)
    fireEvent.click(freeButton())
    expect(posts()).toBe(0)
  })

  it.each([
    ['HTTP 504', () => jsonResponse({}, 504), '要求結果未確認'],
    ['409 busy', () => jsonResponse({ status: 'error', action: 'free-memory', request_sent: false, code: 'busy', error: 'busy' }, 409), '解放要求に失敗しました: busy'],
  ])('[REQ-412/AC-6] transport failures show 要求結果未確認 or the failure reason in the panel (%s)', async (_name, response, expected) => {
    stubGeometry()
    const posts = stubFetch(() => Promise.resolve(response()))
    openCard()
    await waitFor(() => expect(freeButton()).toBeEnabled())
    fireEvent.click(freeButton())
    await waitFor(() => expect(screen.getByTestId('resource-free-memory-status').textContent).toContain(expected))
    await waitFor(() => expect(freeButton()).toBeEnabled())
    expect(posts()).toBe(1)
  })

  it('[REQ-412/AC-7] panels keep the header + 6px top and viewport-capped scroll with the new section', () => {
    stubGeometryWithHeader({ vw: 1280, vh: 360, headerBottom: 118 })
    const { unmount } = render(<div data-page-header-root=""><ResourceHoverMonitor /></div>)
    fireEvent.mouseEnter(screen.getByTestId('resource-hover-monitor'))
    const card = screen.getByTestId('resource-hover-card')
    expect(card.style.top).toBe('124px')
    expect(card.style.maxHeight).toBe('228px')
    expect(card.className).toContain('overflow-y-auto')
    expect(card.contains(screen.getByTestId('resource-free-memory'))).toBe(true)
    unmount()
    vi.restoreAllMocks()

    stubGeometryWithHeader({ vw: 375, vh: 360, headerBottom: 118 })
    render(<div data-page-header-root=""><ResourceHoverMonitor /></div>)
    fireEvent.click(screen.getByTestId('mobile-vram-pill'))
    const overlay = screen.getByTestId('mobile-resource-overlay')
    expect(overlay.style.top).toBe('124px')
    expect(overlay.style.maxHeight).toBe('228px')
    expect(overlay.contains(screen.getByTestId('resource-free-memory'))).toBe(true)
  })
})
