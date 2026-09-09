import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/mocks/server'
import { usePromptTranslation } from '../usePromptTranslation'

describe('usePromptTranslation - Fault Injection Tests (MSW)', () => {
  let paramValues: Record<string, string>
  let setParamValues: (values: Record<string, string>) => void

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    paramValues = {
      positive_prompt: '1girl, original text, high quality',
    }
    setParamValues = (newVals) => {
      paramValues = { ...newVals }
    }
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('maintains original sourceText and prompt when translation fails with 504 Gateway Timeout', async () => {
    server.use(
      http.post('/api/translate/prompt', () => {
        return new HttpResponse('Gateway Timeout', { status: 504 })
      })
    )

    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues: (v) => setParamValues(v) })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', paramValues.positive_prompt)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.sourceText).toBe('1girl, original text, high quality')

    await act(async () => {
      await result.current.executeTranslate()
    })

    expect(result.current.isTranslating).toBe(false)
    expect(result.current.error).not.toBeNull()
    expect(result.current.error).toMatch(/504/)
    expect(result.current.sourceText).toBe('1girl, original text, high quality')
    expect(paramValues.positive_prompt).toBe('1girl, original text, high quality')
  })

  it('recovers safely on network failure without corrupting state or original prompts', async () => {
    server.use(
      http.post('/api/translate/prompt', () => {
        return HttpResponse.error()
      })
    )

    const { result } = renderHook(() =>
      usePromptTranslation({ paramValues, setParamValues: (v) => setParamValues(v) })
    )

    act(() => {
      result.current.openTranslation('positive_prompt', paramValues.positive_prompt)
    })

    await act(async () => {
      await result.current.executeTranslate()
    })

    expect(result.current.isTranslating).toBe(false)
    expect(result.current.error).toBeTruthy()
    expect(result.current.sourceText).toBe('1girl, original text, high quality')
    expect(paramValues.positive_prompt).toBe('1girl, original text, high quality')
  })
})
