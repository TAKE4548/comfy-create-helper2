import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseModelsApi } from '../../../api/client'
import type { Lora } from '../../../api/types'
import { LoraDetailModal } from '../LoraDetailModal'

const lora: Lora = {
  id: 42,
  model_name: 'demo',
  description: 'original description',
  recommended_strength_min: 0.75,
  recommended_strength_max: 0.75,
  category_id: null,
  thumbnail_path: 'preview.jpg',
  file_path: 'folder/demo.safetensors',
  trigger_word_sets: [{ id: 7, name: 'Main', words: ['fox', 'blue'] }],
  snapshot_paths: ['sample.jpg'],
  target_base_model_ids: [],
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

function renderDetail(model = lora, isPending = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onCopy = vi.fn()
  const onCategoryCreated = vi.fn()
  const view = render(<QueryClientProvider client={queryClient}>
    <LoraDetailModal lora={model} copiedId={null} onCopy={onCopy} onClose={onClose} onSave={onSave}
      isPending={isPending} onCategoryCreated={onCategoryCreated} />
  </QueryClientProvider>)
  return { ...view, onSave, onClose, onCopy, onCategoryCreated }
}

describe('LoraDetailModal REQ-334', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(baseModelsApi, 'list').mockResolvedValue([])
  })

  it('rejects a reversed strength range with a reason and does not save', () => {
    const { onSave } = renderDetail({ ...lora, recommended_strength_min: 0.9, recommended_strength_max: 0.8 })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('MinはMax以下にしてください')
    const save = screen.getByRole('button', { name: 'Save Changes' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Edit LoRA Model' })).toBeInTheDocument()
  })

  it('saves a single recommendation as equal min and max values', () => {
    const { onSave } = renderDetail({ ...lora, recommended_strength_min: 0.8, recommended_strength_max: null })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onSave).toHaveBeenCalledWith(42, expect.objectContaining({
      recommended_strength_min: 0.8,
      recommended_strength_max: 0.8,
    }))
  })

  it('preserves editable metadata and the mobile sheet/desktop columns', () => {
    const { onSave } = renderDetail()
    const sheet = screen.getByTestId('lora-detail-sheet')
    expect(sheet.className).toContain('rounded-t-2xl')
    expect(screen.getByText('Preview & Cover Image')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText('基本情報')).toBeInTheDocument()
    expect(document.querySelector('.md\\:grid-cols-2')).toBeInTheDocument()
    fireEvent.change(document.getElementById('edit-lora-model-name')!, { target: { value: 'renamed' } })
    fireEvent.change(document.getElementById('edit-lora-file-path')!, { target: { value: 'sub/renamed.safetensors' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onSave).toHaveBeenCalledWith(42, expect.objectContaining({
      model_name: 'renamed',
      file_path: 'sub/renamed.safetensors',
      trigger_word_sets: [{ name: 'Main', words: 'fox, blue' }],
    }))
  })

  it('retains pending and close callbacks', () => {
    const { onClose } = renderDetail(lora, true)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close LoRA details' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
