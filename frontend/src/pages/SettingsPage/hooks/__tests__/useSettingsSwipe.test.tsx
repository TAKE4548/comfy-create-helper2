import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { resolveSettingsSwipeTarget, useSettingsSwipe } from '../useSettingsSwipe'
import { useSettingsMobile } from '../useSettingsMobile'
import type { SettingsTabId } from '../useSettingsTab'

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')

function firePointer(
  target: Element,
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove',
  init: Partial<PointerEvent>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  fireEvent(target, event)
}

function decision(overrides: Partial<Parameters<typeof resolveSettingsSwipeTarget>[0]> = {}) {
  return {
    activeTab: 'dialogue' as SettingsTabId,
    dx: -60,
    dy: 10,
    pointerType: 'touch' as const,
    isPrimary: true,
    verticalFirst: false,
    interactiveTarget: false,
    horizontalScroll: false,
    overlayOpen: false,
    ...overrides,
  }
}

function SwipeHarness({ onSelect }: { onSelect: (tab: SettingsTabId) => void }) {
  const handlers = useSettingsSwipe({ enabled: true, activeTab: 'dialogue', onSelect })
  return (
    <div data-testid="swipe-surface" {...handlers}>
      <button type="button">interactive control</button>
      <span>content</span>
    </div>
  )
}

afterEach(() => {
  if (originalMatchMediaDescriptor) Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor)
  else Reflect.deleteProperty(window, 'matchMedia')
})

describe('Settings swipe and mobile breakpoint', () => {
  it('[REQ-381/AC-9] resolves only a neighboring tab for a qualifying horizontal swipe and does not wrap at either end', () => {
    expect(resolveSettingsSwipeTarget(decision())).toBe('translation')
    expect(resolveSettingsSwipeTarget(decision({ dx: 60, dy: 10 }))).toBe('prompt')
    expect(resolveSettingsSwipeTarget(decision({ activeTab: 'workflows', dx: 60 }))).toBeNull()
    expect(resolveSettingsSwipeTarget(decision({ activeTab: 'system', dx: -60 }))).toBeNull()
    expect(resolveSettingsSwipeTarget(decision({ dx: -47, dy: 0 }))).toBeNull()
    expect(resolveSettingsSwipeTarget(decision({ dx: -48, dy: 32 }))).toBeNull()
    expect(resolveSettingsSwipeTarget(decision({ dx: -49, dy: 32 }))).toBe('translation')
  })

  it('[REQ-381/AC-9] rejects pointer, vertical-first, interactive, horizontal-scroll, and open-overlay states', () => {
    for (const overrides of [
      { pointerType: 'mouse' as const },
      { isPrimary: false },
      { verticalFirst: true },
      { interactiveTarget: true },
      { horizontalScroll: true },
      { overlayOpen: true },
    ]) {
      expect(resolveSettingsSwipeTarget(decision(overrides))).toBeNull()
    }
  })

  it('[REQ-381/AC-9] PBT: protected inputs and non-qualifying geometry never select a tab', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.boolean(),
        fc.boolean(),
        (dx, dy, interactiveTarget, overlayOpen) => {
          const result = resolveSettingsSwipeTarget(decision({ dx, dy, interactiveTarget, overlayOpen }))
          if (interactiveTarget || overlayOpen || Math.abs(dx) < 48 || Math.abs(dx) <= 1.5 * Math.abs(dy)) {
            expect(result).toBeNull()
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('[REQ-381/AC-9] changes once on a primary touch swipe and ignores pointercancel, a second pointer, buttons, and overlays', () => {
    const onSelect = vi.fn()
    const { unmount } = render(<SwipeHarness onSelect={onSelect} />)
    const surface = screen.getByTestId('swipe-surface')
    const pointer = { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 120, clientY: 100 }

    firePointer(surface, 'pointerdown', pointer)
    firePointer(surface, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenLastCalledWith('translation')

    firePointer(surface, 'pointerdown', pointer)
    firePointer(surface, 'pointermove', { ...pointer, clientX: 115, clientY: 115 })
    firePointer(surface, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(1)

    firePointer(surface, 'pointerdown', { ...pointer, pointerType: 'pen' })
    firePointer(surface, 'pointerup', { ...pointer, pointerType: 'pen', clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(2)

    firePointer(surface, 'pointerdown', pointer)
    firePointer(surface, 'pointercancel', pointer)
    firePointer(surface, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(2)

    firePointer(surface, 'pointerdown', pointer)
    firePointer(surface, 'pointerdown', { ...pointer, pointerId: 2, isPrimary: false })
    firePointer(surface, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(2)

    const button = screen.getByRole('button', { name: 'interactive control' })
    firePointer(button, 'pointerdown', pointer)
    firePointer(button, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(2)

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    document.body.appendChild(overlay)
    firePointer(surface, 'pointerdown', pointer)
    firePointer(surface, 'pointerup', { ...pointer, clientX: 55, clientY: 108 })
    expect(onSelect).toHaveBeenCalledTimes(2)
    overlay.remove()
    unmount()
  })

  it('[REQ-381/AC-2] uses the 767px media query, responds to changes, and removes its listener', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined
    const removeEventListener = vi.fn()
    const media = {
      matches: true,
      media: '(max-width: 767px)',
      addEventListener: vi.fn((_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback }),
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as MediaQueryList
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => media) })
    function MobileHarness() {
      return <output data-testid="mobile">{String(useSettingsMobile())}</output>
    }

    const { unmount } = render(<MobileHarness />)
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
    expect(screen.getByTestId('mobile')).toHaveTextContent('true')
    act(() => listener?.({ matches: false } as MediaQueryListEvent))
    expect(screen.getByTestId('mobile')).toHaveTextContent('false')
    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', listener)
  })
})
