import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useBulkDownload } from '../useBulkDownload'
import type { SnapshotSummary, Album } from '../../../../api/types'

describe('useBulkDownload', () => {
  const mockSnapshots: SnapshotSummary[] = [
    {
      id: 1,
      workflow_id: 1,
      image_path: 'http://localhost:8188/view/snap1.png',
      created_at: '2026-08-30T00:00:00Z',
    },
    {
      id: 2,
      workflow_id: 1,
      image_path: 'http://localhost:8188/view/snap2.png',
      created_at: '2026-08-30T00:00:00Z',
    },
  ]

  const mockAlbum: Album = {
    id: 10,
    name: 'Test Album',
    items: [
      {
        snapshot_id: 1,
        sequence_order: 0,
        image_path: 'http://localhost:8188/view/snap1.png',
        created_at: '2026-08-30T00:00:00Z',
      },
      {
        snapshot_id: 2,
        sequence_order: 1,
        image_path: 'http://localhost:8188/view/snap2.png',
        created_at: '2026-08-30T00:00:00Z',
      },
    ],
    created_at: '2026-08-30T00:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['fake image data'], { type: 'image/png' })),
    }) as any
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()
    window.alert = vi.fn()
  })

  it('downloads snapshots as a ZIP file and updates progress', async () => {
    const { result } = renderHook(() =>
      useBulkDownload({
        snapshots: mockSnapshots,
      })
    )

    expect(result.current.isDownloading).toBe(false)
    expect(result.current.progress).toBeNull()

    let success = false
    await act(async () => {
      success = await result.current.handleBulkDownload([1, 2], 'snapshots.zip', false)
    })

    expect(success).toBe(true)
    expect(result.current.isDownloading).toBe(false)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('handles album download with 3-digit prefix indexing', async () => {
    const { result } = renderHook(() =>
      useBulkDownload({
        currentAlbum: mockAlbum,
        sortedAlbumItems: [
          { snapshot_id: 2, image_path: mockAlbum.items[1].image_path },
          { snapshot_id: 1, image_path: mockAlbum.items[0].image_path },
        ],
      })
    )

    let success = false
    await act(async () => {
      success = await result.current.handleBulkDownload([1, 2], 'album.zip', true)
    })

    expect(success).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('handles empty snapshotIds without error', async () => {
    const { result } = renderHook(() => useBulkDownload({ snapshots: mockSnapshots }))

    let success = false
    await act(async () => {
      success = await result.current.handleBulkDownload([], 'empty.zip', false)
    })

    expect(success).toBe(false)
    expect(result.current.isDownloading).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('allows retrying last download', async () => {
    const { result } = renderHook(() => useBulkDownload({ snapshots: mockSnapshots }))

    await act(async () => {
      await result.current.handleBulkDownload([1], 'first.zip', false)
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.retryLastDownload()
    })

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('handles abort and cancels download gracefully', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('Download aborted')
        error.name = 'AbortError'
        setTimeout(() => reject(error), 50)
      })
    }) as any

    const { result } = renderHook(() => useBulkDownload({ snapshots: mockSnapshots }))

    let downloadPromise: Promise<boolean>
    act(() => {
      downloadPromise = result.current.handleBulkDownload([1, 2], 'test.zip', false)
    })

    act(() => {
      result.current.cancelDownload()
    })

    let success = true
    await act(async () => {
      success = await downloadPromise
    })

    expect(success).toBe(false)
    expect(result.current.isDownloading).toBe(false)
  })
})
