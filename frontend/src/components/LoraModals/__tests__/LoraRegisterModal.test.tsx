import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseModelsApi, lorasApi } from '../../../api/client'
import type { LoraFormState } from '../types'
import { LoraRegisterModal } from '../LoraRegisterModal'

const initialForm: LoraFormState = {
  model_name: 'demo',
  file_path: 'folder/demo.safetensors',
  description: '',
  trigger_word_sets: [],
  category_id: undefined,
  target_base_model_ids: [],
}

function renderModal(form = initialForm, isPending = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  const onCategoryCreated = vi.fn()
  const onUploadImage = vi.fn()
  function Harness() {
    const [state, setState] = useState(form)
    return <>
      <LoraRegisterModal form={state} setForm={setState} isPending={isPending} onClose={onClose} onSubmit={onSubmit}
        onCategoryCreated={onCategoryCreated} onUploadImage={onUploadImage} />
      <output data-testid="form-state">{JSON.stringify(state)}</output>
    </>
  }
  const view = render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
  return { ...view, onSubmit, onClose, onCategoryCreated, onUploadImage }
}

describe('LoraRegisterModal REQ-334', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(lorasApi, 'getComfyModels').mockResolvedValue([])
    vi.spyOn(baseModelsApi, 'list').mockResolvedValue([])
  })

  it('blocks registration and explains a reversed strength range', () => {
    const { onSubmit } = renderModal({ ...initialForm, recommended_strength_min: 0.9, recommended_strength_max: 0.8 })
    expect(screen.getByRole('alert')).toHaveTextContent('MinはMax以下にしてください')
    const save = screen.getByRole('button', { name: 'Register LoRA' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a valid range and normalizes a single value to min=max', async () => {
    const { onSubmit } = renderModal({ ...initialForm, recommended_strength_min: 0.75 })
    await waitFor(() => {
      const state = JSON.parse(screen.getByTestId('form-state').textContent || '{}')
      expect(state.recommended_strength_max).toBe(0.75)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Register LoRA' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('retains the crop callback and uses a mobile sheet with desktop form width', () => {
    const { onUploadImage } = renderModal({ ...initialForm, thumbnail_path: 'data:image/png;base64,preview' })
    fireEvent.click(screen.getByRole('button', { name: 'クロップ調整' }))
    expect(onUploadImage).toHaveBeenCalledWith('data:image/png;base64,preview')
    const sheet = screen.getByTestId('lora-register-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(sheet.className).toContain('max-h-[90dvh]')
    expect(sheet.className).toContain('md:max-w-[min(90vw,42.5rem)]')
    expect(sheet.className).toContain('lg:max-w-[42.5rem]')
    expect(screen.getByText('Register LoRA Model')).toBeInTheDocument()
  })

  it('preserves pending and close behavior', () => {
    const { onClose } = renderModal(initialForm, true)
    expect(document.getElementById('save-lora-btn')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close registration dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
