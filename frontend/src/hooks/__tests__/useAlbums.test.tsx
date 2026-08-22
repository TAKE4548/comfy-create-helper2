import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAlbums } from '../useAlbums'
import { albumsApi } from '../../api/client'
import type { AlbumSummary } from '../../api/types'

vi.mock('../../api/client', () => ({
  albumsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
}))

describe('useAlbums', () => {
  let queryClient: QueryClient

  const mockAlbums: AlbumSummary[] = [
    {
      id: 1,
      name: 'Landscape Photos',
      created_at: '2026-08-01T00:00:00Z',
      item_count: 5,
      cover_image_path: null,
      cover_thumbnail_path: null,
    },
    {
      id: 2,
      name: 'Character Art',
      created_at: '2026-08-02T00:00:00Z',
      item_count: 12,
      cover_image_path: null,
      cover_thumbnail_path: null,
    },
  ]

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

  it('fetches albums and builds albumMap for instant name lookup', async () => {
    vi.mocked(albumsApi.list).mockResolvedValue(mockAlbums)

    const { result } = renderHook(() => useAlbums(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.albums).toHaveLength(2)
    expect(result.current.getAlbumName(1)).toBe('Landscape Photos')
    expect(result.current.getAlbumName(2)).toBe('Character Art')
    expect(result.current.getAlbumName(999)).toBeNull()
    expect(result.current.getAlbumName(null)).toBeNull()
  })

  it('respects enabled flag', async () => {
    const { result } = renderHook(() => useAlbums(false), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(albumsApi.list).not.toHaveBeenCalled()
  })
})
