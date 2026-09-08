import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PresetConflictModal, PresetConflictData } from '../PresetConflictModal'

describe('PresetConflictModal', () => {
  const mockConflictData: PresetConflictData = {
    serverPreset: {
      id: 1,
      workflow_id: 10,
      name: 'Set 1',
      param_values: { prompt: 'masterpiece, 1girl, outdoors' },
      applied_assets: {},
      batch_size: 2,
      seed_mode: 'random',
      seed: 12345,
      sort_order: 1,
      created_at: '2026-09-08T10:00:00Z',
      updated_at: '2026-09-08T12:00:00Z',
    },
    localDraft: {
      name: 'Set 1',
      paramValues: { prompt: 'masterpiece, 1girl, indoors, bedroom' },
      appliedAssets: {},
      batchSize: 1,
      seedMode: 'fixed',
      seed: 99999,
    },
  }

  it('renders correctly when open with conflict data', () => {
    render(
      <PresetConflictModal
        isOpen={true}
        conflictData={mockConflictData}
        onClose={vi.fn()}
        onUseServer={vi.fn()}
        onOverwriteServer={vi.fn()}
        onSaveAsNew={vi.fn()}
      />
    )

    expect(screen.getByText('プリセットの競合を検知しました')).toBeInTheDocument()
    expect(screen.getByText('サーバー最新版（他端末での編集）')).toBeInTheDocument()
    expect(screen.getByText('この端末の編集（未保存ローカル）')).toBeInTheDocument()
    expect(screen.getByText('masterpiece, 1girl, outdoors')).toBeInTheDocument()
    expect(screen.getByText('masterpiece, 1girl, indoors, bedroom')).toBeInTheDocument()
  })

  it('switches tabs in mobile view', () => {
    render(
      <PresetConflictModal
        isOpen={true}
        conflictData={mockConflictData}
        onClose={vi.fn()}
        onUseServer={vi.fn()}
        onOverwriteServer={vi.fn()}
        onSaveAsNew={vi.fn()}
      />
    )

    const mobileServerTab = screen.getByRole('button', { name: /サーバー最新版（他端末）/ })
    const mobileLocalTab = screen.getByRole('button', { name: /この端末の編集（未保存）/ })

    expect(mobileServerTab).toBeInTheDocument()
    expect(mobileLocalTab).toBeInTheDocument()

    fireEvent.click(mobileLocalTab)
    expect(mobileLocalTab).toHaveClass('border-amber-500')

    fireEvent.click(mobileServerTab)
    expect(mobileServerTab).toHaveClass('border-indigo-500')
  })

  it('fires callbacks on clicking action buttons', () => {
    const onUseServer = vi.fn()
    const onOverwriteServer = vi.fn()
    const onSaveAsNew = vi.fn()

    render(
      <PresetConflictModal
        isOpen={true}
        conflictData={mockConflictData}
        onClose={vi.fn()}
        onUseServer={onUseServer}
        onOverwriteServer={onOverwriteServer}
        onSaveAsNew={onSaveAsNew}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /サーバー最新版を採用/ }))
    expect(onUseServer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /この端末の編集で上書き/ }))
    expect(onOverwriteServer).toHaveBeenCalledTimes(1)

    // Save as new opens naming prompt
    fireEvent.click(screen.getByRole('button', { name: /別名で両方保存/ }))
    expect(screen.getByText('新規保存名:')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '別名で保存' }))
    expect(onSaveAsNew).toHaveBeenCalledWith('Set 1 (別端末の編集)')
  })
})
