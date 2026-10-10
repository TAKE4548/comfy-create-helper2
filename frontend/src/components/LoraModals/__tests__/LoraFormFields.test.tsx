import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseModelsApi, loraCategoriesApi, lorasApi } from '../../../api/client'
import type { LoraFormState } from '../types'
import { validateLoraStrengthRange } from '../types'
import { LoraFormFields } from '../LoraFormFields'

const initialForm: LoraFormState = {
  model_name: 'demo',
  file_path: 'folder/demo.safetensors',
  description: 'description',
  trigger_word_sets: [
    { name: 'Main', words: 'fox, blue' },
    { name: 'Alternate', words: 'fox' },
  ],
  recommended_strength_min: 0.7,
  recommended_strength_max: 0.85,
  category_id: undefined,
  target_base_model_ids: [],
}

function renderFields(form = initialForm) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Harness() {
    const [state, setState] = useState(form)
    return <>
      <LoraFormFields form={state} setForm={setState} idPrefix="test-lora" categories={[]} onCategoryCreated={vi.fn()} onUploadImage={vi.fn()} />
      <output data-testid="form-state">{JSON.stringify(state)}</output>
    </>
  }
  return render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
}

describe('LoraFormFields', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(lorasApi, 'getComfyModels').mockResolvedValue([])
    vi.spyOn(baseModelsApi, 'list').mockResolvedValue([])
    vi.spyOn(loraCategoriesApi, 'create').mockResolvedValue({ id: 3, name: 'New Category', sort_order: 0 })
  })

  it('accepts absent, single, equal, and ordered strength values, but explains invalid ranges', () => {
    expect(validateLoraStrengthRange({})).toBeNull()
    expect(validateLoraStrengthRange({ recommended_strength_min: 0.8 })).toBeNull()
    expect(validateLoraStrengthRange({ recommended_strength_min: 0.8, recommended_strength_max: 0.8 })).toBeNull()
    expect(validateLoraStrengthRange({ recommended_strength_min: 0.8, recommended_strength_max: 0.9 })).toBeNull()
    expect(validateLoraStrengthRange({ recommended_strength_min: 1, recommended_strength_max: 0.9 })).toBe('MinはMax以下にしてください')
    expect(validateLoraStrengthRange({ recommended_strength_min: Number.NaN })).toBe('強度は有限の数値で入力してください')
  })

  it('steps recommended strengths by 0.05 and reports a reversed range', () => {
    renderFields()
    const increaseMin = screen.getByRole('button', { name: 'Increase Strength Min' })
    expect(increaseMin.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(increaseMin)
    expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}').recommended_strength_min).toBe(0.75)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Strength Min' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Strength Max' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Strength Max' }))
    expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}')).toMatchObject({
      recommended_strength_min: 0.7,
      recommended_strength_max: 0.85,
    })
    fireEvent.change(document.getElementById('test-lora-strength-min')!, { target: { value: '0.9' } })
    expect(screen.getByRole('alert')).toHaveTextContent('MinはMax以下にしてください')
  })

  it('marks overlapping trigger words and allows trigger sets to be reordered', () => {
    renderFields()
    expect(screen.getAllByRole('status').some((status) => status.textContent === '重複ワード: fox')).toBe(true)
    const moveUp = screen.getByRole('button', { name: 'Move Alternate up' })
    const moveDown = screen.getByRole('button', { name: 'Move Main down' })
    expect(moveUp.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(moveDown.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Move Main up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Alternate down' })).toBeDisabled()
    fireEvent.click(moveUp)
    const setNames = screen.getAllByPlaceholderText('Set Name (e.g. Costume, Hair)') as HTMLInputElement[]
    expect(setNames.map((input) => input.value)).toEqual(['Alternate', 'Main'])
  })

  it('adds a trigger set with the icon button and retains its accessible label', () => {
    renderFields({ ...initialForm, trigger_word_sets: [] })
    const addButton = screen.getByRole('button', { name: 'Add Set' })
    expect(addButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(addButton)
    expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}').trigger_word_sets).toEqual([{ name: '', words: '' }])
  })

  it('confirms comma and Enter trigger input as words in their own sets', () => {
    renderFields({ ...initialForm, trigger_word_sets: [{ name: 'First', words: '' }, { name: 'Second', words: '' }] })
    const inputs = screen.getAllByPlaceholderText('Enter trigger words...')
    fireEvent.change(inputs[0], { target: { value: 'fox,' } })
    expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}').trigger_word_sets[0].words).toBe('fox')
    fireEvent.change(inputs[1], { target: { value: 'blue eyes' } })
    fireEvent.keyDown(inputs[1], { key: 'Enter' })
    expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}').trigger_word_sets[1].words).toBe('blue eyes')
  })

  it('provides mobile section switching while exposing both desktop columns', () => {
    renderFields()
    const basicTab = screen.getByRole('tab', { name: '基本情報' })
    const triggerTab = screen.getByRole('tab', { name: 'トリガー・画像' })
    expect(basicTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('test-lora-basic-panel')?.className).toContain('md:block')
    expect(document.getElementById('test-lora-triggers-panel')?.className).toContain('md:block')
    fireEvent.click(triggerTab)
    expect(triggerTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('test-lora-basic-panel')?.className).toContain('hidden')
  })

  it('keeps category creation in the form and selects the new category', async () => {
    renderFields()
    fireEvent.change(document.getElementById('test-lora-category')!, { target: { value: '__new__' } })
    fireEvent.change(screen.getByPlaceholderText('新規カテゴリ名'), { target: { value: 'New Category' } })
    fireEvent.click(screen.getByTitle('追加'))
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('form-state').textContent || '{}').category_id).toBe(3)
    })
    expect(loraCategoriesApi.create).toHaveBeenCalledWith('New Category')
  })

  it('preserves model name and relative path edits in the form state', () => {
    renderFields()
    fireEvent.change(document.getElementById('test-lora-model-name')!, { target: { value: 'new-name' } })
    fireEvent.change(document.getElementById('test-lora-file-path')!, { target: { value: 'subfolder/new-name.safetensors' } })
    const state = JSON.parse(screen.getByTestId('form-state').textContent || '{}')
    expect(state.model_name).toBe('new-name')
    expect(state.file_path).toBe('subfolder/new-name.safetensors')
  })
})
