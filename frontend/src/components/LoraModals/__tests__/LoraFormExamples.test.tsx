import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoraFormState } from '../types'
import { LoraFormFields } from '../LoraFormFields'

vi.mock('../../ImageCropper', () => ({
  ImageCropper: ({ aspectRatio, onCropComplete, onCancel }: { aspectRatio?: number; onCropComplete: (blob: Blob) => void; onCancel: () => void }) => (
    <div role="dialog" aria-label="Crop LoRA example image">
      <output data-testid="crop-aspect">{aspectRatio}</output>
      <button type="button" onClick={() => onCropComplete(new Blob(['cropped'], { type: 'image/png' }))}>Upload cropped example</button>
      <button type="button" onClick={onCancel}>Cancel crop</button>
    </div>
  ),
}))
vi.mock('../../common/CategorySelect', () => ({ CategorySelect: () => null }))
vi.mock('../../common/BaseModelSelect', () => ({ BaseModelSelect: () => null }))
vi.mock('../../TagChipEditor', () => ({ default: () => null }))
vi.mock('../../../api/client', () => ({ lorasApi: { getComfyModels: vi.fn().mockResolvedValue([]) }, loraCategoriesApi: { list: vi.fn().mockResolvedValue([]) } }))

afterEach(() => vi.unstubAllGlobals())

const initialForm: LoraFormState = {
  model_name: 'example-lora', trigger_word_sets: [], example_paths: ['/uploads/existing.png'],
}

function Harness({ onUploadImage = vi.fn() }: { onUploadImage?: (src: string) => void }) {
  const [form, setForm] = useState<LoraFormState>(initialForm)
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LoraFormFields form={form} setForm={setForm} idPrefix="test-lora" onCategoryCreated={vi.fn()} onUploadImage={onUploadImage} />
  </QueryClientProvider>
}

function chooseImage(file: File) {
  fireEvent.change(screen.getByLabelText('LoRA example image file'), { target: { files: [file] } })
}

describe('LoraFormFields manual example upload', () => {
  it('offers crop ratios, uploads the cropped blob, adds its local path, and supports removal without using cover upload', async () => {
    const onUploadImage = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ image_path: '/uploads/cropped-example.png' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<Harness onUploadImage={onUploadImage} />)

    chooseImage(new File(['image'], 'example.png', { type: 'image/png' }))
    await screen.findByRole('dialog', { name: 'Crop LoRA example image' })
    fireEvent.click(screen.getByRole('button', { name: '2:3' }))
    expect(screen.getByTestId('crop-aspect')).toHaveTextContent('0.6666666666666666')
    fireEvent.click(screen.getByRole('button', { name: 'Upload cropped example' }))

    await waitFor(() => expect(screen.getByRole('img', { name: 'LoRA example 2' })).toHaveAttribute('src', '/uploads/cropped-example.png'))
    expect(fetchMock).toHaveBeenCalledWith('/api/snapshots/upload', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }))
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData)
    expect(onUploadImage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove LoRA example 2' }))
    expect(screen.queryByRole('img', { name: 'LoRA example 2' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'LoRA example 1' })).toHaveAttribute('src', '/uploads/existing.png')
  })

  it('keeps existing draft examples and reports the upload failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: 'Upload service unavailable' }) }))
    render(<Harness />)

    chooseImage(new File(['image'], 'example.png', { type: 'image/png' }))
    await screen.findByRole('dialog', { name: 'Crop LoRA example image' })
    fireEvent.click(screen.getByRole('button', { name: 'Upload cropped example' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload service unavailable')
    expect(screen.getByRole('img', { name: 'LoRA example 1' })).toHaveAttribute('src', '/uploads/existing.png')
  })
})
