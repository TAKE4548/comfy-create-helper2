import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Lora } from '../../../api/types'
import type { LoraFormState } from '../types'
import { LoraDetailModal } from '../LoraDetailModal'

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }))
vi.mock('../../../hooks/useThumbnailAspectRatio', () => ({
  useThumbnailAspectRatio: () => ({ aspectRatioStyle: { aspectRatio: '1/1' }, numericRatio: 1 }),
}))
vi.mock('../../TagChipViewer', () => ({ TagChipViewer: () => null }))
vi.mock('../LoraFormFields', () => ({
  LoraFormFields: ({ form, setForm }: { form: LoraFormState; setForm: React.Dispatch<React.SetStateAction<LoraFormState>> }) => (
    <div>
      <output data-testid="manual-example-paths">{JSON.stringify(form.example_paths ?? [])}</output>
      <button type="button" onClick={() => setForm((current) => ({ ...current, example_paths: [...(current.example_paths ?? []), '/manual/new.png'] }))}>Add manual example</button>
      <button type="button" onClick={() => setForm((current) => ({ ...current, model_name: 'Updated metadata' }))}>Edit metadata</button>
    </div>
  ),
}))
vi.mock('../../ImageCropper', () => ({ ImageCropper: () => null }))

const lora: Lora = {
  id: 24,
  model_name: 'Sample LoRA',
  description: null,
  recommended_strength_min: null,
  recommended_strength_max: null,
  category_id: null,
  thumbnail_path: '/cover.png',
  file_path: '/models/sample.safetensors',
  trigger_word_sets: [],
  snapshot_paths: ['/generated/one.png', '/generated/two.png'],
  example_paths: ['/manual/one.png', '/manual/two.png'],
  target_base_model_ids: [],
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

const renderModal = (onSave = vi.fn(), onClose = vi.fn()) => render(
  <LoraDetailModal
    lora={lora}
    copiedId={null}
    onCopy={vi.fn()}
    onClose={onClose}
    onSave={onSave}
    isPending={false}
    onCategoryCreated={vi.fn()}
  />,
)

describe('LoraDetailModal manual examples', () => {
  beforeEach(() => vi.clearAllMocks())

  it('preserves manual paths on metadata-only edit and keeps generated snapshots out of the save payload', () => {
    const onSave = vi.fn()
    renderModal(onSave)

    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', '/cover.png')
    expect(screen.getByRole('img', { name: 'thumbnail-1' })).toHaveAttribute('src', '/generated/one.png')
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByTestId('manual-example-paths')).toHaveTextContent(JSON.stringify(lora.example_paths))
    fireEvent.click(screen.getByRole('button', { name: 'Edit metadata' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][1]
    expect(saved.model_name).toBe('Updated metadata')
    expect(saved.example_paths).toEqual(lora.example_paths)
    expect(saved.example_paths).not.toContain('/generated/one.png')
  })

  it('forwards edited manual example paths through the save form', () => {
    const onSave = vi.fn()
    renderModal(onSave)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add manual example' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave.mock.calls[0][1].example_paths).toEqual([...lora.example_paths!, '/manual/new.png'])
  })

  it('does not save when editing is cancelled', () => {
    const onSave = vi.fn()
    renderModal(onSave)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add manual example' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0])

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
  })
})
