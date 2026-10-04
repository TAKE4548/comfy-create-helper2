import { describe, beforeEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SnapshotTagAssociationsPanel } from '../SnapshotTagAssociationsPanel'
import { snapshotsApi } from '../../api/client'
import type { Snapshot } from '../../api/types'
import { ASSOCIATIONS_KEY } from '../../utils/generationRecord'
vi.mock('../../api/client', () => ({
  tagSetsApi: { list: vi.fn().mockResolvedValue([{ id: 7, name: 'Generic' }]) },
  lorasApi: { list: vi.fn().mockResolvedValue([{ id: 3, model_name: 'Model', trigger_word_sets: [{ id: 7, name: 'Trigger' }] }]) },
  snapshotsApi: { patch: vi.fn() },
}))
const snapshot: Snapshot = { id: 1, workflow_id: 1, image_path: '', created_at: '',
  params: { Quality: 'immutable', [ASSOCIATIONS_KEY]: JSON.stringify({ version: 1, lora_trigger_sets: [{ lora_id: 3, trigger_set_id: 7, role: 'Character' }] }) },
  loras: [{ id: 1, snapshot_id: 1, lora_id: 3, role: 'Quality', strength: 0.4 }],
  tag_sets: [{ id: 1, snapshot_id: 1, tag_set_id: 7, role: 'Quality' }] }
describe('SnapshotTagAssociationsPanel', () => {
  beforeEach(() => vi.clearAllMocks())
  const show = (props = {}) => render(<SnapshotTagAssociationsPanel snapshot={snapshot} onPersisted={vi.fn()} onEditingChange={vi.fn()} {...props} />)
  it('keeps same numeric IDs in separate source lists and only PATCHes associations', async () => {
    vi.mocked(snapshotsApi.patch).mockResolvedValueOnce(snapshot)
    show()
    await screen.findByText('Generic')
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'タグ関連を編集' }))
    fireEvent.click(screen.getByRole('button', { name: '汎用タグセット Generic を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(snapshotsApi.patch).toHaveBeenCalledWith(1, { tag_sets: [],
      lora_trigger_sets: [{ lora_id: 3, trigger_set_id: 7, role: 'Character' }] }))
  })
  it('retains failed draft and supports retry, then uses current props on cancel', async () => {
    vi.mocked(snapshotsApi.patch).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce(snapshot)
    const ui = show()
    await screen.findByText('Generic')
    fireEvent.click(screen.getByRole('button', { name: 'タグ関連を編集' }))
    fireEvent.click(screen.getByRole('button', { name: '汎用タグセット Generic を削除' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗')
    expect(screen.queryByRole('button', { name: '汎用タグセット Generic を削除' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(snapshotsApi.patch).toHaveBeenCalledTimes(2))
    await screen.findByRole('button', { name: 'タグ関連を編集' })
    fireEvent.click(screen.getByRole('button', { name: 'タグ関連を編集' }))
    ui.rerender(<SnapshotTagAssociationsPanel snapshot={{ ...snapshot, tag_sets: [] }} onPersisted={vi.fn()} onEditingChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByText('Generic')).not.toBeInTheDocument()
    expect(snapshotsApi.patch).toHaveBeenCalledTimes(2)
  })
  it('does not edit malformed trigger records', async () => {
    show({ snapshot: { ...snapshot, params: { [ASSOCIATIONS_KEY]: '{bad' } } })
    await screen.findByText('Generic')
    expect(screen.getByRole('alert')).toHaveTextContent('読み取れません')
    expect(screen.getByRole('button', { name: 'タグ関連を編集' })).toBeDisabled()
  })
  it('adds generic and trigger sets with explicit roles', async () => {
    vi.mocked(snapshotsApi.patch).mockResolvedValueOnce(snapshot)
    show({ snapshot: { ...snapshot, params: {}, tag_sets: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'タグ関連を編集' }))
    await screen.findByRole('option', { name: 'Generic' })
    fireEvent.change(screen.getByLabelText('汎用タグセットを選択'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('追加するrole'), { target: { value: 'Scene' } })
    fireEvent.click(screen.getByRole('button', { name: '汎用タグセットを追加' }))
    fireEvent.change(screen.getByLabelText('LoRAトリガーセットを選択'), { target: { value: '3:7' } })
    fireEvent.click(screen.getByRole('button', { name: 'LoRAトリガーセットを追加' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(snapshotsApi.patch).toHaveBeenCalledWith(1, {
      tag_sets: [{ tag_set_id: 7, role: 'Scene' }], lora_trigger_sets: [{ lora_id: 3, trigger_set_id: 7, role: 'Scene' }] }))
  })
})
