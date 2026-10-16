import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { ResourceHoverMonitor } from '../ResourceHoverMonitor'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import type { SystemStats } from '../../../../store/types'

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
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    expect(card.getAttribute('role')).toBe('tooltip')
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
})
