import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpeechBubbleControls, SpeechBubbleControlsProps } from '../SpeechBubbleControls'
import { SpeechBubble } from '../../types/speechBubble'

describe('SpeechBubbleControls', () => {
  const mockBubble: SpeechBubble = {
    id: 'b-1',
    x: 100,
    y: 100,
    w: 150,
    h: 120,
    text: 'こんにちは',
    shape: 'oval',
    orientation: 'vertical',
    fontFamily: 'sans-serif',
    fontSize: 0,
    textColor: 'rgba(0, 0, 0, 1)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(0, 0, 0, 1)',
    borderWidth: 2,
    tail: { x: 80, y: 240 }
  }

  const defaultProps: SpeechBubbleControlsProps = {
    bubble: mockBubble,
    bubblesCount: 1,
    fontList: [
      { name: 'Noto Sans JP', file_name: 'NotoSansJP.ttf' }
    ],
    isFontLoading: false,
    isDrafting: false,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onGenerateDraft: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders guidance message when bubble is null', () => {
    render(<SpeechBubbleControls {...defaultProps} bubble={null} />)
    expect(screen.getByText(/吹き出しが選択されていません/i)).toBeDefined()
  })

  it('renders form controls when bubble is selected', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    expect(screen.getByDisplayValue('こんにちは')).toBeDefined()
    expect(screen.getByText('楕円')).toBeDefined()
    expect(screen.getByText('縦書き')).toBeDefined()
    expect(screen.getByText('横書き')).toBeDefined()
  })

  it('calls onUpdate when text is modified', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('セリフを入力...')
    fireEvent.change(textarea, { target: { value: '新しいセリフ' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ text: '新しいセリフ' })
  })

  it('calls onUpdate when shape is changed', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const burstBtn = screen.getByText('叫び')
    fireEvent.click(burstBtn)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ shape: 'burst' })
  })

  it('calls onUpdate when orientation is changed', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const horizBtn = screen.getByText('横書き')
    fireEvent.click(horizBtn)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ orientation: 'horizontal' })
  })

  it('calls onGenerateDraft when draft button is clicked', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const draftBtn = screen.getByText(/ドラフト生成/)
    fireEvent.click(draftBtn)
    expect(defaultProps.onGenerateDraft).toHaveBeenCalled()
  })

  it('calls onDelete when delete button is clicked', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const deleteBtn = screen.getByText(/この吹き出しを削除/)
    fireEvent.click(deleteBtn)
    expect(defaultProps.onDelete).toHaveBeenCalled()
  })

  it('handles font selection', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const select = screen.getByDisplayValue('標準ゴシック (sans-serif)')
    fireEvent.change(select, { target: { value: 'NotoSansJP.ttf' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontFamily: 'NotoSansJP.ttf' })
  })

  it('handles font size auto-fit toggle and manual slider', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const autoFitCheckbox = screen.getByRole('checkbox')
    expect((autoFitCheckbox as HTMLInputElement).checked).toBe(true)

    // Uncheck auto-fit
    fireEvent.click(autoFitCheckbox)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontSize: 18 })
  })

  it('handles recent colors storage and applying', () => {
    localStorage.setItem('speech_bubble_recent_colors', JSON.stringify(['rgba(255, 0, 0, 1)']))
    render(<SpeechBubbleControls {...defaultProps} />)

    const recentPalette = screen.getByTestId('recent-colors-palette')
    expect(recentPalette).toBeDefined()

    const colorChip = recentPalette.querySelector('button')
    if (colorChip) {
      fireEvent.click(colorChip)
      expect(defaultProps.onUpdate).toHaveBeenCalledWith({ backgroundColor: 'rgba(255, 0, 0, 1)' })
    }
  })

  it('saves new color to recent colors when color input is changed', () => {
    render(<SpeechBubbleControls {...defaultProps} />)
    const textColorInput = screen.getByLabelText('文字色')
    fireEvent.change(textColorInput, { target: { value: '#ff0000' } })

    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ textColor: 'rgba(255, 0, 0, 1)' })
    const stored = JSON.parse(localStorage.getItem('speech_bubble_recent_colors') || '[]')
    expect(stored).toContain('rgba(255, 0, 0, 1)')
  })
})
