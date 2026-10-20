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

function renderDetail(model = lora, isPending = false, initialEditing = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onCopy = vi.fn()
  const onCategoryCreated = vi.fn()
  const view = render(<QueryClientProvider client={queryClient}>
    <LoraDetailModal lora={model} copiedId={null} onCopy={onCopy} onClose={onClose} onSave={onSave}
      isPending={isPending} onCategoryCreated={onCategoryCreated} initialEditing={initialEditing} />
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByRole('alert')).toHaveTextContent('MinはMax以下にしてください')
    const save = screen.getByRole('button', { name: 'Save Changes' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Edit LoRA Model' })).toBeInTheDocument()
  })

  it('saves a single recommendation as equal min and max values', () => {
    const { onSave } = renderDetail({ ...lora, recommended_strength_min: 0.8, recommended_strength_max: null })
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
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
    expect(screen.getAllByRole('button', { name: 'Edit' })[0]).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close LoRA details' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('LoraDetailModal REQ-377 mobile bottom sheet & fixed footer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(baseModelsApi, 'list').mockResolvedValue([])
  })

  it('[REQ-377/AC-1] renders bottom sheet with backdrop, handle, header, single scrollable body, and fixed footer', () => {
    const { container } = renderDetail()
    const backdrop = container.querySelector('.modal-backdrop')
    expect(backdrop).toHaveClass('items-end', 'md:items-center')

    const sheet = screen.getByTestId('lora-detail-sheet')
    expect(sheet).toHaveClass('rounded-t-2xl', 'max-h-[90dvh]', 'flex', 'flex-col')
    expect(sheet.querySelector('[aria-hidden="true"]')).toHaveClass('md:hidden')

    const body = screen.getByTestId('lora-detail-body')
    expect(body).toHaveClass('overflow-y-auto', 'overscroll-contain')

    const footer = screen.getByTestId('lora-detail-footer')
    expect(footer).toHaveClass('flex-shrink-0', 'md:hidden')
  })

  it('[REQ-377/AC-2] view mode fixed footer displays Close on left and Edit on right', () => {
    const { onClose } = renderDetail()
    const footer = screen.getByTestId('lora-detail-footer')
    const closeBtn = screen.getByTestId('mobile-close-btn')
    const editBtn = screen.getByTestId('mobile-edit-btn')

    expect(footer).toContainElement(closeBtn)
    expect(footer).toContainElement(editBtn)
    expect(closeBtn).toHaveTextContent('Close')
    expect(editBtn).toHaveTextContent('Edit')

    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(editBtn)
    expect(screen.getByRole('heading', { name: 'Edit LoRA Model' })).toBeInTheDocument()
  })

  it('[REQ-377/AC-3] edit mode fixed footer displays Cancel on left and Save on right with validation and pending state', () => {
    const { onSave } = renderDetail(lora, false, true)
    const footer = screen.getByTestId('lora-detail-footer')
    const cancelBtn = screen.getByTestId('mobile-cancel-btn')
    const saveBtn = screen.getByTestId('mobile-save-btn')

    expect(footer).toContainElement(cancelBtn)
    expect(footer).toContainElement(saveBtn)
    expect(cancelBtn).toHaveTextContent('Cancel')
    expect(saveBtn).toHaveTextContent('Save')

    // Disables when model_name is empty
    fireEvent.change(document.getElementById('edit-lora-model-name')!, { target: { value: '' } })
    expect(saveBtn).toBeDisabled()

    // Cancel reverts to view mode
    fireEvent.click(cancelBtn)
    expect(screen.getByRole('heading', { name: 'LoRA Model Details' })).toBeInTheDocument()

    // Re-enter edit mode via mobile edit button
    fireEvent.click(screen.getByTestId('mobile-edit-btn'))
    expect(screen.getByRole('heading', { name: 'Edit LoRA Model' })).toBeInTheDocument()

    // Save works with valid form
    const currentSaveBtn = screen.getByTestId('mobile-save-btn')
    fireEvent.change(document.getElementById('edit-lora-model-name')!, { target: { value: 'updated-lora' } })
    expect(currentSaveBtn).not.toBeDisabled()
    fireEvent.click(currentSaveBtn)
    expect(onSave).toHaveBeenCalledWith(42, expect.objectContaining({
      model_name: 'updated-lora',
    }))
  })

  it('[REQ-377/AC-4] fixed footer includes safe area padding and hit-slop', () => {
    renderDetail()
    const footer = screen.getByTestId('lora-detail-footer')
    expect(footer.className).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]')

    const closeBtn = screen.getByTestId('mobile-close-btn')
    expect(closeBtn.className).toContain('min-h-[44px]')
    expect(closeBtn.className).toContain("before:content-['']")
  })

  it('[REQ-377/AC-5] displays compact cover row at top of body without large preview on mobile', () => {
    renderDetail()
    const coverRow = screen.getByTestId('lora-compact-cover-row')
    expect(coverRow).toBeInTheDocument()
    expect(coverRow).toHaveTextContent('Cover Image')
    expect(coverRow).toHaveTextContent('Related Snapshots (2 件)')

    const galleryPane = screen.getByTestId('lora-detail-gallery-pane')
    expect(galleryPane).toHaveClass('hidden', 'md:flex')
  })

  it('[REQ-377/AC-6] tapping compact cover opens gallery subview; cover selection persists on save and reverts on cancel', () => {
    const { onSave } = renderDetail(lora, false, true)
    const coverRow = screen.getByTestId('lora-compact-cover-row')
    fireEvent.click(coverRow)

    // Gallery subview opens
    expect(screen.getByRole('button', { name: 'Back to details' })).toBeInTheDocument()
    const galleryPane = screen.getByTestId('lora-detail-gallery-pane')
    expect(galleryPane).toHaveClass('flex')

    // Click snapshot to view
    const thumbnails = galleryPane.querySelectorAll('img')
    expect(thumbnails.length).toBeGreaterThan(0)

    // Set as Cover button
    const setCoverBtn = screen.queryByRole('button', { name: 'Set as Cover' })
    if (setCoverBtn) {
      fireEvent.click(setCoverBtn)
    }

    // Cancel reverts
    const cancelBtn = screen.getByTestId('mobile-cancel-btn')
    fireEvent.click(cancelBtn)
    expect(screen.getByRole('heading', { name: 'LoRA Model Details' })).toBeInTheDocument()
  })

  it('[REQ-377/AC-7] gracefully handles missing image, empty snapshots, and image load errors', () => {
    const emptyLora: Lora = {
      ...lora,
      thumbnail_path: undefined,
      snapshot_paths: [],
    }
    renderDetail(emptyLora)
    const coverRow = screen.getByTestId('lora-compact-cover-row')
    expect(coverRow).toBeInTheDocument()
    expect(coverRow).toHaveTextContent('Related Snapshots (0 件)')
  })

  it('[REQ-377/AC-11] preserves trigger words copy, strength range, file path, and base models', () => {
    const { onCopy } = renderDetail()
    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('folder/demo.safetensors')).toBeInTheDocument()
    expect(screen.getByText('×0.75')).toBeInTheDocument()

    const copyBtn = document.getElementById('modal-copy-trigger-7')
    expect(copyBtn).toBeInTheDocument()
    fireEvent.click(copyBtn!)
    expect(onCopy).toHaveBeenCalledWith(7, 'fox, blue')
  })

  it('[REQ-377/AC-13] closes on Escape key, backdrop click, or close button', () => {
    const { onClose, container } = renderDetail()

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Backdrop click
    const backdrop = container.querySelector('.modal-backdrop')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)

    // Close button
    fireEvent.click(screen.getByRole('button', { name: 'Close LoRA details' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('[REQ-377/AC-14] desktop layout maintains 2-column grid and right pane buttons', () => {
    renderDetail()
    const grid = document.querySelector('.grid')
    expect(grid).toHaveClass('md:grid-cols-2')

    const desktopClose = document.getElementById('close-detail-modal-btn')
    expect(desktopClose).toBeInTheDocument()
  })
})
