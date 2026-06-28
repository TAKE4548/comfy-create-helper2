import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuditAction } from '../useAuditAction'
import { useGenerationStore } from '../../../../store/useGenerationStore'
import { auditApi } from '../../../../api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../../../../store/useGenerationStore', () => {
  const store = {
    paramValues: {},
  }
  return {
    useGenerationStore: () => store,
  }
})

vi.mock('../../../../api/client', () => ({
  auditApi: {
    run: vi.fn(),
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useAuditAction', () => {
  let mockStore: any

  beforeEach(() => {
    mockStore = useGenerationStore()
    mockStore.paramValues = {}
    vi.clearAllMocks()
  })

  it('should initialize with correct default state values', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useAuditAction(), { wrapper })

    expect(result.current.auditOpen).toBe(false)
    expect(result.current.auditIntent).toBe('')
    expect(result.current.auditTypes).toEqual(['interference'])
    expect(result.current.auditResult).toBeNull()
    expect(result.current.auditStatus).toBe('idle')
  })

  it('should update open state, intent, and audit types correctly', () => {
    const wrapper = createWrapper()
    const { result } = renderHook(() => useAuditAction(), { wrapper })

    act(() => {
      result.current.setAuditOpen(true)
    })
    expect(result.current.auditOpen).toBe(true)

    act(() => {
      result.current.setAuditIntent('Enhance details')
    })
    expect(result.current.auditIntent).toBe('Enhance details')

    act(() => {
      result.current.setAuditTypes(['interference', 'vocabulary'])
    })
    expect(result.current.auditTypes).toEqual(['interference', 'vocabulary'])
  })

  it('should correctly extract prompts, run auditApi, and update status to done on success', async () => {
    mockStore.paramValues = {
      'Positive_Prompt': 'masterpiece, best quality, solo',
      'Additional_Prompt': '1girl, long hair',
      'Negative_Prompt': 'lowres, bad anatomy',
      'Unrelated_Param': '20',
    }

    const mockResult = {
      interference: [{ tag: 'lowres', reason: 'conflicts with masterpiece' }],
      vocabulary: [{ suggestion: 'highly detailed', effect: 'improves sharpness' }],
    }
    
    // Introduce a small delay to test 'loading' status
    vi.mocked(auditApi.run).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockResult), 50))
    )

    const wrapper = createWrapper()
    const { result } = renderHook(() => useAuditAction(), { wrapper })

    act(() => {
      result.current.setAuditIntent('Make it look better')
      result.current.setAuditTypes(['interference', 'vocabulary'])
    })

    let runPromise: Promise<any>
    act(() => {
      runPromise = result.current.runAudit.mutateAsync()
    })

    await waitFor(() => {
      expect(result.current.auditStatus).toBe('loading')
    })

    await act(async () => {
      await runPromise
    })

    expect(auditApi.run).toHaveBeenCalledWith({
      audit_types: ['interference', 'vocabulary'],
      positive: 'masterpiece, best quality, solo, 1girl, long hair',
      negative: 'lowres, bad anatomy',
      intent: 'Make it look better',
      model_hint: 'SDXL',
    })

    expect(result.current.auditStatus).toBe('done')
    expect(result.current.auditResult).toEqual(mockResult)
  })

  it('should handle API errors and set status to error', async () => {
    // Introduce a small delay to test 'loading' status and catch promise rejection safely
    vi.mocked(auditApi.run).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('Network Error')), 50))
    )

    const wrapper = createWrapper()
    const { result } = renderHook(() => useAuditAction(), { wrapper })

    let runPromise: Promise<any>
    act(() => {
      runPromise = result.current.runAudit.mutateAsync()
      // Attach catch handler immediately to prevent Unhandled Rejection warning/error in Vitest
      runPromise.catch(() => {})
    })

    await waitFor(() => {
      expect(result.current.auditStatus).toBe('loading')
    })

    await act(async () => {
      await expect(runPromise).rejects.toThrow('Network Error')
    })

    expect(result.current.auditStatus).toBe('error')
    expect(result.current.auditResult).toBeNull()
  })
})
