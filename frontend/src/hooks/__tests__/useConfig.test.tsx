import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useConfig } from '../useConfig'
import { configApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  configApi: {
    get: vi.fn(),
    update: vi.fn(),
  },
}))

describe('useConfig', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('fetches and returns configuration via React Query', async () => {
    const mockConfig = { comfy_url: 'http://127.0.0.1:8188' }
    vi.mocked(configApi.get).mockResolvedValue(mockConfig)

    const { result } = renderHook(() => useConfig(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(mockConfig)
    expect(configApi.get).toHaveBeenCalledTimes(1)
  })
})
