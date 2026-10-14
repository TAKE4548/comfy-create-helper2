import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddAssetModal } from '../AddAssetModal'
import type { Lora } from '../../../../api/types'

const lora = (id: number, model_name: string, thumbnail_path: string | null): Lora => ({
  id, model_name, description: model_name, recommended_strength_min: 0.7, recommended_strength_max: 1.0,
  category_id: null, thumbnail_path, file_path: `/models/${model_name}.safetensors`, trigger_word_sets: [],
  target_base_model_ids: [], sort_order: id, created_at: '2026-01-01',
})

function renderModal(loras: Lora[], addAppliedAsset = vi.fn()) {
  render(<AddAssetModal role="positive" loras={loras} onClose={vi.fn()} addAppliedAsset={addAppliedAsset} setRoleCollapsed={vi.fn()} />)
  return addAppliedAsset
}

describe('AddAssetModal REQ-334 tray and LoRA strength', () => {
  it('shows selected LoRA thumbnails in a persistent tray, removes only from the tray, and applies the remaining selection', () => {
    const addAppliedAsset = renderModal([lora(1, 'fox', '/thumbs/fox.png'), lora(2, 'bird', null)])
    fireEvent.click(screen.getAllByText('fox')[0])
    fireEvent.click(screen.getAllByText('bird')[0])

    expect(screen.getByRole('region', { name: '選択中のアセット' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'fox' })).toHaveAttribute('src', '/thumbs/fox.png')
    expect(screen.getByLabelText('birdのサムネイルなし')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '選択中のアセット' })).toHaveTextContent('bird')
    fireEvent.click(screen.getByRole('button', { name: 'トレイから削除: fox' }))
    fireEvent.click(screen.getByRole('button', { name: /追加/ }))

    expect(addAppliedAsset).toHaveBeenCalledTimes(1)
    expect(addAppliedAsset).toHaveBeenCalledWith('positive', expect.objectContaining({ type: 'lora', assetId: 2 }))
  })

  it('applies precise 0.05 strength steps and direct numeric input within the existing 0–2 range', () => {
    const addAppliedAsset = renderModal([lora(1, 'fox', null)])
    fireEvent.click(screen.getAllByText('fox')[0])

    const strength = screen.getByRole('spinbutton', { name: 'LoRA強度: fox' })
    expect(strength).toHaveValue(0.85)
    fireEvent.click(screen.getByRole('button', { name: '強度を下げる: fox' }))
    expect(strength).toHaveValue(0.8)
    fireEvent.change(strength, { target: { value: '0.85' } })
    fireEvent.click(screen.getByRole('button', { name: '強度を上げる: fox' }))
    expect(strength).toHaveValue(0.9)
    fireEvent.change(strength, { target: { value: '0.70' } })
    fireEvent.click(screen.getByRole('button', { name: /追加/ }))

    expect(addAppliedAsset).toHaveBeenCalledWith('positive', expect.objectContaining({ loraPromptString: '<lora:fox:0.70>' }))
  })

  it('clamps strength steps at the existing 0 and 2 bounds and preserves the applied value', () => {
    const addAppliedAsset = renderModal([lora(1, 'fox', null)])
    fireEvent.click(screen.getAllByText('fox')[0])

    const strength = screen.getByRole('spinbutton', { name: 'LoRA強度: fox' })
    const decrease = screen.getByRole('button', { name: '強度を下げる: fox' })
    const increase = screen.getByRole('button', { name: '強度を上げる: fox' })

    fireEvent.change(strength, { target: { value: '0' } })
    fireEvent.click(decrease)
    expect(strength).toHaveValue(0)
    fireEvent.change(strength, { target: { value: '2' } })
    fireEvent.click(increase)
    expect(strength).toHaveValue(2)

    fireEvent.click(screen.getByRole('button', { name: /追加/ }))
    expect(addAppliedAsset).toHaveBeenCalledWith('positive', expect.objectContaining({ loraPromptString: '<lora:fox:2.00>' }))
  })
  it('[REQ-363/AC-8] applies tightened padding (p-3.5) on mobile viewport', () => {
    const { container } = render(<AddAssetModal role="positive" loras={[]} onClose={vi.fn()} addAppliedAsset={vi.fn()} setRoleCollapsed={vi.fn()} />)
    const header = container.querySelector('h2')?.parentElement?.parentElement
    expect(header?.className).toContain('px-3.5')
    expect(header?.className).toContain('md:px-6')

    const searchArea = container.querySelector('input[type="text"]')?.parentElement?.parentElement
    expect(searchArea?.className).toContain('p-3.5')
    expect(searchArea?.className).toContain('md:p-6')
  })
})
