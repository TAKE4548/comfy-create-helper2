import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { HeaderKebabMenu } from '../HeaderKebabMenu'
import * as browserStorage from '../../../../utils/browserStorageUsage'

describe('HeaderKebabMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a 28x28px kebab menu button', () => {
    render(<HeaderKebabMenu />)
    const button = screen.getByTestId('header-kebab-menu-button')
    expect(button).toBeTruthy()
    expect(button.className).toContain('w-[28px]')
    expect(button.className).toContain('h-[28px]')
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
})