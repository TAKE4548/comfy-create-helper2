import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { speechBubblePresetsApi, tagSetsApi } from '../../api/client'
import type { SpeechBubblePreset, TagSet } from '../../api/types'
import { SceneSpeechOnboarding } from '../SpeechBubbleEditorModal/sections/SceneSpeechOnboarding'

vi.mock('../../api/client', () => ({
  speechBubblePresetsApi: { list: vi.fn(), create: vi.fn() },
  tagSetsApi: { list: vi.fn() },
}))

const base = {
  id: 3, name: 'Base', shape: 'cloud', orientation: 'vertical',
  font_family: 'Other', font_size: 24, text_color: '#111111',
  background_color: '#222222', border_color: '#333333', border_width: 3,
  sort_order: 0, created_at: '',
} as SpeechBubblePreset
const tagSet = { id: 7, name: 'Alice' } as TagSet
const fonts = [{ name: 'Noto Sans JP', file_name: 'noto.ttf' }, { name: 'Other', file_name: 'other.ttf' }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(speechBubblePresetsApi.list).mockResolvedValue([base])
  vi.mocked(tagSetsApi.list).mockResolvedValue([tagSet])
})

describe('SceneSpeechOnboarding', () => {
  it('edits every style field and saves with the tag set ID once', async () => {
    vi.mocked(speechBubblePresetsApi.create).mockResolvedValue({ ...base, id: 42 })
    const onPresetCreated = vi.fn()
    render(<SceneSpeechOnboarding tagSetId={7} fontList={fonts} onPresetCreated={onPresetCreated} onSkip={vi.fn()} />)
    await screen.findByDisplayValue('Alice 専用スタイル')
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: 'Custom' } })
    fireEvent.change(screen.getByLabelText('ベースプリセット'), { target: { value: '3' } })
    expect(screen.getByLabelText('形状')).toHaveValue('cloud')
    expect(screen.getByLabelText('向き')).toHaveValue('vertical')
    expect(screen.getByLabelText('フォント')).toHaveValue('Other')
    expect(screen.getByLabelText('文字サイズ')).toHaveValue(24)
    expect(screen.getByLabelText('文字色')).toHaveValue('#111111')
    expect(screen.getByLabelText('背景色')).toHaveValue('#222222')
    expect(screen.getByLabelText('枠色')).toHaveValue('#333333')
    expect(screen.getByLabelText('枠幅')).toHaveValue(3)
    fireEvent.change(screen.getByLabelText('形状'), { target: { value: 'rounded-rect' } })
    fireEvent.change(screen.getByLabelText('向き'), { target: { value: 'horizontal' } })
    fireEvent.change(screen.getByLabelText('フォント'), { target: { value: 'Noto Sans JP' } })
    fireEvent.change(screen.getByLabelText('文字サイズ'), { target: { value: '36' } })
    fireEvent.change(screen.getByLabelText('文字色'), { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('背景色'), { target: { value: '#123456' } })
    fireEvent.change(screen.getByLabelText('枠色'), { target: { value: '#654321' } })
    fireEvent.change(screen.getByLabelText('枠幅'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(onPresetCreated).toHaveBeenCalledWith(42))
    expect(speechBubblePresetsApi.create).toHaveBeenCalledTimes(1)
    expect(speechBubblePresetsApi.create).toHaveBeenCalledWith({
      name: 'Custom', shape: 'rounded-rect', orientation: 'horizontal',
      font_family: 'Noto Sans JP', font_size: 36, text_color: '#abcdef',
      background_color: '#123456', border_color: '#654321', border_width: 0.5,
      tag_set_id: 7,
    })
  })

  it('allows skip without creating a preset', async () => {
    const onSkip = vi.fn()
    render(<SceneSpeechOnboarding tagSetId={7} fontList={fonts} onPresetCreated={vi.fn()} onSkip={onSkip} />)
    await screen.findByDisplayValue('Alice 専用スタイル')
    fireEvent.click(screen.getByRole('button', { name: 'スキップ' }))
    expect(onSkip).toHaveBeenCalledOnce()
    expect(speechBubblePresetsApi.create).not.toHaveBeenCalled()
  })

  it('falls back to an editable name and shows save errors', async () => {
    vi.mocked(tagSetsApi.list).mockRejectedValue(new Error('unavailable'))
    vi.mocked(speechBubblePresetsApi.create).mockRejectedValue(new Error('save failed'))
    render(<SceneSpeechOnboarding tagSetId={7} fontList={fonts} onPresetCreated={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByLabelText('名前')).toHaveValue('キャラ#7 専用スタイル')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('save failed')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })
})
