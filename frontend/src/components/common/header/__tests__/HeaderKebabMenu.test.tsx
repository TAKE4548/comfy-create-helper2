import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HeaderKebabMenu } from '../HeaderKebabMenu'
import * as browserStorage from '../../../../utils/browserStorageUsage'

describe('HeaderKebabMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('[REQ-365/AC-2] keeps a 28x28px visual box with a 44px (w-11 h-11) touch target below md', () => {
    render(<HeaderKebabMenu />)
    const button = screen.getByTestId('header-kebab-menu-button')
    expect(button.className).toContain('w-11')
    expect(button.className).toContain('h-11')
    expect(button.className).toContain('md:w-[28px]')
    expect(button.className).toContain('md:h-[28px]')
    const visual = screen.getByTestId('header-kebab-menu-visual')
    expect(visual.className).toContain('w-[28px]')
    expect(visual.className).toContain('h-[28px]')
  })

  it('opens a 270px dropdown upon clicking the kebab button', () => {
    render(<HeaderKebabMenu />)
    expect(screen.queryByTestId('header-kebab-dropdown')).toBeNull()

    const button = screen.getByTestId('header-kebab-menu-button')
    fireEvent.click(button)

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown).toBeTruthy()
    expect(dropdown.className).toContain('w-[270px]')
  })

  it('displays LocalStorage and SessionStorage usage with (推定値 / Estimate Only) (AC-5)', () => {
    vi.spyOn(browserStorage, 'measureBrowserStorageUsage').mockReturnValue({
      localStorage: { status: 'ok', bytes: 1048576 }, // 1.0 MiB
      sessionStorage: { status: 'ok', bytes: 2048 }, // 2.0 KiB
    })

    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown.textContent).toContain('推定値 / Estimate Only')
    expect(dropdown.textContent).toContain('LocalStorage:')
    expect(dropdown.textContent).toContain('1.0 MiB')
    expect(dropdown.textContent).toContain('SessionStorage:')
    expect(dropdown.textContent).toContain('2.0 KiB')
  })

  it('gracefully displays 取得不可 on storage SecurityError or unavailability (RT-2)', () => {
    vi.spyOn(browserStorage, 'measureBrowserStorageUsage').mockReturnValue({
      localStorage: { status: 'unavailable' },
      sessionStorage: { status: 'unavailable' },
    })

    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown.textContent).toContain('取得不可')
  })

  it('executes cache resync when cache button is clicked', () => {
    const onResyncCache = vi.fn()
    render(<HeaderKebabMenu onResyncCache={onResyncCache} />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const resyncBtn = screen.getByTestId('resync-cache-button')
    fireEvent.click(resyncBtn)

    expect(onResyncCache).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('header-kebab-dropdown')).toBeNull()
  })

  it('provides a link to /settings', () => {
    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const settingsLink = screen.getByTestId('header-settings-link')
    expect(settingsLink.getAttribute('href')).toBe('/settings')
    expect(settingsLink.textContent).toContain('設定')
  })

  it('does NOT contain any ComfyUI direct URL inputs or text (AC-5)', () => {
    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown.textContent).not.toContain('ComfyUI 本体 URL')
    expect(dropdown.textContent).not.toContain('http://127.0.0.1:8188')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('closes dropdown when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <HeaderKebabMenu />
      </div>
    )
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))
    expect(screen.getByTestId('header-kebab-dropdown')).toBeTruthy()

    fireEvent.pointerDown(screen.getByTestId('outside-area'))
    expect(screen.queryByTestId('header-kebab-dropdown')).toBeNull()
  })

  it('[REQ-346/AC-1] renders the dropdown in a body-level fixed layer below the trigger (portal)', () => {
    const { container } = render(<HeaderKebabMenu />)
    const trigger = screen.getByTestId('header-kebab-menu-button')
    const wrapper = trigger.parentElement as HTMLElement
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      top: 10, bottom: 38, left: 1000, right: 1028, width: 28, height: 28, x: 1000, y: 10, toJSON: () => ({}),
    } as DOMRect)

    fireEvent.click(trigger)

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(container.contains(dropdown)).toBe(false)
    expect(document.body.contains(dropdown)).toBe(true)
    expect(dropdown.style.position).toBe('fixed')
    expect(parseFloat(dropdown.style.top)).toBeGreaterThanOrEqual(38 + 6)
  })

  it('[REQ-346/AC-3] limits the dropdown height to the viewport (maxHeight) so the last item stays reachable by in-menu scroll', () => {
    Object.defineProperty(window, 'innerHeight', { value: 360, configurable: true, writable: true })
    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))

    const dropdown = screen.getByTestId('header-kebab-dropdown')
    expect(dropdown.style.maxHeight).not.toBe('')
    expect(parseFloat(dropdown.style.maxHeight)).toBeLessThanOrEqual(360)
    expect(dropdown.className).toContain('overflow-y-auto')
    expect(dropdown.contains(screen.getByTestId('header-settings-link'))).toBe(true)
  })

  it('[REQ-346/AC-4] toggles closed when the trigger is pressed again', () => {
    render(<HeaderKebabMenu />)
    const trigger = screen.getByTestId('header-kebab-menu-button')
    fireEvent.click(trigger)
    expect(screen.getByTestId('header-kebab-dropdown')).toBeTruthy()
    fireEvent.click(trigger)
    expect(screen.queryByTestId('header-kebab-dropdown')).toBeNull()
  })

  it('[REQ-346/AC-5] keeps the 270px panel inside 375px and 1280px wide viewports (align end)', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(270)
    for (const width of [375, 1280]) {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
      const { unmount } = render(<HeaderKebabMenu />)
      const trigger = screen.getByTestId('header-kebab-menu-button')
      const wrapper = trigger.parentElement as HTMLElement
      const right = width - 8
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
        top: 10, bottom: 38, left: right - 28, right, width: 28, height: 28, x: right - 28, y: 10, toJSON: () => ({}),
      } as DOMRect)

      fireEvent.click(trigger)

      const dropdown = screen.getByTestId('header-kebab-dropdown')
      const left = parseFloat(dropdown.style.left)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + 270).toBeLessThanOrEqual(width)
      unmount()
    }
  })

  it('[REQ-346/AC-6] recomputes the maxHeight on window resize while open', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
    render(<HeaderKebabMenu />)
    fireEvent.click(screen.getByTestId('header-kebab-menu-button'))
    const dropdown = screen.getByTestId('header-kebab-dropdown')
    const before = parseFloat(dropdown.style.maxHeight)

    Object.defineProperty(window, 'innerHeight', { value: 360, configurable: true, writable: true })
    fireEvent(window, new Event('resize'))

    const after = parseFloat(dropdown.style.maxHeight)
    expect(after).toBeLessThan(before)
    expect(after).toBeLessThanOrEqual(360)
  })
})