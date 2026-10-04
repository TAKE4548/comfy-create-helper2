import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translateApi } from '../../../../api/client'
import { TranslationPreviewCard } from '../TranslationPreviewCard'

vi.mock('../../../../api/client', () => ({
  translateApi: { translatePrompt: vi.fn() },
}))

const translatePrompt = vi.mocked(translateApi.translatePrompt)

describe('TranslationPreviewCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    translatePrompt.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('debounces edits, sends the selected direction and displays a read-only result', async () => {
    translatePrompt.mockResolvedValue({
      translated_prompt: 'Bonjour',
      meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 5, provider: 'deepl' },
    })
    render(<TranslationPreviewCard provider="deepl" enabled debounceMs={400} />)
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'Hello' } })
    expect(translatePrompt).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(399) })
    expect(translatePrompt).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(translatePrompt).toHaveBeenCalledWith({ prompt: 'Hello', source_lang: 'en', target_lang: 'ja', provider: 'deepl' })
    await act(async () => {})
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('Bonjour')
    expect(screen.getByLabelText('翻訳結果')).toHaveAttribute('readonly')
  })

  it('does not request blank input and supports explicit translation in the reverse direction', async () => {
    translatePrompt.mockResolvedValue({
      translated_prompt: 'Hello',
      meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 5, provider: 'google_cloud' },
    })
    render(<TranslationPreviewCard provider="google_cloud" enabled debounceMs={500} />)
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: '   ' } })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(translatePrompt).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'こんにちは' } })
    fireEvent.click(screen.getByRole('button', { name: '日本語から英語' }))
    fireEvent.click(screen.getByRole('button', { name: '翻訳する' }))
    await act(async () => {})
    expect(translatePrompt).toHaveBeenCalledTimes(1)
    expect(translatePrompt).toHaveBeenCalledWith({ prompt: 'こんにちは', source_lang: 'ja', target_lang: 'en', provider: 'google_cloud' })
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(translatePrompt).toHaveBeenCalledTimes(1)
  })

  it('sends a new request when input returns A→B→A and only the newest A response wins', async () => {
    type Response = Awaited<ReturnType<typeof translateApi.translatePrompt>>
    let resolveFirstA!: (value: Response) => void
    let resolveSecondA!: (value: Response) => void
    translatePrompt
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstA = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondA = resolve }))
    render(<TranslationPreviewCard provider="deepl" enabled debounceMs={300} />)
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'A' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'B' } })
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'A' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(translatePrompt).toHaveBeenCalledTimes(2)

    const response = (translated_prompt: string): Response => ({
      translated_prompt,
      meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 1, provider: 'deepl' },
    })
    await act(async () => { resolveSecondA(response('new A')) })
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('new A')
    await act(async () => { resolveFirstA(response('stale A')) })
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('new A')
  })

  it('ignores stale responses after edits, provider changes and disablement, and permits retry after failure', async () => {
    let resolveOld!: (value: { translated_prompt: string; meta: { total_chunks: number; cached_chunks: number; api_requested_chunks: number; billed_characters: number; provider: string } }) => void
    translatePrompt.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const view = render(<TranslationPreviewCard provider="deepl" enabled debounceMs={300} />)
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'old' } })
    await act(async () => { vi.advanceTimersByTime(300) })
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'new' } })
    translatePrompt.mockResolvedValueOnce({
      translated_prompt: 'nouveau',
      meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 3, provider: 'google_cloud' },
    })
    view.rerender(<TranslationPreviewCard provider="google_cloud" enabled debounceMs={300} />)
    await act(async () => { vi.advanceTimersByTime(300) })
    await act(async () => { resolveOld({ translated_prompt: 'stale', meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 3, provider: 'deepl' } }) })
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('nouveau')
    view.rerender(<TranslationPreviewCard provider="google_cloud" enabled={false} debounceMs={300} />)
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('')
  })

  it('announces errors and retries explicitly', async () => {
    translatePrompt.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      translated_prompt: '訳文',
      meta: { total_chunks: 1, cached_chunks: 0, api_requested_chunks: 1, billed_characters: 4, provider: 'llm' },
    })
    render(<TranslationPreviewCard provider="llm" enabled debounceMs={500} />)
    fireEvent.change(screen.getByLabelText('原文'), { target: { value: 'text' } })
    fireEvent.click(screen.getByRole('button', { name: '翻訳する' }))
    await act(async () => {})
    expect(screen.getByRole('status')).toHaveTextContent('翻訳に失敗しました')
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await act(async () => {})
    expect(screen.getByLabelText('翻訳結果')).toHaveValue('訳文')
  })
})
