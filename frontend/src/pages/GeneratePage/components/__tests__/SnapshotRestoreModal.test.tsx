import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SnapshotRestoreModal } from '../SnapshotRestoreModal'
import { snapshotsApi } from '../../../../api/domains/snapshots'
import type { Snapshot } from '../../../../api/types'
import type { SnapshotSummaryWithParams } from '../../hooks/useGenerateDisplayState'

vi.mock('../../../../api/domains/snapshots', () => ({
  snapshotsApi: {
    get: vi.fn(),
  },
}))

const mockSnapshots: SnapshotSummaryWithParams[] = [
  {
    id: 101,
    workflow_id: 1,
    image_path: '/api/comfy/view?filename=snap101.png&type=output',
    thumbnail_path: '/api/comfy/view?filename=snap101_thumb.png&type=output',
    created_at: '2026-11-15T10:00:00Z',
    params: {
      positive_prompt: '1girl, blue sky, smile, detailed eyes',
      steps: 20,
      cfg: 7,
      seed: 12345,
    },
  },
  {
    id: 102,
    workflow_id: 1,
    image_path: '/api/comfy/view?filename=snap102.png&type=output',
    thumbnail_path: null,
    created_at: '2026-11-15T11:30:00Z',
    params: {
      positive_prompt: 'sunset beach, dramatic lighting, masterpiece',
      steps: 30,
      cfg: 6.5,
      sampler_name: 'euler_ancestral',
      seed: 99999,
    },
  },
]

const mockDetail101: Snapshot = {
  id: 101,
  workflow_id: 1,
  image_path: '/api/comfy/view?filename=snap101.png&type=output',
  thumbnail_path: '/api/comfy/view?filename=snap101_thumb.png&type=output',
  created_at: '2026-11-15T10:00:00Z',
  params: {
    positive_prompt: '1girl, blue sky, smile, detailed eyes',
    negative_prompt: 'lowres, bad anatomy',
    steps: 20,
    cfg: 7,
    seed: 12345,
  },
  loras: [
    { id: 1, snapshot_id: 101, lora_id: 10, strength: 0.8, role: 'base' },
  ],
  tag_sets: [
    { id: 1, snapshot_id: 101, tag_set_id: 20, role: 'positive' },
    { id: 2, snapshot_id: 101, tag_set_id: 21, role: 'positive' },
  ],
}

const mockDetail102: Snapshot = {
  id: 102,
  workflow_id: 1,
  image_path: '/api/comfy/view?filename=snap102.png&type=output',
  thumbnail_path: null,
  created_at: '2026-11-15T11:30:00Z',
  params: {
    positive_prompt: 'sunset beach, dramatic lighting, masterpiece',
    steps: 30,
    cfg: 6.5,
    sampler_name: 'euler_ancestral',
    seed: 99999,
  },
  loras: [],
  tag_sets: [],
}

describe('SnapshotRestoreModal', () => {
  const mockOnClose = vi.fn()
  const mockOnRestore = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(snapshotsApi.get).mockImplementation(async (id: number) => {
      if (id === 101) return mockDetail101
      if (id === 102) return mockDetail102
      throw new Error('Not found')
    })
    mockOnRestore.mockResolvedValue(true)
  })

  it('[REQ-265/AC-3] サムネイルグリッドと選択中スナップショットの簡易プレビューを表示する', async () => {
    render(
      <SnapshotRestoreModal
        isOpen
        onClose={mockOnClose}
        snapshots={mockSnapshots}
        initialSnapshotId={101}
        onRestore={mockOnRestore}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'スナップショットから復元' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('md:max-w-4xl', 'lg:max-w-5xl', 'md:max-h-[85dvh]', 'overflow-hidden')

    const cards = screen.getAllByRole('button', { pressed: true })
    expect(cards).toHaveLength(1)

    await waitFor(() => {
      expect(snapshotsApi.get).toHaveBeenCalledWith(101)
    })

    // Preview shows prompt, params excerpt, LoRA/TagSet counts
    expect(screen.getByText('1girl, blue sky, smile, detailed eyes')).toBeInTheDocument()
    expect(screen.getByText(/LoRA:\s*1件/)).toBeInTheDocument()
    expect(screen.getByText(/TagSet:\s*2件/)).toBeInTheDocument()
    expect(screen.getByText(/12345/)).toBeInTheDocument()

    // Selecting another card updates preview
    const secondCard = screen.getByRole('button', { pressed: false })
    fireEvent.click(secondCard)

    await waitFor(() => {
      expect(snapshotsApi.get).toHaveBeenCalledWith(102)
      expect(screen.getByText('sunset beach, dramatic lighting, masterpiece')).toBeInTheDocument()
    })
    expect(secondCard).toHaveAttribute('aria-pressed', 'true')
  })

  it('[REQ-265/AC-1] サムネイル選択や詳細取得のみでは onRestore を呼ばず、詳細取得失敗時は role="alert" を表示する', async () => {
    vi.mocked(snapshotsApi.get).mockRejectedValueOnce(new Error('Network error'))

    render(
      <SnapshotRestoreModal
        isOpen
        onClose={mockOnClose}
        snapshots={mockSnapshots}
        initialSnapshotId={101}
        onRestore={mockOnRestore}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(mockOnRestore).not.toHaveBeenCalled()
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('[REQ-265/AC-4] 「アクティブプリセットに復元」押下時のみ onRestore(selectedId) を呼び、成功(true)時のみ onClose する。復元中は disabled かつ連打抑止する', async () => {
    let resolveRestore!: (value: boolean) => void
    mockOnRestore.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRestore = resolve
        })
    )

    render(
      <SnapshotRestoreModal
        isOpen
        onClose={mockOnClose}
        snapshots={mockSnapshots}
        initialSnapshotId={102}
        onRestore={mockOnRestore}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.get).toHaveBeenCalledWith(102)
    })

    const restoreBtn = screen.getByRole('button', { name: 'アクティブプリセットに復元' })
    expect(restoreBtn).toHaveClass('min-h-11', 'touch-manipulation')

    // Rapid double click
    fireEvent.click(restoreBtn)
    fireEvent.click(restoreBtn)

    expect(mockOnRestore).toHaveBeenCalledTimes(1)
    expect(mockOnRestore).toHaveBeenCalledWith(102)
    expect(restoreBtn).toBeDisabled()
    expect(mockOnClose).not.toHaveBeenCalled()

    resolveRestore(true)
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  it('[REQ-265/AC-5] 復元失敗(false)時はモーダルを閉じずにエラーを表示する', async () => {
    mockOnRestore.mockResolvedValueOnce(false)

    render(
      <SnapshotRestoreModal
        isOpen
        onClose={mockOnClose}
        snapshots={mockSnapshots}
        initialSnapshotId={101}
        onRestore={mockOnRestore}
      />
    )

    const restoreBtn = screen.getByRole('button', { name: 'アクティブプリセットに復元' })
    fireEvent.click(restoreBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(mockOnClose).not.toHaveBeenCalled()
    expect(restoreBtn).not.toBeDisabled()
  })

  it('[REQ-265/AC-5] キャンセル・閉じる・Escape・バックドロップ押下で onRestore を呼ばず onClose する', async () => {
    render(
      <SnapshotRestoreModal
        isOpen
        onClose={mockOnClose}
        snapshots={mockSnapshots}
        initialSnapshotId={101}
        onRestore={mockOnRestore}
      />
    )

    await waitFor(() => {
      expect(snapshotsApi.get).toHaveBeenCalledWith(101)
    })

    const cancelBtn = screen.getByRole('button', { name: 'キャンセル' })
    expect(cancelBtn).toHaveClass('min-h-11', 'touch-manipulation')
    fireEvent.click(cancelBtn)
    expect(mockOnClose).toHaveBeenCalledTimes(1)

    const closeBtn = screen.getByRole('button', { name: '閉じる' })
    expect(closeBtn).toHaveClass('min-h-11', 'touch-manipulation')
    fireEvent.click(closeBtn)
    expect(mockOnClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalledTimes(3)

    const dialog = screen.getByRole('dialog', { name: 'スナップショットから復元' })
    fireEvent.click(dialog.parentElement!)
    expect(mockOnClose).toHaveBeenCalledTimes(4)

    expect(mockOnRestore).not.toHaveBeenCalled()
  })
})