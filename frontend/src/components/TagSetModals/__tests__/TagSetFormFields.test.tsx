import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { parseTagSetTokens, TagSetFormFields } from '../TagSetFormFields'

vi.mock('../../TagChipEditor', () => ({
  TagChipEditor: ({ id, value, onChange }: { id?: string; value?: string; onChange?: (value: string) => void }) => (
    <textarea data-testid={id || 'subset-tags'} value={value || ''} onChange={(event) => onChange?.(event.target.value)}
      onPaste={() => window.dispatchEvent(new Event('tag-chip-child-paste'))} />
  ),
}))
vi.mock('../../common/CategorySelect', () => ({ CategorySelect: () => null }))
vi.mock('../../common/BaseModelSelect', () => ({ BaseModelSelect: () => null }))
vi.mock('../../ImageCropper', () => ({
  ImageCropper: ({ imageSrc, onCropComplete, onCancel }: {
    imageSrc: string
    onCropComplete: (blob: Blob) => void
    onCancel: () => void
  }) => (
    <div data-testid="image-cropper" data-image-src={imageSrc}>
      <button type="button" onClick={() => onCropComplete(new Blob(['cropped']))}>Complete crop</button>
      <button type="button" onClick={onCancel}>Cancel crop</button>
    </div>
  ),
}))

const initialForm = {
  name: 'test', description: '', tags: 'existing', category_id: undefined,
  subsets: [
    { name: 'day', tags: 'subset old', thumbnail_path: 'day-old.png' },
    { name: 'night', tags: 'moon', thumbnail_path: 'night-old.png' },
  ],
}

function FormHarness() {
  const [form, setForm] = useState(initialForm)
  return <>
    <output data-testid="form-state">{JSON.stringify(form)}</output>
    <button type="button" data-testid="reorder-subsets" onClick={() => setForm((current) => ({
      ...current,
      subsets: [...(current.subsets || [])].reverse(),
    }))}>Reorder subsets</button>
    <TagSetFormFields form={form} setForm={setForm} idPrefix="tag-set" onCategoryCreated={() => {}} />
  </>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TagSetFormFields tag paste parser', () => {
  it('splits only at top level, normalizes underscores, removes empty and exact duplicates', () => {
    expect(parseTagSetTokens('1girl, silver_hair\n1girl\n(red hair, long hair:1.2), [blue_eyes, green_eyes], RED\nred,, ')).toEqual([
      '1girl', 'silver hair', '(red hair, long hair:1.2)', '[blue eyes, green eyes]', 'RED', 'red',
    ])
  })

  it('keeps the Add Subset action label accessible while showing its decorative plus icon', () => {
    render(<FormHarness />)
    const addSubsetButton = screen.getByRole('button', { name: 'Add Subset' })

    expect(addSubsetButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(addSubsetButton)
    expect(JSON.parse(screen.getByTestId('form-state').textContent!).subsets).toHaveLength(3)
  })

  it('captures main and subset paste once, while ordinary draft typing stays raw', () => {
    const childPaste = vi.fn()
    window.addEventListener('tag-chip-child-paste', childPaste)
    render(<FormHarness />)
    const main = screen.getByTestId('tag-set-tags') as HTMLTextAreaElement
    fireEvent.change(main, { target: { value: 'typing_draft, (open' } })
    expect(JSON.parse(screen.getByTestId('form-state').textContent!).tags).toBe('typing_draft, (open')

    fireEvent.paste(main, { clipboardData: { getData: () => 'existing, silver_hair\n1girl, 1girl' } })
    expect(JSON.parse(screen.getByTestId('form-state').textContent!).tags).toBe('typing_draft, (open, existing, silver hair, 1girl')
    expect(childPaste).not.toHaveBeenCalled()

    const subset = screen.getAllByTestId('subset-tags')[0] as HTMLTextAreaElement
    fireEvent.paste(subset, { clipboardData: { getData: () => '(red hair, long hair:1.2), blue_eyes' } })
    expect(JSON.parse(screen.getByTestId('form-state').textContent!).subsets[0].tags).toBe('subset old, (red hair, long hair:1.2), blue eyes')
    expect(childPaste).not.toHaveBeenCalled()
    window.removeEventListener('tag-chip-child-paste', childPaste)
  })

  it('shows both subset previews and cancel or upload failure keeps the selected old image', async () => {
    render(<FormHarness />)
    expect(screen.getByAltText('day preview')).toHaveAttribute('src', 'day-old.png')
    expect(screen.getByAltText('night preview')).toHaveAttribute('src', 'night-old.png')

    fireEvent.click(screen.getByRole('button', { name: 'day の画像をクロップ調整' }))
    expect(screen.getByTestId('image-cropper')).toHaveAttribute('data-image-src', 'day-old.png')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel crop' }))
    expect(screen.queryByTestId('image-cropper')).not.toBeInTheDocument()
    expect(screen.getByAltText('day preview')).toHaveAttribute('src', 'day-old.png')

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    fireEvent.click(screen.getByRole('button', { name: 'night の画像をクロップ調整' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete crop' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('画像のアップロードに失敗しました')
    expect(screen.getByAltText('night preview')).toHaveAttribute('src', 'night-old.png')
  })

  it('assigns a delayed crop response to its stable subset after the rows are reordered', async () => {
    let resolveUpload!: (response: { ok: boolean; json: () => Promise<{ thumbnail_path: string }> }) => void
    const pendingUpload = new Promise<{ ok: boolean; json: () => Promise<{ thumbnail_path: string }> }>((resolve) => {
      resolveUpload = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => pendingUpload))
    render(<FormHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'day の画像をクロップ調整' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete crop' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('reorder-subsets'))
    resolveUpload({ ok: true, json: async () => ({ thumbnail_path: 'day-new.png' }) })

    await waitFor(() => expect(screen.getByAltText('day preview')).toHaveAttribute('src', 'day-new.png'))
    expect(screen.getByAltText('night preview')).toHaveAttribute('src', 'night-old.png')
  })

  it('does not apply a pending crop response after its target subset is removed', async () => {
    let resolveUpload!: (response: { ok: boolean; json: () => Promise<{ thumbnail_path: string }> }) => void
    const pendingUpload = new Promise<{ ok: boolean; json: () => Promise<{ thumbnail_path: string }> }>((resolve) => {
      resolveUpload = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => pendingUpload))
    render(<FormHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'day の画像をクロップ調整' }))
    fireEvent.click(screen.getByRole('button', { name: 'Complete crop' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'day を削除' }))
    resolveUpload({ ok: true, json: async () => ({ thumbnail_path: 'stale-day.png' }) })

    await waitFor(() => expect(screen.queryByAltText('day preview')).not.toBeInTheDocument())
    expect(screen.getByAltText('night preview')).toHaveAttribute('src', 'night-old.png')
    expect(JSON.parse(screen.getByTestId('form-state').textContent!).subsets).toHaveLength(1)
  })
})
