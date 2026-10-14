import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { Album } from '../../../../api/types'
import { albumsApi } from '../../../../api/client'
import { useAlbumOperations } from '../useAlbumOperations'

vi.mock('../../../../api/client', () => ({
  albumsApi: {
    list: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    update: vi.fn(),
    updateOrder: vi.fn(),
    deleteItems: vi.fn(),
    addItems: vi.fn(),
    create: vi.fn(),
  },
}))

describe('useAlbumOperations REQ-334 date ordering', () => {
  it('uses ascending sequence order for equal and invalid dates in either date direction', async () => {
    const items = [
      { snapshot_id: 30, sequence_order: 1, created_at: '2026-02-01T00:00:00Z' },
      { snapshot_id: 20, sequence_order: 0, created_at: '2026-02-01T00:00:00Z' },
      { snapshot_id: 40, sequence_order: 2, created_at: 'not-a-date' },
      { snapshot_id: 10, sequence_order: 9, created_at: '2026-01-01T00:00:00Z' },
      { snapshot_id: 50, sequence_order: 3, created_at: undefined },
    ]
    const album = { id: 7, name: 'Order', items } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([album])
    vi.mocked(albumsApi.get).mockResolvedValue(album)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAlbumOperations({ initialSelectedAlbumId: 7 }), { wrapper })

    await waitFor(() => expect(result.current.currentAlbum).toBeDefined())
    act(() => result.current.setAlbumSortCriterion('date'))
    expect(result.current.sortedAlbumItems.map((item) => item.snapshot_id)).toEqual([40, 50, 10, 20, 30])

    act(() => result.current.setAlbumSortDirection('desc'))
    expect(result.current.sortedAlbumItems.map((item) => item.snapshot_id)).toEqual([20, 30, 10, 40, 50])
  })

  it('keeps manual custom sort direction behavior unchanged', async () => {
    const album = {
      id: 8,
      name: 'Manual',
      items: [
        { snapshot_id: 3, sequence_order: 2, created_at: '2026-01-01' },
        { snapshot_id: 1, sequence_order: 0, created_at: '2026-03-01' },
        { snapshot_id: 2, sequence_order: 1, created_at: '2026-02-01' },
      ],
    } as unknown as Album
    vi.mocked(albumsApi.list).mockResolvedValue([album])
    vi.mocked(albumsApi.get).mockResolvedValue(album)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAlbumOperations({ initialSelectedAlbumId: 8 }), { wrapper })

    await waitFor(() => expect(result.current.currentAlbum).toBeDefined())
    expect(result.current.sortedAlbumItems.map((item) => item.snapshot_id)).toEqual([1, 2, 3])
    act(() => result.current.setAlbumSortDirection('desc'))
    expect(result.current.sortedAlbumItems.map((item) => item.snapshot_id)).toEqual([3, 2, 1])
  })
})
