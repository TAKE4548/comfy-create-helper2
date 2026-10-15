import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThumbnailSettingsSection } from '../ThumbnailSettingsSection'
import { LS_KEYS } from '../../../../utils/localStorageKeys'

describe('ThumbnailSettingsSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[REQ-365/AC-2] renders a single select with all presets and reflects the persisted selection', () => {
    render(<ThumbnailSettingsSection />)
    expect(screen.getByTestId('thumbnail-settings-section')).toBeInTheDocument()
    const select = screen.getByTestId('thumbnail-aspect-select') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('3:4')
    expect(select.options.length).toBeGreaterThan(1)
    expect(screen.queryByTestId('preset-btn-3:4')).not.toBeInTheDocument()
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '3 / 4' })
  })

  it('[REQ-365/AC-2] select has min-h-11 and touch-manipulation', () => {
    render(<ThumbnailSettingsSection />)
    const select = screen.getByTestId('thumbnail-aspect-select')
    expect(select).toHaveClass('min-h-11')
    expect(select).toHaveClass('touch-manipulation')
    expect(screen.getByLabelText('アスペクト比の選択')).toBe(select)
  })

  it('[REQ-365/AC-2] custom input appears only for custom', () => {
    render(<ThumbnailSettingsSection />)
    expect(screen.queryByTestId('custom-aspect-ratio-input')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('thumbnail-aspect-select'), { target: { value: 'custom' } })
    expect(screen.getByTestId('custom-aspect-ratio-input')).toBeInTheDocument()
  })

  it('[REQ-365/AC-2] switches preset when the select changes', () => {
    render(<ThumbnailSettingsSection />)
    fireEvent.change(screen.getByTestId('thumbnail-aspect-select'), { target: { value: '1:1' } })

    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO)).toBe('1:1')
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '1 / 1' })
    expect(screen.getByRole('status')).toHaveTextContent('設定を保存しました')
  })

  it('shows custom ratio input when custom preset is selected and updates ratio', () => {
    render(<ThumbnailSettingsSection />)
    fireEvent.change(screen.getByTestId('thumbnail-aspect-select'), { target: { value: 'custom' } })

    const input = screen.getByTestId('custom-aspect-ratio-input')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '16:9' } })
    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO_CUSTOM)).toBe('16:9')
    expect(screen.getByTestId('aspect-ratio-preview-box')).toHaveStyle({ aspectRatio: '16 / 9' })
  })

  it('[REQ-365/AC-2] shows persistence error without crashing when localStorage throws; keeps the session choice and reports that it is unsaved', () => {
    localStorage.setItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO, '3:4')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    render(<><ThumbnailSettingsSection /><ThumbnailSettingsSection /></>)

    fireEvent.change(screen.getAllByTestId('thumbnail-aspect-select')[0], { target: { value: '1:1' } })

    expect(localStorage.getItem(LS_KEYS.THUMBNAIL_ASPECT_RATIO)).toBe('3:4')
    expect(screen.getAllByTestId('aspect-ratio-preview-box')).toHaveLength(2)
    expect(screen.getAllByTestId('aspect-ratio-preview-box')[0]).toHaveStyle({ aspectRatio: '1 / 1' })
    expect(screen.getAllByTestId('aspect-ratio-preview-box')[1]).toHaveStyle({ aspectRatio: '1 / 1' })
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Quota exceeded')
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('設定は未保存です')
    expect(screen.queryByText('設定を保存しました')).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
