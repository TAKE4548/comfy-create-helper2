import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useComfyNodeTypes } from '../useComfyNodeTypes'
import { comfyApi } from '../../api/client'

vi.mock('../../api/client', () => ({
  comfyApi: {
    getObjectInfoAll: vi.fn(),
  },
}))

describe('useComfyNodeTypes', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  )

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.clearAllMocks()
  })

  it('fetches object info and returns sorted classNames', async () => {
    const mockData = {
      KSampler: { input: {} },
      CLIPTextEncode: { input: {} },
      CheckpointLoaderSimple: { input: {} },
      VAEDecode: { input: {} },
    }
    vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValueOnce(mockData as never)

    const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isError).toBe(false)
    expect(result.current.classNames).toEqual([
      'CheckpointLoaderSimple',
      'CLIPTextEncode',
      'KSampler',
      'VAEDecode',
    ])
  })

  it('handles empty or error responses gracefully', async () => {
    vi.mocked(comfyApi.getObjectInfoAll).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.classNames).toEqual([])
    expect(result.current.filterClassTypes('test')).toEqual([])
  })

  describe('filterClassTypes', () => {
    it('returns empty array when query is empty or whitespace', async () => {
      vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValueOnce({
        KSampler: {},
        VAEDecode: {},
      } as never)

      const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

      await waitFor(() => {
        expect(result.current.classNames.length).toBe(2)
      })

      expect(result.current.filterClassTypes('')).toEqual([])
      expect(result.current.filterClassTypes('   ')).toEqual([])
    })

    it('prioritizes prefix matches over partial matches, case-insensitive', async () => {
      const mockData = {
        MySamplerNode: {},
        SamplerCustom: {},
        AdvancedSampler: {},
        OtherNode: {},
      }
      vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValueOnce(mockData as never)

      const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

      await waitFor(() => {
        expect(result.current.classNames.length).toBe(4)
      })

      const filtered = result.current.filterClassTypes('sampler')
      // Prefix match first: SamplerCustom
      // Partial matches next: AdvancedSampler, MySamplerNode (sorted alphabetically from source)
      expect(filtered).toEqual(['SamplerCustom', 'AdvancedSampler', 'MySamplerNode'])
    })

    it('filters out excluded class names', async () => {
      const mockData = {
        NodeA: {},
        NodeB: {},
        NodeC: {},
      }
      vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValueOnce(mockData as never)

      const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

      await waitFor(() => {
        expect(result.current.classNames.length).toBe(3)
      })

      const filtered = result.current.filterClassTypes('node', ['NodeB'])
      expect(filtered).toEqual(['NodeA', 'NodeC'])
    })

    it('limits output to 15 items when matches exceed 15', async () => {
      const mockData: Record<string, unknown> = {}
      for (let i = 1; i <= 25; i++) {
        const key = 'PrefixTestNode' + String(i).padStart(2, '0')
        mockData[key] = {}
      }
      vi.mocked(comfyApi.getObjectInfoAll).mockResolvedValueOnce(mockData as never)

      const { result } = renderHook(() => useComfyNodeTypes(), { wrapper })

      await waitFor(() => {
        expect(result.current.classNames.length).toBe(25)
      })

      const filtered = result.current.filterClassTypes('prefix')
      expect(filtered).toHaveLength(15)
      expect(filtered[0]).toBe('PrefixTestNode01')
      expect(filtered[14]).toBe('PrefixTestNode15')
    })
  })
})
