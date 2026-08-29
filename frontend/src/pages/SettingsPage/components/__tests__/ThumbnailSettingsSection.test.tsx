import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThumbnailSettingsSection } from '../ThumbnailSettingsSection'
import { LS_KEYS } from '../../../../utils/localStorageKeys'

describe('ThumbnailSettingsSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders section and preset buttons with 3:4 active by default', () => {
    render(<ThumbnailSettingsSection />)
    expect(screen.getByTestId('thumbnail-settings-section')).toBeInTheDocument()
    expect(screen.getByTestId('preset-btn-3:4')).toBeInTheDocument()
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '3 / 4' })
  })

  it('switches preset when a button is clicked', () => {
    render(<ThumbnailSettingsSection />)
    const btn11 = screen.getByTestId('preset-btn-1:1')
    fireEvent.click(btn11)

    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO)).toBe('1:1')
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '1 / 1' })
  })

  it('shows custom ratio input when custom preset is selected and updates ratio', () => {
    render(<ThumbnailSettingsSection />)
    const btnCustom = screen.getByTestId('preset-btn-custom')
    fireEvent.click(btnCustom)

    const input = screen.getByTestId('custom-aspect-ratio-input')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '16:9' } })
    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM)).toBe('16:9')
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '16 / 9' })
  })
})