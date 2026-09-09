import React from 'react'
import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '../../../../test/mocks/server'
import { useAuditAction } from '../useAuditAction'
import { useSceneGenerator } from '../useSceneGenerator'
import { useGenerationStore } from '../../../../store/useGenerationStore'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )
}

describe('LLM Fault Injection Tests (MSW)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    useGenerationStore.setState({
      paramValues: {
        Positive_Prompt: '1girl, cyberpunk city',
        Negative_Prompt: 'lowres, blurry',
      },
    })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  describe('useAuditAction Fault Handling', () => {
    it('sets auditStatus to error and unblocks UI lock when audit API returns 504 Timeout', async () => {
      server.use(
        http.post('/api/audit', async () => {
          await delay(80)
          return new HttpResponse('Gateway Timeout', { status: 504 })
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuditAction(), { wrapper })

      let runPromise: Promise<any>
      act(() => {
        runPromise = result.current.runAudit.mutateAsync()
        runPromise.catch(() => {})
      })

      await waitFor(() => {
        expect(result.current.auditStatus).toBe('loading')
      })

      await act(async () => {
        await expect(runPromise).rejects.toThrow()
      })

      expect(result.current.auditStatus).toBe('error')
      expect(result.current.auditResult).toBeNull()
    })

    it('sets auditStatus to error on network failure', async () => {
      server.use(
        http.post('/api/audit', async () => {
          await delay(80)
          return HttpResponse.error()
        })
      )

      const wrapper = createWrapper()
      const { result } = renderHook(() => useAuditAction(), { wrapper })

      let runPromise: Promise<any>
      act(() => {
        runPromise = result.current.runAudit.mutateAsync()
        runPromise.catch(() => {})
      })

      await waitFor(() => {
        expect(result.current.auditStatus).toBe('loading')
      })

      await act(async () => {
        await expect(runPromise).rejects.toThrow()
      })

      expect(result.current.auditStatus).toBe('error')
    })
  })

  describe('useSceneGenerator Fault Handling', () => {
    it('handles 504 timeout from scene-generate endpoint without unhandled rejection and allows caller to recover', async () => {
      server.use(
        http.post('/api/llm-prompts/scene-generate', () => {
          return new HttpResponse('LLM Generation Timeout', { status: 504 })
        })
      )

      const { result } = renderHook(() =>
        useSceneGenerator({
          workflowId: 10,
          baseParamValues: { Positive: 'base prompt' },
        })
      )

      let isDrafting = true
      let caughtError: Error | null = null

      try {
        await result.current.generateDrafts(['Positive'], [
          { id: 'scene-1', summary: 'night cafe' },
        ])
      } catch (err: any) {
        caughtError = err
      } finally {
        isDrafting = false
      }

      expect(caughtError).not.toBeNull()
      expect(caughtError?.message).toMatch(/504/)
      expect(isDrafting).toBe(false)
    })
  })
})
