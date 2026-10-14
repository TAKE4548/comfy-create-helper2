import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SpeechBubbleControls, SpeechBubbleControlsProps } from '../SpeechBubbleControls'
import { SpeechBubble } from '../../types/speechBubble'
import { speechBubblePresetsApi, speechTonePresetsApi } from '../../api/client'
import type { SpeechBubblePreset, SpeechTonePreset } from '../../api/types'

vi.mock('../../api/client', () => ({
  speechBubblePresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  speechTonePresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    rewrite: vi.fn(),
  },
}))


describe('SpeechBubbleControls', () => {
  let queryClient: QueryClient

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

  const mockPresets: SpeechBubblePreset[] = [
    {
      id: 1,
      name: 'コミック標準',
      shape: 'oval',
      orientation: 'vertical',
      font_family: 'NotoSansJP.ttf',
      font_size: 20,
      text_color: 'rgba(0, 0, 0, 1)',
      background_color: 'rgba(255, 255, 255, 1)',
      border_color: 'rgba(0, 0, 0, 1)',
      border_width: 3,
      sort_order: 0,
      created_at: '2026-08-20T00:00:00Z',
    },
    {
      id: 2,
      name: '叫び・赤枠',
      shape: 'burst',
      orientation: 'horizontal',
      font_family: 'sans-serif',
      font_size: 24,
      text_color: 'rgba(255, 0, 0, 1)',
      background_color: 'rgba(255, 255, 200, 0.9)',
      border_color: 'rgba(255, 0, 0, 1)',
      border_width: 4,
      sort_order: 1,
      created_at: '2026-08-20T00:00:00Z',
    },
  ]

  const mockTonePresets: SpeechTonePreset[] = [
    {
      id: 10,
      name: 'ツンデレ風',
      prompt: 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
      description: 'ツンデレ',
      sort_order: 0,
      created_at: '2026-08-20T00:00:00Z',
    },
    {
      id: 11,
      name: 'お嬢様風',
      prompt: '上品なお嬢様言葉で「〜ですわ」をつけて。',
      description: 'お嬢様',
      sort_order: 1,
      created_at: '2026-08-20T00:00:00Z',
    },
  ]

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
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(mockPresets)
    vi.mocked(speechTonePresetsApi.list).mockResolvedValue(mockTonePresets)
  })


  const renderWithQuery = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {ui}
      </QueryClientProvider>
    )
  }

  it('renders guidance message when bubble is null', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={null} />)
    expect(screen.getByText(/吹き出しが選択されていません/i)).toBeDefined()
  })

  it('renders form controls when bubble is selected', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('こんにちは')).toBeDefined()
    })
    expect(screen.getByText('楕円')).toBeDefined()
    const quickAdjust = screen.getByTestId('quick-adjust-section')
    expect(within(quickAdjust).getByText('縦書き')).toBeDefined()
    expect(within(quickAdjust).getByText('横書き')).toBeDefined()
  })

  it('calls onUpdate when text is modified', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('セリフを入力...')).toBeDefined()
    })
    const textarea = screen.getByPlaceholderText('セリフを入力...')
    fireEvent.change(textarea, { target: { value: '新しいセリフ' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ text: '新しいセリフ' })
  })

  it('calls onUpdate when shape is changed', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('叫び')).toBeDefined()
    })
    const burstBtn = screen.getByText('叫び')
    fireEvent.click(burstBtn)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ shape: 'burst' })
  })

  it('calls onUpdate when orientation is changed', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      const quickAdjust = screen.getByTestId('quick-adjust-section')
      expect(within(quickAdjust).getByText('横書き')).toBeDefined()
    })
    const quickAdjust = screen.getByTestId('quick-adjust-section')
    const horizBtn = within(quickAdjust).getByText('横書き')
    fireEvent.click(horizBtn)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ orientation: 'horizontal' })
  })

  it('calls onGenerateDraft when draft button is clicked', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/ドラフト生成/)).toBeDefined()
    })
    const draftBtn = screen.getByText(/ドラフト生成/)
    fireEvent.click(draftBtn)
    expect(defaultProps.onGenerateDraft).toHaveBeenCalled()
  })

  it('calls onDelete when delete button is clicked', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/この吹き出しを削除/)).toBeDefined()
    })
    const deleteBtn = screen.getByText(/この吹き出しを削除/)
    fireEvent.click(deleteBtn)
    expect(defaultProps.onDelete).toHaveBeenCalled()
  })

  it('handles font selection', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('標準ゴシック (sans-serif)')).toBeDefined()
    })
    const select = screen.getByDisplayValue('標準ゴシック (sans-serif)')
    fireEvent.change(select, { target: { value: 'NotoSansJP.ttf' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontFamily: 'NotoSansJP.ttf' })
  })

  it('handles font size auto-fit toggle and manual slider', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeDefined()
    })
    const autoFitCheckbox = screen.getByRole('checkbox')
    expect((autoFitCheckbox as HTMLInputElement).checked).toBe(true)

    // Uncheck auto-fit
    fireEvent.click(autoFitCheckbox)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontSize: 18 })
  })

  it('handles recent colors storage and applying', async () => {
    localStorage.setItem('speech_bubble_recent_colors', JSON.stringify(['rgba(255, 0, 0, 1)']))
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTestId('recent-colors-palette')).toBeDefined()
    })

    const recentPalette = screen.getByTestId('recent-colors-palette')
    const colorChip = recentPalette.querySelector('button')
    if (colorChip) {
      fireEvent.click(colorChip)
      expect(defaultProps.onUpdate).toHaveBeenCalledWith({ backgroundColor: 'rgba(255, 0, 0, 1)' })
    }
  })

  it('saves new color to recent colors when color input is changed', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByLabelText('文字色')).toBeDefined()
    })
    const textColorInput = screen.getByLabelText('文字色')
    fireEvent.change(textColorInput, { target: { value: '#ff0000' } })

    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ textColor: 'rgba(255, 0, 0, 1)' })
    const stored = JSON.parse(localStorage.getItem('speech_bubble_recent_colors') || '[]')
    expect(stored).toContain('rgba(255, 0, 0, 1)')
  })


  // ─── Preset Tests ──────────────────────────────────────────────

  it('renders presets list on mount with orientation suffix', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準 (縦)')).toBeDefined()
      expect(screen.getByText('叫び・赤枠 (横)')).toBeDefined()
    })
  })

  it('applies preset style and loads text when preset includes text', async () => {
    const textPreset: SpeechBubblePreset = {
      id: 5,
      name: 'SE効果音',
      shape: 'burst',
      orientation: 'vertical',
      font_family: 'sans-serif',
      font_size: 28,
      text_color: 'rgba(255, 0, 0, 1)',
      background_color: 'rgba(255, 255, 255, 1)',
      border_color: 'rgba(0, 0, 0, 1)',
      border_width: 3,
      sort_order: 2,
      text: 'ドォォン！',
      created_at: '2026-08-20T00:00:00Z',
    }
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([...mockPresets, textPreset])

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('SE効果音 (縦)')).toBeDefined()
    })

    const presetChip = screen.getByText('SE効果音 (縦)')
    fireEvent.click(presetChip)

    expect(defaultProps.onUpdate).toHaveBeenCalledWith({
      shape: 'burst',
      orientation: 'vertical',
      fontFamily: 'sans-serif',
      fontSize: 28,
      textColor: 'rgba(255, 0, 0, 1)',
      backgroundColor: 'rgba(255, 255, 255, 1)',
      borderColor: 'rgba(0, 0, 0, 1)',
      borderWidth: 3,
      effects: undefined,
      text: 'ドォォン！',
    })
  })

  it('applies preset style without overwriting text when preset has no text', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('叫び・赤枠 (横)')).toBeDefined()
    })

    const presetChip = screen.getByText('叫び・赤枠 (横)')
    fireEvent.click(presetChip)

    // text property should not be present in payload
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({
      shape: 'burst',
      orientation: 'horizontal',
      fontFamily: 'sans-serif',
      fontSize: 24,
      textColor: 'rgba(255, 0, 0, 1)',
      backgroundColor: 'rgba(255, 255, 200, 0.9)',
      borderColor: 'rgba(255, 0, 0, 1)',
      borderWidth: 4,
      effects: undefined,
    })
  })


  it('creates and adds a new preset', async () => {
    const newPreset: SpeechBubblePreset = {
      id: 3,
      name: '新規プリセット',
      shape: 'oval',
      orientation: 'vertical',
      font_family: 'sans-serif',
      font_size: 0,
      text_color: 'rgba(0, 0, 0, 1)',
      background_color: 'rgba(255, 255, 255, 0.95)',
      border_color: 'rgba(0, 0, 0, 1)',
      border_width: 2,
      sort_order: 2,
      created_at: '2026-08-20T01:00:00Z',
    }
    vi.mocked(speechBubblePresetsApi.create).mockImplementation(async () => {
      vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([...mockPresets, newPreset])
      return newPreset
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)

    // Open add input
    const addToggleBtn = screen.getByText('＋ プリセット登録')
    fireEvent.click(addToggleBtn)

    const nameInput = screen.getByPlaceholderText('プリセット名を入力...')
    fireEvent.change(nameInput, { target: { value: '新規プリセット' } })

    const saveBtn = screen.getByText('保存')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(speechBubblePresetsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '新規プリセット',
          shape: 'oval',
          orientation: 'vertical',
          font_family: 'sans-serif',
          font_size: 0,
          text_color: 'rgba(0, 0, 0, 1)',
          background_color: 'rgba(255, 255, 255, 0.95)',
          border_color: 'rgba(0, 0, 0, 1)',
          border_width: 2,
        })
      )
      expect(screen.getByText('新規プリセット (縦)')).toBeDefined()
    })
  })

  it('deletes preset when delete icon is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(speechBubblePresetsApi.delete).mockImplementation(async () => {
      vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(mockPresets.filter((p) => p.id !== 1))
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準 (縦)')).toBeDefined()
    })

    const deleteButtons = screen.getAllByTitle('プリセットを削除')
    expect(deleteButtons[0]).toHaveAttribute('aria-label', 'プリセット「コミック標準」を削除')
    expect(deleteButtons[0].querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(speechBubblePresetsApi.delete).toHaveBeenCalledWith(1)
      expect(screen.queryByText('コミック標準 (縦)')).toBeNull()
    })
  })

  it('opens overwrite modal and updates preset name and style on submit', async () => {
    const updatedPreset: SpeechBubblePreset = {
      ...mockPresets[0],
      name: 'コミック標準改',
      shape: 'burst',
    }
    vi.mocked(speechBubblePresetsApi.update).mockResolvedValue(updatedPreset)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, shape: 'burst' }} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準 (縦)')).toBeDefined()
    })

    const overwriteButtons = screen.getAllByTitle('現在の修飾で上書き')
    fireEvent.click(overwriteButtons[0])

    // Verify modal is open
    expect(screen.getByTestId('preset-overwrite-modal')).toBeDefined()
    expect(screen.getByText('プリセットの上書き保存')).toBeDefined()

    // Change name
    const nameInput = screen.getByTestId('overwrite-preset-name-input')
    expect((nameInput as HTMLInputElement).value).toBe('コミック標準')
    fireEvent.change(nameInput, { target: { value: 'コミック標準改' } })

    // Submit overwrite
    const submitBtn = screen.getByTestId('overwrite-preset-submit-btn')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(speechBubblePresetsApi.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: 'コミック標準改',
          shape: 'burst',
          text: null,
        })
      )
      expect(screen.queryByTestId('preset-overwrite-modal')).toBeNull()
    })
  })

  it('updates text inclusion when toggling checkbox in overwrite modal', async () => {
    const updatedPresetWithText: SpeechBubblePreset = {
      ...mockPresets[0],
      text: '保存テキスト',
    }
    vi.mocked(speechBubblePresetsApi.update).mockResolvedValue(updatedPresetWithText)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, text: '保存テキスト' }} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準 (縦)')).toBeDefined()
    })

    const overwriteButtons = screen.getAllByTitle('現在の修飾で上書き')
    fireEvent.click(overwriteButtons[0])

    const textCheckbox = screen.getByTestId('overwrite-preset-include-text-checkbox') as HTMLInputElement
    expect(textCheckbox.checked).toBe(false)

    // Check include text
    fireEvent.click(textCheckbox)
    expect(textCheckbox.checked).toBe(true)

    const submitBtn = screen.getByTestId('overwrite-preset-submit-btn')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(speechBubblePresetsApi.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          text: '保存テキスト',
        })
      )
    })
  })

  it('closes overwrite modal without saving on cancel button click', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準 (縦)')).toBeDefined()
    })

    const overwriteButtons = screen.getAllByTitle('現在の修飾で上書き')
    fireEvent.click(overwriteButtons[0])

    expect(screen.getByTestId('preset-overwrite-modal')).toBeDefined()

    const cancelBtn = screen.getByTestId('overwrite-preset-cancel-btn')
    fireEvent.click(cancelBtn)

    expect(screen.queryByTestId('preset-overwrite-modal')).toBeNull()

    fireEvent.click(screen.getAllByTitle('現在の修飾で上書き')[0])
    const closeButton = screen.getByRole('button', { name: '上書き保存を閉じる' })
    expect(closeButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(closeButton)
    expect(screen.queryByTestId('preset-overwrite-modal')).toBeNull()
    expect(speechBubblePresetsApi.update).not.toHaveBeenCalled()
  })

  it('distinguishes presets with the same name but different orientations', async () => {
    const dualPresets: SpeechBubblePreset[] = [
      {
        id: 101,
        name: '共有スタイル',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: 'rgba(0, 0, 0, 1)',
        background_color: 'rgba(255, 255, 255, 1)',
        border_color: 'rgba(0, 0, 0, 1)',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00Z',
      },
      {
        id: 102,
        name: '共有スタイル',
        shape: 'rounded-rect',
        orientation: 'horizontal',
        font_family: 'sans-serif',
        font_size: 22,
        text_color: 'rgba(0, 0, 0, 1)',
        background_color: 'rgba(255, 255, 255, 1)',
        border_color: 'rgba(0, 0, 0, 1)',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T00:00:00Z',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(dualPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('共有スタイル (縦)')).toBeDefined()
      expect(screen.getByText('共有スタイル (横)')).toBeDefined()
    })

    // Click horizontal preset
    fireEvent.click(screen.getByText('共有スタイル (横)'))
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        shape: 'rounded-rect',
        orientation: 'horizontal',
        fontSize: 22,
      })
    )
  })

  it('separates presets into with-text and style-only sections with independent collapse/expand (AC-1)', async () => {
    const mixedPresets: SpeechBubblePreset[] = [
      {
        id: 1,
        name: 'スタイルのみA',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000000',
        background_color: '#ffffff',
        border_color: '#000000',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00Z',
        text: null,
      },
      {
        id: 2,
        name: 'テキスト付きB',
        shape: 'burst',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 24,
        text_color: '#ff0000',
        background_color: '#ffffff',
        border_color: '#000000',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T01:00:00Z',
        text: 'ドォォン！',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(mixedPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/テキスト付き \(1\)/)).toBeDefined()
      expect(screen.getByText(/スタイル専用 \(1\)/)).toBeDefined()
      expect(screen.getByText('テキスト付きB (縦)')).toBeDefined()
      expect(screen.getByText('スタイルのみA (縦)')).toBeDefined()
    })

    // Toggle collapse for with-text section
    const toggleWithTextBtn = screen.getByLabelText('テキスト付きプリセットの折り畳み切替')
    expect(toggleWithTextBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(toggleWithTextBtn.querySelector('svg')).toHaveClass('lucide-chevron-down')
    fireEvent.click(toggleWithTextBtn)
    expect(toggleWithTextBtn.querySelector('svg')).toHaveClass('lucide-chevron-right')
    expect(screen.queryByText('テキスト付きB (縦)')).toBeNull()
    expect(screen.getByText('スタイルのみA (縦)')).toBeDefined()

    // Toggle expand for with-text section
    fireEvent.click(toggleWithTextBtn)
    expect(screen.getByText('テキスト付きB (縦)')).toBeDefined()

    // Toggle collapse for without-text section
    const toggleWithoutTextBtn = screen.getByLabelText('スタイル専用プリセットの折り畳み切替')
    expect(toggleWithoutTextBtn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(toggleWithoutTextBtn)
    expect(toggleWithoutTextBtn.querySelector('svg')).toHaveClass('lucide-chevron-right')
    expect(screen.queryByText('スタイルのみA (縦)')).toBeNull()
    expect(screen.getByText('テキスト付きB (縦)')).toBeDefined()
  })

  it('[REQ-180/AC-1] renders style-only presets section before with-text presets section in DOM order', async () => {
    const mixedPresets: SpeechBubblePreset[] = [
      {
        id: 1,
        name: 'スタイルのみA',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000000',
        background_color: '#ffffff',
        border_color: '#000000',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00Z',
        text: null,
      },
      {
        id: 2,
        name: 'テキスト付きB',
        shape: 'burst',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 24,
        text_color: '#ff0000',
        background_color: '#ffffff',
        border_color: '#000000',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T01:00:00Z',
        text: 'ドォォン！',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(mixedPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      const styleBtn = screen.getByLabelText('スタイル専用プリセットの折り畳み切替')
      const textBtn = screen.getByLabelText('テキスト付きプリセットの折り畳み切替')
      expect(styleBtn.compareDocumentPosition(textBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('sorts presets by name (asc/desc) and created date (asc/desc) with default name-asc (AC-2)', async () => {
    const unsortedPresets: SpeechBubblePreset[] = [
      {
        id: 1,
        name: 'Bプリセット',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T01:00:00Z',
      },
      {
        id: 2,
        name: 'Aプリセット',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T02:00:00Z',
      },
      {
        id: 3,
        name: 'Cプリセット',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 2,
        created_at: '2026-08-20T00:00:00Z',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(unsortedPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Aプリセット (縦)')).toBeDefined()
    })

    const sortSelect = screen.getByLabelText('プリセット並び順') as HTMLSelectElement
    expect(sortSelect.value).toBe('name-asc')

    // Name Ascending: A, B, C
    const getPresetTexts = () =>
      Array.from(document.querySelectorAll('[data-testid="speech-bubble-presets-section"] .group')).map(
        (el) => el.textContent || ''
      )

    let texts = getPresetTexts()
    expect(texts[0]).toContain('Aプリセット')
    expect(texts[1]).toContain('Bプリセット')
    expect(texts[2]).toContain('Cプリセット')

    // Sort by name-desc: C, B, A
    fireEvent.change(sortSelect, { target: { value: 'name-desc' } })
    texts = getPresetTexts()
    expect(texts[0]).toContain('Cプリセット')
    expect(texts[1]).toContain('Bプリセット')
    expect(texts[2]).toContain('Aプリセット')

    // Sort by created-asc (00:00 C, 01:00 B, 02:00 A)
    fireEvent.change(sortSelect, { target: { value: 'created-asc' } })
    texts = getPresetTexts()
    expect(texts[0]).toContain('Cプリセット')
    expect(texts[1]).toContain('Bプリセット')
    expect(texts[2]).toContain('Aプリセット')

    // Sort by created-desc (02:00 A, 01:00 B, 00:00 C)
    fireEvent.change(sortSelect, { target: { value: 'created-desc' } })
    texts = getPresetTexts()
    expect(texts[0]).toContain('Aプリセット')
    expect(texts[1]).toContain('Bプリセット')
    expect(texts[2]).toContain('Cプリセット')
  })

  it('filters presets in real-time by search query across name and text (AC-3)', async () => {
    const searchPresets: SpeechBubblePreset[] = [
      {
        id: 1,
        name: '日常会話',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00Z',
        text: 'こんにちは',
      },
      {
        id: 2,
        name: 'バトル叫び',
        shape: 'burst',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 24,
        text_color: '#f00',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T00:00:00Z',
        text: 'うわあああ',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(searchPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('日常会話 (縦)')).toBeDefined()
      expect(screen.getByText('バトル叫び (縦)')).toBeDefined()
    })

    const searchInput = screen.getByLabelText('プリセット検索')

    // Search by name
    fireEvent.change(searchInput, { target: { value: 'バトル' } })
    expect(screen.queryByText('日常会話 (縦)')).toBeNull()
    expect(screen.getByText('バトル叫び (縦)')).toBeDefined()

    // Search by text
    fireEvent.change(searchInput, { target: { value: 'こんにちは' } })
    expect(screen.getByText('日常会話 (縦)')).toBeDefined()
    expect(screen.queryByText('バトル叫び (縦)')).toBeNull()

    // Search non-matching
    fireEvent.change(searchInput, { target: { value: '該当なし検索語' } })
    expect(screen.getByText('条件に一致するプリセットがありません')).toBeDefined()

    // Clear search
    const clearBtn = screen.getByLabelText('検索クリア')
    fireEvent.click(clearBtn)
    expect(screen.getByText('日常会話 (縦)')).toBeDefined()
    expect(screen.getByText('バトル叫び (縦)')).toBeDefined()
  })

  it('filters presets by direction filter (all / vertical / horizontal) (AC-4)', async () => {
    const directionPresets: SpeechBubblePreset[] = [
      {
        id: 1,
        name: '縦書きプリセット',
        shape: 'oval',
        orientation: 'vertical',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 0,
        created_at: '2026-08-20T00:00:00Z',
      },
      {
        id: 2,
        name: '横書きプリセット',
        shape: 'rounded-rect',
        orientation: 'horizontal',
        font_family: 'sans-serif',
        font_size: 20,
        text_color: '#000',
        background_color: '#fff',
        border_color: '#000',
        border_width: 2,
        sort_order: 1,
        created_at: '2026-08-20T00:00:00Z',
      },
    ]
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(directionPresets)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('縦書きプリセット (縦)')).toBeDefined()
      expect(screen.getByText('横書きプリセット (横)')).toBeDefined()
    })

    const filterGroup = screen.getByRole('group', { name: 'プリセット種別フィルタ' })

    // Filter vertical only
    fireEvent.click(within(filterGroup).getByText('縦書き'))
    expect(screen.getByText('縦書きプリセット (縦)')).toBeDefined()
    expect(screen.queryByText('横書きプリセット (横)')).toBeNull()

    // Filter horizontal only
    fireEvent.click(within(filterGroup).getByText('横書き'))
    expect(screen.queryByText('縦書きプリセット (縦)')).toBeNull()
    expect(screen.getByText('横書きプリセット (横)')).toBeDefined()

    // Reset to all
    fireEvent.click(within(filterGroup).getByText('すべて'))
    expect(screen.getByText('縦書きプリセット (縦)')).toBeDefined()
    expect(screen.getByText('横書きプリセット (横)')).toBeDefined()
  })

  it('persists and restores filter, sort, and collapse settings in localStorage (AC-5)', async () => {
    // 1. Restore from existing localStorage
    const savedSettings = {
      searchQuery: 'コミック',
      directionFilter: 'vertical',
      sortBy: 'created-desc',
      isWithTextOpen: false,
      isWithoutTextOpen: true,
    }
    localStorage.setItem('speech_bubble_preset_filter_settings', JSON.stringify(savedSettings))

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      const searchInput = screen.getByLabelText('プリセット検索') as HTMLInputElement
      expect(searchInput.value).toBe('コミック')
      const sortSelect = screen.getByLabelText('プリセット並び順') as HTMLSelectElement
      expect(sortSelect.value).toBe('created-desc')
    })

    // 2. Modify settings and verify saved to localStorage
    const searchInput = screen.getByLabelText('プリセット検索')
    fireEvent.change(searchInput, { target: { value: '新しい検索' } })

    const updated = JSON.parse(localStorage.getItem('speech_bubble_preset_filter_settings') || '{}')
    expect(updated.searchQuery).toBe('新しい検索')
    expect(updated.directionFilter).toBe('vertical')
    expect(updated.sortBy).toBe('created-desc')
  })

  // ─── Speech Tone Conversion Tests ──────────────────────────────

  it('renders tone presets and custom prompt input when tone section is opened', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    
    // Toggle tone section open
    const toneToggle = screen.getByText(/セリフ口調変換/)
    fireEvent.click(toneToggle)

    await waitFor(() => {
      expect(screen.getByLabelText('口調プリセット選択')).toBeDefined()
      expect(screen.getByPlaceholderText(/口調の指示を入力/)).toBeDefined()
      expect(screen.getByRole('button', { name: '口調変換 (LLM)' })).toBeDefined()
      expect(screen.getByText('ツンデレ風')).toBeDefined()
      expect(screen.getByText('お嬢様風')).toBeDefined()
    })
  })

  it('selects a tone preset and updates prompt textarea', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    
    // Open section
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    const select = screen.getByLabelText('口調プリセット選択')
    fireEvent.change(select, { target: { value: '10' } })

    const promptTextarea = screen.getByPlaceholderText(/口調の指示を入力/) as HTMLTextAreaElement
    expect(promptTextarea.value).toBe('ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。')
  })

  it('executes rewrite and displays preview with before/after', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockResolvedValue({
      rewritten_text: 'べ、別に用事があるわけじゃないんだからね！',
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    // Select preset
    fireEvent.change(screen.getByLabelText('口調プリセット選択'), { target: { value: '10' } })
    await waitFor(() => {
      expect(screen.getByDisplayValue('ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。')).toBeDefined()
    })

    // Click rewrite
    const rewriteBtn = screen.getByRole('button', { name: '口調変換 (LLM)' })
    fireEvent.click(rewriteBtn)

    await waitFor(() => {
      expect(speechTonePresetsApi.rewrite).toHaveBeenCalledWith({
        text: 'こんにちは',
        tone_prompt: 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
        preset_id: 10,
        snapshot_id: undefined,
        image_path: undefined,
        include_image: true,
        scene_hint: undefined,
      })
      const preview = screen.getByTestId('tone-rewrite-preview')
      expect(within(preview).getByText('こんにちは')).toBeDefined()
      expect(within(preview).getByText('べ、別に用事があるわけじゃないんだからね！')).toBeDefined()
    })
  })

  it('executes rewrite with scene hint and snapshotId/imagePath', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockResolvedValue({
      rewritten_text: 'べ、別に照れてなんかないんだからね！',
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} snapshotId={5} imagePath="snapshots/test5.png" />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByTestId('tone-rewrite-scene-hint')).toBeDefined()
    })

    // Set scene hint
    fireEvent.change(screen.getByTestId('tone-rewrite-scene-hint'), {
      target: { value: '照れながら強がっている' },
    })

    // Select preset
    fireEvent.change(screen.getByLabelText('口調プリセット選択'), { target: { value: '10' } })

    // Uncheck include image
    fireEvent.click(screen.getByTestId('tone-rewrite-include-image'))

    // Click rewrite
    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(speechTonePresetsApi.rewrite).toHaveBeenCalledWith({
        text: 'こんにちは',
        tone_prompt: 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
        preset_id: 10,
        snapshot_id: 5,
        image_path: 'snapshots/test5.png',
        include_image: false,
        scene_hint: '照れながら強がっている',
      })
    })
  })

  it('applies rewritten text to bubble on clicking apply button', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockResolvedValue({
      rewritten_text: 'ごきげんよう、皆様。',
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByText('お嬢様風')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('口調プリセット選択'), { target: { value: '11' } })
    await waitFor(() => {
      expect(screen.getByDisplayValue('上品なお嬢様言葉で「〜ですわ」をつけて。')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(screen.getByText('セリフに適用')).toBeDefined()
    })

    fireEvent.click(screen.getByText('セリフに適用'))
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ text: 'ごきげんよう、皆様。' })
    expect(screen.queryByTestId('tone-rewrite-preview')).toBeNull()
  })


  it('discards preview on clicking discard button', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockResolvedValue({
      rewritten_text: 'テスト変換セリフ',
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByLabelText('口調プリセット選択')).toBeDefined()
    })

    const promptTextarea = screen.getByPlaceholderText(/口調の指示を入力/)
    fireEvent.change(promptTextarea, { target: { value: 'カスタム口調指示' } })
    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(screen.getByText('破棄')).toBeDefined()
    })

    fireEvent.click(screen.getByText('破棄'))
    expect(defaultProps.onUpdate).not.toHaveBeenCalledWith({ text: 'テスト変換セリフ' })
    expect(screen.queryByTestId('tone-rewrite-preview')).toBeNull()
  })

  it('displays error message when rewrite fails', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockRejectedValue(new Error('LLMタイムアウト'))

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByLabelText('口調プリセット選択')).toBeDefined()
    })

    const promptTextarea = screen.getByPlaceholderText(/口調の指示を入力/)
    fireEvent.change(promptTextarea, { target: { value: 'カスタム口調指示' } })
    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(screen.getByText('LLMタイムアウト')).toBeDefined()
    })
  })

  it('displays thinking process accordion and toggles open/close', async () => {
    vi.mocked(speechTonePresetsApi.rewrite).mockResolvedValue({
      rewritten_text: 'べ、別にあんたのためじゃないんだからね！',
      scene_interpretation: '夕暮れの校舎裏で照れ隠しをしている状況',
      reasoning: '好意を隠すためにツンツンした態度を強調した',
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('口調プリセット選択'), { target: { value: '10' } })
    await waitFor(() => {
      expect(screen.getByDisplayValue('ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(screen.getByTestId('tone-rewrite-thinking')).toBeDefined()
    })

    // Initially collapsed
    expect(screen.queryByText('夕暮れの校舎裏で照れ隠しをしている状況')).toBeNull()

    // Toggle open
    fireEvent.click(screen.getByText(/AIの解釈・思考過程/))
    expect(screen.getByText('夕暮れの校舎裏で照れ隠しをしている状況')).toBeDefined()
    expect(screen.getByText('好意を隠すためにツンツンした態度を強調した')).toBeDefined()

    // Toggle close
    fireEvent.click(screen.getByText(/AIの解釈・思考過程/))
    expect(screen.queryByText('夕暮れの校舎裏で照れ隠しをしている状況')).toBeNull()
  })

  it('supports revision feedback instruction and regenerates with feedback', async () => {
    vi.mocked(speechTonePresetsApi.rewrite)
      .mockResolvedValueOnce({
        rewritten_text: 'べ、別に心配してないわよ。',
        scene_interpretation: '少しそっけない態度',
        reasoning: '軽めのツンデレ表現',
      })
      .mockResolvedValueOnce({
        rewritten_text: 'べ、別にあなたのことなんて1ミリも心配してないんだからね！勘違いしないでよね！',
        scene_interpretation: 'さらに強がっている態度',
        reasoning: 'より強い否定とテンプレツンデレ語尾の追加',
      })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByText('ツンデレ風')).toBeDefined()
    })

    fireEvent.change(screen.getByLabelText('口調プリセット選択'), { target: { value: '10' } })
    await waitFor(() => {
      expect(screen.getByDisplayValue('ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。')).toBeDefined()
    })
    fireEvent.click(screen.getByRole('button', { name: '口調変換 (LLM)' }))

    await waitFor(() => {
      expect(screen.getByText('べ、別に心配してないわよ。')).toBeDefined()
    })

    // Enter revision instruction
    const revisionInput = screen.getByTestId('tone-rewrite-revision-input')
    fireEvent.change(revisionInput, { target: { value: 'もっと激しく強がって否定して' } })

    // Click retry feedback button
    const feedbackRetryBtn = screen.getByTestId('tone-rewrite-retry-feedback')
    fireEvent.click(feedbackRetryBtn)

    await waitFor(() => {
      expect(speechTonePresetsApi.rewrite).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: 'こんにちは',
          previous_rewritten_text: 'べ、別に心配してないわよ。',
          revision_instruction: 'もっと激しく強がって否定して',
        })
      )
      expect(screen.getByText('べ、別にあなたのことなんて1ミリも心配してないんだからね！勘違いしないでよね！')).toBeDefined()
    })
  })

  it('saves custom tone prompt as a new preset', async () => {
    const newTonePreset: SpeechTonePreset = {
      id: 12,
      name: '武士風',
      prompt: '〜でござる口調で',
      description: null,
      sort_order: 2,
      created_at: '2026-08-20T02:00:00Z',
    }
    vi.mocked(speechTonePresetsApi.create).mockImplementation(async () => {
      vi.mocked(speechTonePresetsApi.list).mockResolvedValue([...mockTonePresets, newTonePreset])
      return newTonePreset
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/セリフ口調変換/))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/口調の指示を入力/)).toBeDefined()
    })

    // Input prompt
    const promptTextarea = screen.getByPlaceholderText(/口調の指示を入力/)
    fireEvent.change(promptTextarea, { target: { value: '〜でござる口調で' } })

    // Open add preset form in speech-tone-section
    const toneSection = screen.getByTestId('speech-tone-section')
    const addPresetBtn = within(toneSection).getByText('＋ プリセット登録')
    fireEvent.click(addPresetBtn)

    const nameInput = screen.getByPlaceholderText(/新しい口調プリセット名/)
    fireEvent.change(nameInput, { target: { value: '武士風' } })

    const registerBtn = screen.getByText('登録')
    fireEvent.click(registerBtn)

    await waitFor(() => {
      expect(speechTonePresetsApi.create).toHaveBeenCalledWith({
        name: '武士風',
        prompt: '〜でござる口調で',
        sort_order: 2,
      })
      expect(screen.getByText('武士風')).toBeDefined()
    })
  })

  // ─── Manga FX Tests ──────────────────────────────────────────

  it('renders manga effects section and allows toggling effects', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    const fxToggle = screen.getByText(/漫画テキスト演出/)
    fireEvent.click(fxToggle)

    await waitFor(() => {
      expect(screen.getByLabelText('字間')).toBeDefined()
      expect(screen.getByLabelText('スケール変化カーブ')).toBeDefined()
      expect(screen.getByLabelText('軌道タイプ')).toBeDefined()
      expect(screen.getByLabelText('塗りモード')).toBeDefined()
      expect(screen.getByText('＋ フチ追加')).toBeDefined()
    })

    // Change letter spacing
    const spacingSlider = screen.getByLabelText('字間')
    fireEvent.change(spacingSlider, { target: { value: '15' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.objectContaining({ letterSpacing: 15 }),
      })
    )

    // Change scale curve
    const scaleSelect = screen.getByLabelText('スケール変化カーブ')
    fireEvent.change(scaleSelect, { target: { value: 'ease-in' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.objectContaining({ scaleCurve: 'ease-in' }),
      })
    )
  })

  it('toggles tatechuyoko for punctuation in vertical text', async () => {
    const bubbleWithPunctuation: SpeechBubble = {
      ...mockBubble,
      text: 'すごい!?本当！',
      orientation: 'vertical',
    }
    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={bubbleWithPunctuation} />)
    fireEvent.click(screen.getByText(/漫画テキスト演出/))

    await waitFor(() => {
      expect(screen.getByText('!? 自動回転トグル')).toBeDefined()
    })

    const autoRotateBtn = screen.getByText('!? 自動回転トグル')
    fireEvent.click(autoRotateBtn)

    // Indices for '!' '?' '！' in 'すごい!?本当！' are 3, 4, 7
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.objectContaining({
          rotate90Indices: [3, 4, 7],
        }),
      })
    )
  })

  it('adds and updates multi-stroke layers', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    fireEvent.click(screen.getByText(/漫画テキスト演出/))

    await waitFor(() => {
      expect(screen.getByText('＋ フチ追加')).toBeDefined()
    })

    const addStrokeBtn = screen.getByText('＋ フチ追加')
    fireEvent.click(addStrokeBtn)

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: expect.objectContaining({
          multiStrokes: expect.arrayContaining([
            expect.objectContaining({ width: 3, color: 'rgba(255, 255, 255, 1)' }),
          ]),
        }),
      })
    )
  })

  it('preserves effects when creating and applying presets', async () => {
    const fxData = { scaleCurve: 'linear' as const, scaleStart: 1.0, scaleEnd: 2.0 }
    const bubbleWithFx: SpeechBubble = {
      ...mockBubble,
      effects: fxData,
    }
    const presetWithFx: SpeechBubblePreset = {
      id: 99,
      name: 'FX付きプリセット',
      shape: 'burst',
      orientation: 'vertical',
      font_family: 'sans-serif',
      font_size: 20,
      text_color: 'rgba(0, 0, 0, 1)',
      background_color: 'rgba(255, 255, 255, 1)',
      border_color: 'rgba(0, 0, 0, 1)',
      border_width: 2,
      sort_order: 5,
      effects: fxData,
      created_at: '2026-08-20T00:00:00Z',
    }
    vi.mocked(speechBubblePresetsApi.create).mockResolvedValue(presetWithFx)
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([...mockPresets, presetWithFx])

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={bubbleWithFx} />)

    // Add preset
    fireEvent.click(screen.getByText('＋ プリセット登録'))
    fireEvent.change(screen.getByPlaceholderText('プリセット名を入力...'), {
      target: { value: 'FX付きプリセット' },
    })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => {
      expect(speechBubblePresetsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'FX付きプリセット',
          effects: fxData,
        })
      )
    })

    // Click on preset chip
    const presetChip = screen.getByText('FX付きプリセット (縦)')
    fireEvent.click(presetChip)

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        shape: 'burst',
        effects: fxData,
      })
    )
  })

  it('updates bubble rotation on slider, input change and reset button', () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, rotation: 30 }} />)

    // Slider
    const slider = screen.getByLabelText('吹き出しの回転')
    fireEvent.change(slider, { target: { value: '45' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ rotation: 45 })

    // Number input
    const numInput = screen.getByLabelText('吹き出し回転角度数値')
    fireEvent.change(numInput, { target: { value: '-30' } })
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ rotation: -30 })

    // 0° reset button
    const resetBtn = screen.getByText('0° リセット')
    fireEvent.click(resetBtn)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ rotation: 0 })
  })

  it('calls onDuplicate when duplicate button is clicked', () => {
    const onDuplicateMock = vi.fn()
    renderWithQuery(<SpeechBubbleControls {...defaultProps} onDuplicate={onDuplicateMock} />)

    const dupBtn = screen.getByRole('button', { name: 'この吹き出しを複製' })
    fireEvent.click(dupBtn)
    expect(onDuplicateMock).toHaveBeenCalledTimes(1)
  })

  it('creates preset with text when checkbox is checked, and without text when unchecked', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, text: 'ドン！' }} />)

    // Open add preset
    fireEvent.click(screen.getByText('＋ プリセット登録'))
    const nameInput = screen.getByPlaceholderText('プリセット名を入力...')
    fireEvent.change(nameInput, { target: { value: 'SEプリセット' } })

    // Check text checkbox
    const textCheck = screen.getByLabelText('テキストを含める')
    expect(textCheck).toBeDefined()
    fireEvent.click(textCheck)

    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => {
      expect(speechBubblePresetsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SEプリセット',
          text: 'ドン！',
        })
      )
    })
  })

  it('does not overwrite current text when applying a preset without text', async () => {
    const presetWithoutText: SpeechBubblePreset = {
      id: 50,
      name: '装飾のみプリセット',
      shape: 'burst',
      orientation: 'horizontal',
      font_family: 'sans-serif',
      font_size: 24,
      text_color: '#ff0000',
      background_color: '#ffffff',
      border_color: '#000000',
      border_width: 2,
      sort_order: 0,
      text: null,
      created_at: '',
    }
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([presetWithoutText])

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, text: '保持されるべきテキスト' }} />)

    await waitFor(() => {
      expect(screen.getByText('装飾のみプリセット (横)')).toBeDefined()
    })

    fireEvent.click(screen.getByText('装飾のみプリセット (横)'))

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({
        text: expect.anything(),
      })
    )
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        shape: 'burst',
        orientation: 'horizontal',
      })
    )
  })

  it('overwrites text and renders 💬 badge when preset has text', async () => {
    const presetWithText: SpeechBubblePreset = {
      id: 51,
      name: 'セリフ入りプリセット',
      shape: 'burst',
      orientation: 'horizontal',
      font_family: 'sans-serif',
      font_size: 24,
      text_color: '#ff0000',
      background_color: '#ffffff',
      border_color: '#000000',
      border_width: 2,
      sort_order: 0,
      text: 'バーン！',
      created_at: '',
    }
    vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([presetWithText])

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, text: '元のテキスト' }} />)

    await waitFor(() => {
      expect(screen.getByText('セリフ入りプリセット (横)')).toBeDefined()
    })

    // The preset content remains visible independently of its decorative badge icon.
    expect(screen.getByText('セリフ入りプリセット (横)')).toBeDefined()

    // Click preset
    fireEvent.click(screen.getByText('セリフ入りプリセット (横)'))

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'バーン！',
      })
    )
  })

  it('increments and decrements values with step buttons', () => {
    renderWithQuery(
      <SpeechBubbleControls
        {...defaultProps}
        bubble={{ ...mockBubble, rotation: 10, fontSize: 20, borderWidth: 2, w: 150, h: 120 }}
      />
    )

    // Rotation steppers
    const rotDec = screen.getByLabelText('回転角度を減らす')
    fireEvent.click(rotDec)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ rotation: 9 })

    const rotInc = screen.getByLabelText('回転角度を増やす')
    fireEvent.click(rotInc)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ rotation: 11 })

    // Font size steppers
    const fontDec = screen.getByLabelText('フォントサイズを減らす')
    fireEvent.click(fontDec)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontSize: 19 })

    const fontInc = screen.getByLabelText('フォントサイズを増やす')
    fireEvent.click(fontInc)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ fontSize: 21 })

    // Border width steppers
    const borderDec = screen.getByLabelText('枠線幅を減らす')
    fireEvent.click(borderDec)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ borderWidth: 1 })

    const borderInc = screen.getByLabelText('枠線幅を増やす')
    fireEvent.click(borderInc)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ borderWidth: 3 })

    // Width steppers
    const wDec = screen.getByLabelText('吹き出し幅を減らす')
    fireEvent.click(wDec)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ w: 145 })

    const wInc = screen.getByLabelText('吹き出し幅を増やす')
    fireEvent.click(wInc)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ w: 155 })

    // Height steppers
    const hDec = screen.getByLabelText('吹き出し高さを減らす')
    fireEvent.click(hDec)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ h: 115 })

    const hInc = screen.getByLabelText('吹き出し高さを増やす')
    fireEvent.click(hInc)
    expect(defaultProps.onUpdate).toHaveBeenCalledWith({ h: 125 })
  })

  it('[REQ-180/AC-1] handles scale flipping and path flipping in manga fx section', () => {
    const onUpdateMock = vi.fn()
    renderWithQuery(
      <SpeechBubbleControls
        {...defaultProps}
        onUpdate={onUpdateMock}
        bubble={{
          ...mockBubble,
          orientation: 'vertical',
          effects: {
            scaleCurve: 'linear',
            scaleStart: 0.8,
            scaleEnd: 2.0,
            pathPreset: 'arc',
            pathPoints: [
              { x: 0.7, y: 0.1 },
              { x: 0.3, y: 0.5 },
              { x: 0.7, y: 0.9 },
            ],
          },
        }}
      />
    )

    // Open manga FX section
    const fxToggle = screen.getByText(/漫画テキスト演出/)
    fireEvent.click(fxToggle)

    // Scale flip
    const flipScaleBtn = screen.getByLabelText('スケール反転')
    expect(flipScaleBtn).toBeDefined()
    fireEvent.click(flipScaleBtn)
    expect(onUpdateMock).toHaveBeenCalledWith({
      effects: expect.objectContaining({
        scaleStart: 2.0,
        scaleEnd: 0.8,
      }),
    })

    // Path flip
    const flipPathBtn = screen.getByLabelText('パス反転')
    expect(flipPathBtn).toBeDefined()
    fireEvent.click(flipPathBtn)
    expect(onUpdateMock).toHaveBeenCalledWith({
      effects: expect.objectContaining({
        pathPoints: [
          { x: 0.3, y: 0.1 },
          { x: 0.7, y: 0.5 },
          { x: 0.3, y: 0.9 },
        ],
      }),
    })
  })

  it('[REQ-188/AC-1] synchronizes default pathPoints when pathPreset or orientation changes', () => {
    const onUpdateMock = vi.fn()
    const { rerender } = renderWithQuery(
      <SpeechBubbleControls
        {...defaultProps}
        onUpdate={onUpdateMock}
        bubble={{
          ...mockBubble,
          orientation: 'vertical',
          effects: {
            pathPreset: 'none',
            pathPoints: [],
          },
        }}
      />
    )

    // Open manga FX section
    fireEvent.click(screen.getByText(/漫画テキスト演出/))

    // Select 'arc' path preset
    const presetSelect = screen.getByLabelText('軌道タイプ')
    fireEvent.change(presetSelect, { target: { value: 'arc' } })

    expect(onUpdateMock).toHaveBeenCalledWith({
      effects: expect.objectContaining({
        pathPreset: 'arc',
        pathPoints: [
          { x: 0.7, y: 0.1 },
          { x: 0.3, y: 0.5 },
          { x: 0.7, y: 0.9 },
        ],
      }),
    })

    // Rerender with active path preset
    rerender(
      <QueryClientProvider client={queryClient}>
        <SpeechBubbleControls
          {...defaultProps}
          onUpdate={onUpdateMock}
          bubble={{
            ...mockBubble,
            orientation: 'vertical',
            effects: {
              pathPreset: 'arc',
              pathPoints: [
                { x: 0.7, y: 0.1 },
                { x: 0.3, y: 0.5 },
                { x: 0.7, y: 0.9 },
              ],
            },
          }}
        />
      </QueryClientProvider>
    )

    // Change orientation to horizontal
    const quickAdjust = screen.getByTestId('quick-adjust-section')
    const horizBtn = within(quickAdjust).getByText('横書き')
    fireEvent.click(horizBtn)

    expect(onUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orientation: 'horizontal',
        effects: expect.objectContaining({
          pathPoints: [
            { x: 0.1, y: 0.7 },
            { x: 0.5, y: 0.3 },
            { x: 0.9, y: 0.7 },
          ],
        }),
      })
    )
  })

  it('[REQ-188/AC-2] falls back to default path points before flipping if pathPoints is empty', () => {
    const onUpdateMock = vi.fn()
    renderWithQuery(
      <SpeechBubbleControls
        {...defaultProps}
        onUpdate={onUpdateMock}
        bubble={{
          ...mockBubble,
          orientation: 'vertical',
          effects: {
            pathPreset: 'arc',
            pathPoints: [],
          },
        }}
      />
    )

    // Open manga FX section
    fireEvent.click(screen.getByText(/漫画テキスト演出/))

    // Flip path
    const flipPathBtn = screen.getByLabelText('パス反転')
    fireEvent.click(flipPathBtn)

    expect(onUpdateMock).toHaveBeenCalledWith({
      effects: expect.objectContaining({
        pathPoints: [
          { x: 0.3, y: 0.1 },
          { x: 0.7, y: 0.5 },
          { x: 0.3, y: 0.9 },
        ],
      }),
    })
  })
})

