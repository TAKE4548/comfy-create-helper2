import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingInfoPopover } from '../SettingInfoPopover'

function setMobile(matches: boolean) {
  let currentMatches = matches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    get matches() { return currentMatches },
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery))
  return {
    set(next: boolean) {
      currentMatches = next
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent))
    },
  }
}

describe('SettingInfoPopover', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('[REQ-381/AC-5] desktop keeps the existing description inline without an info trigger', () => {
    setMobile(false)
    render(<SettingInfoPopover label="Temperature">説明全文</SettingInfoPopover>)

    expect(screen.getByText('説明全文')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /説明/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[REQ-381/AC-5] mobile opens one accessible nonmodal portal and toggles it closed', () => {
    setMobile(true)
    render(
      <>
        <SettingInfoPopover label="Temperature"><span>説明全文</span></SettingInfoPopover>
        <SettingInfoPopover label="Steps">手順</SettingInfoPopover>
      </>,
    )

    const firstTrigger = screen.getByRole('button', { name: '説明: Temperature' })
    const secondTrigger = screen.getByRole('button', { name: '説明: Steps' })
    expect(firstTrigger).toHaveClass('min-h-[44px]', 'min-w-[44px]')
    fireEvent.click(firstTrigger)

    const firstDialog = screen.getByRole('dialog', { name: 'Temperature' })
    expect(firstDialog.parentElement).toBe(document.body)
    expect(firstDialog).not.toHaveAttribute('aria-modal')
    expect(firstDialog).toHaveClass('fixed', 'overflow-y-auto', 'overscroll-contain')
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(firstTrigger).toHaveAttribute('aria-controls', firstDialog.id)

    fireEvent.click(secondTrigger)
    expect(screen.queryByRole('dialog', { name: 'Temperature' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Steps' })).toBeInTheDocument()

    fireEvent.click(secondTrigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(secondTrigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('[REQ-381/AC-6] Escape restores focus, outside click and viewport resize close, internal scroll stays open', async () => {
    setMobile(true)
    render(
      <div role="tabpanel">
        <SettingInfoPopover label="Prompt">説明全文を内部scrollで読めます</SettingInfoPopover>
        <button type="button">外側</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: '説明: Prompt' })

    fireEvent.click(trigger)
    let dialog = screen.getByRole('dialog', { name: 'Prompt' })
    fireEvent.scroll(dialog)
    expect(screen.getByRole('dialog', { name: 'Prompt' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Prompt' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: '外側' }))
    expect(screen.queryByRole('dialog', { name: 'Prompt' })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Prompt' })).not.toBeInTheDocument())
  })

  it('[REQ-381/AC-6] closes when its Settings tabpanel becomes hidden and when an ancestor scrolls', async () => {
    setMobile(true)
    const { rerender } = render(
      <div role="tabpanel">
        <SettingInfoPopover label="Model">説明全文</SettingInfoPopover>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: '説明: Model' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Model' })).toBeInTheDocument()
    fireEvent.scroll(trigger.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog', { name: 'Model' })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    rerender(
      <div role="tabpanel" hidden>
        <SettingInfoPopover label="Model">説明全文</SettingInfoPopover>
      </div>,
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Model' })).not.toBeInTheDocument())
  })

  it('[REQ-381/AC-6] clamps to the visible viewport and releases portal/listeners on visualViewport change and unmount', () => {
    setMobile(true)
    vi.stubGlobal('innerWidth', 375)
    vi.stubGlobal('innerHeight', 600)
    const visualViewport = new EventTarget() as VisualViewport
    Object.defineProperties(visualViewport, {
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 },
      width: { value: 375 },
      height: { value: 600 },
    })
    vi.stubGlobal('visualViewport', visualViewport)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 350, y: 570, left: 350, right: 374, top: 570, bottom: 594, width: 24, height: 24,
      toJSON: () => ({}),
    } as DOMRect)
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<SettingInfoPopover label="Boundary">説明</SettingInfoPopover>)
    fireEvent.click(screen.getByRole('button', { name: '説明: Boundary' }))

    const dialog = screen.getByRole('dialog', { name: 'Boundary' })
    const left = Number.parseFloat(dialog.style.left)
    const top = Number.parseFloat(dialog.style.top)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left).toBeLessThanOrEqual(375 - 320 - 8)
    expect(top).toBeGreaterThanOrEqual(8)
    expect(top).toBeLessThanOrEqual(600 - 320 - 8)
    expect(dialog.style.maxWidth).toBe('320px')
    expect(dialog.style.maxHeight).toBe('320px')
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)

    act(() => visualViewport.dispatchEvent(new Event('resize')))
    expect(screen.queryByRole('dialog', { name: 'Boundary' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '説明: Boundary' }))
    expect(screen.getByRole('dialog', { name: 'Boundary' })).toBeInTheDocument()
    unmount()
    expect(screen.queryByRole('dialog', { name: 'Boundary' })).not.toBeInTheDocument()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(rectSpy).toHaveBeenCalled()
  })
})
