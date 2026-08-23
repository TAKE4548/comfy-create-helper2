import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePromptTranslation } from '../usePromptTranslation'
import { translateApi } from '../../../../api/client'

vi.mock('../../../../api/client', () => ({
  translateApi: {
    translatePrompt: vi.fn(),
  },
}))

describe('usePromptTranslation hook', () => {
  let paramValues: Record<string, any>
  let setParamValues: any

  beforeEach(() => {
    vi.clearAllMocks()
    paramValues = {
      positive_prompt: '1girl, masterpiece',
    }
    setParamValues = vi.fn((updater) => {
      if (typeof updater === 'function') {
        paramValues = updater(paramValues)
      } else {
        paramValues = updater
      }
    })
  })

  it('should initialize with default closed state', () => {
    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues })
    )

    expect(result.current.isOpen).toBe(false)
    expect(result.current.activeRole).toBeNull()
    expect(result.current.mode).toBe('en_to_ja')
    expect(result.current.sourceText).toBe('')
    expect(result.current.translatedText).toBe('')
    expect(result.current.isTranslating).toBe(false)
  })

  it('should open modal and initialize source text without modifying paramValues', () => {
    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', '1girl, smile')
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.activeRole).toBe('positive_prompt')
    expect(result.current.sourceText).toBe('1girl, smile')
    expect(setParamValues).not.toHaveBeenCalled()
  })

  it('should execute translation and NOT mutate paramValues automatically', async () => {
    const mockResponse = {
      translated_prompt: '1人の女の子、笑顔',
      meta: {
        total_chunks: 2,
        cached_chunks: 0,
        api_requested_chunks: 2,
        billed_characters: 12,
        provider: 'google_free',
      },
    }
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', '1girl, smile')
    })

    await act(async () => {
      await result.current.executeTranslate()
    })

    expect(translateApi.translatePrompt).toHaveBeenCalledWith({
      prompt: '1girl, smile',
      source_lang: 'en',
      target_lang: 'ja',
    })
    expect(result.current.translatedText).toBe('1人の女の子、笑顔')
    expect(result.current.meta).toEqual(mockResponse.meta)
    expect(setParamValues).not.toHaveBeenCalled()
    expect(paramValues.positive_prompt).toBe('1girl, masterpiece')
  })

  it('should replace prompt value only when applyToPrompt(replace) is called', async () => {
    const mockResponse = {
      translated_prompt: '1girl, solo',
      meta: {
        total_chunks: 2,
        cached_chunks: 1,
        api_requested_chunks: 1,
        billed_characters: 4,
        provider: 'google_free',
      },
    }
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', '1人の女の子')
      result.current.setMode('ja_to_en')
    })

    await act(async () => {
      await result.current.executeTranslate()
    })

    act(() => {
      result.current.applyToPrompt('replace')
    })

    expect(setParamValues).toHaveBeenCalledTimes(1)
    expect(paramValues.positive_prompt).toBe('1girl, solo')
    expect(result.current.isOpen).toBe(false)
  })

  it('should append prompt value cleanly when applyToPrompt(append) is called', async () => {
    const mockResponse = {
      translated_prompt: 'blue sky',
      meta: {
        total_chunks: 1,
        cached_chunks: 0,
        api_requested_chunks: 1,
        billed_characters: 2,
        provider: 'google_free',
      },
    }
    vi.mocked(translateApi.translatePrompt).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', '青空')
      result.current.setMode('ja_to_en')
    })

    await act(async () => {
      await result.current.executeTranslate()
    })

    act(() => {
      result.current.applyToPrompt('append')
    })

    expect(setParamValues).toHaveBeenCalledTimes(1)
    expect(paramValues.positive_prompt).toBe('1girl, masterpiece, blue sky')
    expect(result.current.isOpen).toBe(false)
  })
})
