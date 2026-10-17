import { render, screen, fireEvent, act } from '@testing-library/react'
import { StrictMode, useRef, type ReactNode, type RefObject } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { HeaderDropdown } from '../HeaderDropdown'
import type { HeaderMenuAlign } from '../headerMenuPlacement'

const ANCHOR_RECT = { top: 11, bottom: 39, left: 300, right: 330, x: 300, y: 11, width: 30, height: 28, toJSON: () => ({}) }
const PANEL_WIDTH = 240

function Harness({
  open,
  onClose,
  align = 'start',
  role,
  closeOnEsc,
  children,
  anchorRefOut,
}: {
  open: boolean
  onClose: () => void
  align?: HeaderMenuAlign
  role?: 'tooltip' | 'menu'
  closeOnEsc?: boolean
  children?: ReactNode
  anchorRefOut?: (ref: RefObject<HTMLElement | null>) => void
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  anchorRefOut?.(anchorRef)
  return (
    <div>
      <div ref={anchorRef} data-testid="anchor">
        anchor
      </div>
      <HeaderDropdown open={open} onClose={onClose} anchorRef={anchorRef} align={align} role={role} closeOnEsc={closeOnEsc} data-testid="panel" className="w-[240px] animate-fade-in">
        {children ?? <span>content</span>}
      </HeaderDropdown>
    </div>
  )
}

describe('HeaderDropdown', () => {
  let originalRect: typeof HTMLElement.prototype.getBoundingClientRect
  let rectSpy: ReturnType<typeof vi.spyOn>
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight

  beforeEach(() => {
    originalRect = HTMLElement.prototype.getBoundingClientRect
    rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'anchor') return ANCHOR_RECT as DOMRect
        return originalRect.call(this)
      })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => PANEL_WIDTH })
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 667 })
  })

  afterEach(() => {
    rectSpy.mockRestore()
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
    }
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight })
    vi.restoreAllMocks()
  })

  it('[REQ-346/AC-1] renders the panel through a portal under document.body with position fixed below the anchor', () => {
    const { container } = render(<Harness open onClose={() => {}} />)
    const panel = screen.getByTestId('panel')
    expect(container.contains(panel)).toBe(false)
    expect(panel.parentElement).toBe(document.body)
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.top).toBe('45px')
    expect(panel.hasAttribute('data-header-menu-panel')).toBe(true)
    expect(panel.getAttribute('data-placement')).toBe('below-anchor')
    expect(panel.className).toContain('z-[var(--z-header-menu)]')
  })

  it('[REQ-346/AC-2] keeps interactive children clickable inside the panel', () => {
    const onClick = vi.fn()
    const onClose = vi.fn()
    render(
      <Harness open onClose={onClose} role="tooltip">
        <button type="button" onClick={onClick}>
          action
        </button>
      </Harness>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'action' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('panel').getAttribute('role')).toBe('tooltip')
  })

  it('[REQ-346/AC-3] sets maxHeight from the viewport and enables in-panel scrolling', () => {
    window.innerHeight = 667
    const { unmount } = render(<Harness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.maxHeight).toBe('614px')
    unmount()

    window.innerHeight = 360
    render(<Harness open onClose={() => {}} />)
    const panel = screen.getByTestId('panel')
    expect(panel.style.maxHeight).toBe('307px')
    expect(panel.className).toContain('overflow-y-auto')
    expect(panel.className).toContain('overscroll-contain')
    expect(panel.style.touchAction).toBe('pan-y')
  })

  it('[REQ-346/AC-4] closes on outside pointerdown/mousedown but not on anchor or panel interactions', () => {
    const onClose = vi.fn()
    render(
      <Harness open onClose={onClose}>
        <button type="button">inside</button>
      </Harness>,
    )
    fireEvent.pointerDown(screen.getByTestId('panel'))
    fireEvent.mouseDown(screen.getByTestId('panel'))
    fireEvent.pointerDown(screen.getByTestId('anchor'))
    fireEvent.mouseDown(screen.getByTestId('anchor'))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'inside' }))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
    const callsAfterOutside = onClose.mock.calls.length
    fireEvent.pointerDown(document.body)
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(callsAfterOutside)
  })

  it('[REQ-346/AC-4] renders nothing when open is false', () => {
    const { container } = render(<Harness open={false} onClose={() => {}} />)
    expect(screen.queryByTestId('panel')).toBeNull()
    expect(document.body.querySelector('[data-header-menu-panel]')).toBeNull()
    expect(container.querySelector('[data-testid="anchor"]')).not.toBeNull()
  })

  it('[REQ-346/AC-5] clamps left inside the viewport for 375, 768 and 1280 wide viewports', () => {
    for (const vw of [375, 768, 1280]) {
      for (const align of ['start', 'end'] as const) {
        window.innerWidth = vw
        const { unmount } = render(<Harness open onClose={() => {}} align={align} />)
        const left = parseFloat(screen.getByTestId('panel').style.left)
        expect(left).toBeGreaterThanOrEqual(8)
        expect(left).toBeLessThanOrEqual(vw - PANEL_WIDTH - 8)
        unmount()
      }
    }
  })

  it('[REQ-346/AC-6] recomputes maxHeight on window resize while open', () => {
    window.innerHeight = 667
    render(<Harness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.maxHeight).toBe('614px')

    window.innerHeight = 360
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByTestId('panel').style.maxHeight).toBe('307px')
  })

  it('[REQ-346/AC-6] closes when the anchor scrolls off-screen', () => {
    const onClose = vi.fn()
    rectSpy.mockRestore()
    rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'anchor') return { ...ANCHOR_RECT, top: -37, bottom: -10 } as DOMRect
        return originalRect.call(this)
      })
    render(<Harness open onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-346/AC-6] works when visualViewport is undefined', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    try {
      window.innerHeight = 667
      render(<Harness open onClose={() => {}} />)
      expect(screen.getByTestId('panel').style.maxHeight).toBe('614px')
    } finally {
      if (descriptor) Object.defineProperty(window, 'visualViewport', descriptor)
      else delete (window as unknown as Record<string, unknown>).visualViewport
    }
  })

  it('[REQ-346/AC-6] removes all listeners on unmount and under StrictMode double mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const docAddSpy = vi.spyOn(document, 'addEventListener')
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener')
    const onClose = vi.fn()

    const { unmount } = render(
      <StrictMode>
        <Harness open onClose={onClose} />
      </StrictMode>,
    )
    unmount()

    const added = addSpy.mock.calls.map((c) => c[0])
    const removed = removeSpy.mock.calls.map((c) => c[0])
    for (const type of ['resize', 'scroll']) {
      expect(removed.filter((t) => t === type).length).toBeGreaterThanOrEqual(added.filter((t) => t === type).length)
    }
    const docAdded = docAddSpy.mock.calls.map((c) => c[0])
    const docRemoved = docRemoveSpy.mock.calls.map((c) => c[0])
    for (const type of ['pointerdown', 'mousedown']) {
      expect(docRemoved.filter((t) => t === type).length).toBeGreaterThanOrEqual(docAdded.filter((t) => t === type).length)
    }

    // No leaked outside-click handler after unmount.
    fireEvent.mouseDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('[REQ-346/AC-8] accepts tall content (40 items) with the last item present in the panel', () => {
    const items = Array.from({ length: 40 }, (_, i) => <div key={i}>item-{i}</div>)
    render(<Harness open onClose={() => {}}>{items}</Harness>)
    const panel = screen.getByTestId('panel')
    expect(screen.getByText('item-39')).toBeTruthy()
    expect(panel.contains(screen.getByText('item-39'))).toBe(true)
    expect(panel.style.maxHeight).not.toBe('')
  })
})

type Box = { top: number; bottom: number; left: number; right: number }
type Rects = { header: Box; anchor: Box; 'trigger-btn': Box }

function toRect(b: Box): DOMRect {
  return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => ({}) } as DOMRect
}

function HeaderHarness({
  open,
  onClose,
  hoverBridge = false,
  headerless = false,
  onWrapperLeave,
}: {
  open: boolean
  onClose: () => void
  hoverBridge?: boolean
  headerless?: boolean
  onWrapperLeave?: () => void
}) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const body = (
    <div onMouseLeave={onWrapperLeave}>
      <div ref={anchorRef} data-testid="anchor">
        <button type="button" data-testid="trigger-btn">
          t
        </button>
      </div>
      <HeaderDropdown open={open} onClose={onClose} anchorRef={anchorRef} align="end" data-testid="panel" hoverBridge={hoverBridge} className="w-[240px]">
        <span>content</span>
      </HeaderDropdown>
    </div>
  )
  return headerless ? body : <div data-page-header-root="" data-testid="header">{body}</div>
}

describe('HeaderDropdown header-bottom anchoring', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const originalInnerWidth = window.innerWidth
  const originalInnerHeight = window.innerHeight
  let rects: Rects
  let rectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    rects = {
      header: { top: 0, bottom: 118, left: 0, right: 375 },
      anchor: { top: 11, bottom: 39, left: 300, right: 330 },
      'trigger-btn': { top: 11, bottom: 39, left: 300, right: 330 },
    }
    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const key = this.dataset.testid as keyof Rects | undefined
      if (key && key in rects) return toRect(rects[key])
      return originalRect.call(this)
    })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => PANEL_WIDTH })
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 667 })
  })

  afterEach(() => {
    rectSpy.mockRestore()
    vi.unstubAllGlobals()
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
    }
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight })
  })

  it('[REQ-346/AC-1] anchors the top to the header bottom + 6 when inside [data-page-header-root] (header 118, trigger 39 -> 124px)', () => {
    render(<HeaderHarness open onClose={() => {}} />)
    const panel = screen.getByTestId('panel')
    expect(panel.style.top).toBe('124px')
    expect(panel.style.maxHeight).toBe('535px')
  })

  it('[REQ-346/AC-1] falls back to the trigger bottom when there is no header ancestor', () => {
    render(<HeaderHarness open headerless onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.top).toBe('45px')
  })

  it('[REQ-346/AC-1] hit-slop: a trigger child extending below the wrapper moves the top below the child (wrapper bottom 36, button bottom 44, no header -> 50px; header bottom 40 -> 50px; header bottom 118 -> 124px)', () => {
    rects.anchor = { top: 11, bottom: 36, left: 300, right: 330 }
    rects['trigger-btn'] = { top: 30, bottom: 44, left: 300, right: 360 }

    const { unmount } = render(<HeaderHarness open headerless onClose={() => {}} />)
    const panel = screen.getByTestId('panel')
    expect(panel.style.top).toBe('50px')
    // align=end is still based on the wrapper rect (330 - 240 = 90), not the overflowing button.
    expect(panel.style.left).toBe('90px')
    unmount()

    rects.header = { top: 0, bottom: 40, left: 0, right: 375 }
    const second = render(<HeaderHarness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.top).toBe('50px')
    second.unmount()

    rects.header = { top: 0, bottom: 118, left: 0, right: 375 }
    render(<HeaderHarness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.top).toBe('124px')
  })

  it('[REQ-346/AC-3] maxHeight uses the header-based top (innerHeight 360 -> 228px; innerHeight 227 closes via onClose)', () => {
    window.innerHeight = 360
    const { unmount } = render(<HeaderHarness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.maxHeight).toBe('228px')
    unmount()

    const onClose = vi.fn()
    window.innerHeight = 227
    render(<HeaderHarness open onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-346/AC-6] re-reads the header bottom on scroll and keeps following it', () => {
    const onClose = vi.fn()
    render(<HeaderHarness open onClose={onClose} />)
    expect(screen.getByTestId('panel').style.top).toBe('124px')

    rects.header = { top: 0, bottom: 100, left: 0, right: 375 }
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByTestId('panel').style.top).toBe('106px')
    expect(onClose).not.toHaveBeenCalled()

    rects.anchor = { top: -37, bottom: -10, left: 300, right: 330 }
    rects['trigger-btn'] = { top: -37, bottom: -10, left: 300, right: 330 }
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-346/AC-6] observes the header with ResizeObserver, re-measures from its callback and disconnects on close/unmount', () => {
    const created: Array<{ cb: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
    class FakeResizeObserver {
      cb: () => void
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: () => void) {
        this.cb = cb
        created.push(this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const { rerender, unmount } = render(<HeaderHarness open onClose={() => {}} />)
    expect(created).toHaveLength(1)
    expect(created[0].observe).toHaveBeenCalledWith(screen.getByTestId('header'))

    rects.header = { top: 0, bottom: 150, left: 0, right: 375 }
    act(() => {
      created[0].cb()
    })
    expect(screen.getByTestId('panel').style.top).toBe('156px')

    rerender(<HeaderHarness open={false} onClose={() => {}} />)
    expect(created[0].disconnect).toHaveBeenCalled()

    rerender(<HeaderHarness open onClose={() => {}} />)
    unmount()
    expect(created[1].disconnect).toHaveBeenCalled()
  })

  it('[REQ-346/AC-6] works without ResizeObserver and does not observe when headerless', () => {
    vi.unstubAllGlobals()
    expect(typeof ResizeObserver).toBe('undefined')
    const { rerender } = render(<HeaderHarness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.top).toBe('124px')
    rerender(<HeaderHarness open={false} onClose={() => {}} />)
    rerender(<HeaderHarness open onClose={() => {}} />)
    expect(screen.getByTestId('panel').style.top).toBe('124px')

    const created: unknown[] = []
    class FakeResizeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor() {
        created.push(this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    render(<HeaderHarness open headerless onClose={() => {}} />)
    expect(created).toHaveLength(0)
  })

  it('[REQ-346/AC-2] hoverBridge renders a fixed, aria-hidden, transparent bridge from the trigger bottom to the panel top (+1px)', () => {
    render(<HeaderHarness open hoverBridge onClose={() => {}} />)
    const bridge = screen.getByTestId('panel-bridge')
    const panel = screen.getByTestId('panel')
    expect(bridge.parentElement).toBe(document.body)
    expect(bridge.style.position).toBe('fixed')
    expect(bridge.style.left).toBe('300px')
    expect(bridge.style.top).toBe('39px')
    expect(bridge.style.width).toBe('30px')
    expect(bridge.style.height).toBe('86px')
    expect(bridge.getAttribute('aria-hidden')).toBe('true')
    expect(bridge.hasAttribute('data-header-menu-bridge')).toBe(true)
    expect(bridge.className).toContain('z-[var(--z-header-menu)]')
    expect(bridge.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('[REQ-346/AC-2] headerless hoverBridge is 7px high; no bridge without hoverBridge or when the card is not rendered', () => {
    const { unmount } = render(<HeaderHarness open headerless hoverBridge onClose={() => {}} />)
    expect(screen.getByTestId('panel-bridge').style.height).toBe('7px')
    unmount()

    const plain = render(<HeaderHarness open onClose={() => {}} />)
    expect(screen.queryByTestId('panel-bridge')).toBeNull()
    plain.unmount()

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 })
    render(<HeaderHarness open hoverBridge onClose={() => {}} />)
    expect(screen.queryByTestId('panel-bridge')).toBeNull()
  })

  it('[REQ-346/AC-2] hover continuity through the portal: moving between the anchor, bridge and panel does not fire the ancestor onMouseLeave; leaving to body does', () => {
    const onWrapperLeave = vi.fn()
    render(<HeaderHarness open hoverBridge onClose={() => {}} onWrapperLeave={onWrapperLeave} />)
    const anchor = screen.getByTestId('anchor')
    const bridge = screen.getByTestId('panel-bridge')
    const panel = screen.getByTestId('panel')

    fireEvent.mouseOut(anchor, { relatedTarget: bridge })
    fireEvent.mouseOut(bridge, { relatedTarget: panel })
    expect(onWrapperLeave).toHaveBeenCalledTimes(0)

    fireEvent.mouseOut(panel, { relatedTarget: document.body })
    expect(onWrapperLeave).toHaveBeenCalledTimes(1)
  })

  it('[REQ-346/AC-4] pointerdown on the bridge does not close; pointerdown outside closes', () => {
    const onClose = vi.fn()
    render(<HeaderHarness open hoverBridge onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('panel-bridge'))
    fireEvent.mouseDown(screen.getByTestId('panel-bridge'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-346/AC-6] removes the ResizeObserver and listeners symmetrically under StrictMode double mount', () => {
    const created: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []
    class FakeResizeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor() {
        created.push(this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const { unmount } = render(
      <StrictMode>
        <HeaderHarness open onClose={() => {}} />
      </StrictMode>,
    )
    unmount()

    const observed = created.reduce((n, ro) => n + ro.observe.mock.calls.length, 0)
    const disconnected = created.reduce((n, ro) => n + ro.disconnect.mock.calls.length, 0)
    expect(observed).toBeGreaterThan(0)
    expect(disconnected).toBeGreaterThanOrEqual(observed)
  })

  it('[REQ-364/AC-3] closes the dropdown when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[REQ-364/AC-3] does not close on Escape if closeOnEsc is false', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} closeOnEsc={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
