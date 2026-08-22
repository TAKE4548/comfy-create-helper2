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
    expect(screen.getByText('縦書き')).toBeDefined()
    expect(screen.getByText('横書き')).toBeDefined()
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
      expect(screen.getByText('横書き')).toBeDefined()
    })
    const horizBtn = screen.getByText('横書き')
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

  it('renders presets list on mount', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準')).toBeDefined()
      expect(screen.getByText('叫び・赤枠')).toBeDefined()
    })
  })

  it('applies preset style when preset chip is clicked', async () => {
    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('叫び・赤枠')).toBeDefined()
    })

    const presetChip = screen.getByText('叫び・赤枠')
    fireEvent.click(presetChip)

    expect(defaultProps.onUpdate).toHaveBeenCalledWith({
      shape: 'burst',
      orientation: 'horizontal',
      fontFamily: 'sans-serif',
      fontSize: 24,
      textColor: 'rgba(255, 0, 0, 1)',
      backgroundColor: 'rgba(255, 255, 200, 0.9)',
      borderColor: 'rgba(255, 0, 0, 1)',
      borderWidth: 4,
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
      expect(screen.getByText('新規プリセット')).toBeDefined()
    })
  })

  it('deletes preset when delete icon is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(speechBubblePresetsApi.delete).mockImplementation(async () => {
      vi.mocked(speechBubblePresetsApi.list).mockResolvedValue(mockPresets.filter((p) => p.id !== 1))
    })

    renderWithQuery(<SpeechBubbleControls {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準')).toBeDefined()
    })

    const deleteButtons = screen.getAllByTitle('プリセットを削除')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(speechBubblePresetsApi.delete).toHaveBeenCalledWith(1)
      expect(screen.queryByText('コミック標準')).toBeNull()
    })
  })

  it('overwrites preset when overwrite icon is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const updatedPreset: SpeechBubblePreset = {
      ...mockPresets[0],
      shape: 'burst',
    }
    vi.mocked(speechBubblePresetsApi.update).mockResolvedValue(updatedPreset)

    renderWithQuery(<SpeechBubbleControls {...defaultProps} bubble={{ ...mockBubble, shape: 'burst' }} />)
    await waitFor(() => {
      expect(screen.getByText('コミック標準')).toBeDefined()
    })

    const overwriteButtons = screen.getAllByTitle('現在の修飾で上書き')
    fireEvent.click(overwriteButtons[0])

    await waitFor(() => {
      expect(speechBubblePresetsApi.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          shape: 'burst',
        })
      )
    })
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
      expect(screen.getByText('✨ 口調変換 (LLM)')).toBeDefined()
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
    const rewriteBtn = screen.getByText('✨ 口調変換 (LLM)')
    fireEvent.click(rewriteBtn)

    await waitFor(() => {
      expect(speechTonePresetsApi.rewrite).toHaveBeenCalledWith({
        text: 'こんにちは',
        tone_prompt: 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
        preset_id: 10,
      })
      const preview = screen.getByTestId('tone-rewrite-preview')
      expect(within(preview).getByText('こんにちは')).toBeDefined()
      expect(within(preview).getByText('べ、別に用事があるわけじゃないんだからね！')).toBeDefined()
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

    fireEvent.click(screen.getByText('✨ 口調変換 (LLM)'))

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
    fireEvent.click(screen.getByText('✨ 口調変換 (LLM)'))

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
    fireEvent.click(screen.getByText('✨ 口調変換 (LLM)'))

    await waitFor(() => {
      expect(screen.getByText('LLMタイムアウト')).toBeDefined()
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

})


