import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoraStackEditor } from '../LoraStackEditor'

vi.mock('../../api/client', () => ({
  lorasApi: { getComfyModels: vi.fn().mockResolvedValue([]) },
  baseModelsApi: { list: vi.fn().mockResolvedValue([]) },
  loraCategoriesApi: { list: vi.fn().mockResolvedValue([]) },
}))

const importedStack = {
  positive_lora_count: '1',
  positive_lora_name_1: 'models/imported.safetensors',
  positive_lora_wt_1: '0.85',
  positive_model_str_1: '1.10',
  positive_clip_str_1: '0.90',
}

function renderEditor(paramValues: Record<string, string>, setParamValues: (values: Record<string, string>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LoraStackEditor role="positive" paramValues={paramValues} setParamValues={setParamValues} loras={[]} />
    </QueryClientProvider>,
  )
}

describe('LoraStackEditor REQ-334 strength controls', () => {
  it.each([
    ['Increase LoRA strength for slot 1', '0.90'],
    ['Decrease LoRA strength for slot 1', '0.80'],
  ])('%s applies the precise 0.05 change without altering the serialized stack', (buttonName, expected) => {
    const setParamValues = vi.fn()
    renderEditor(importedStack, setParamValues)

    const strength = screen.getByRole('spinbutton', { name: 'LoRA strength for slot 1' })
    expect(strength).toHaveValue(0.85)
    expect(strength).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: buttonName })).toHaveClass('min-h-11', 'min-w-11')
    fireEvent.click(screen.getByRole('button', { name: buttonName }))

    expect(setParamValues).toHaveBeenCalledWith({ ...importedStack, positive_lora_wt_1: expected })
  })

  it('applies directly entered precision while preserving imported name and model strengths', () => {
    const setParamValues = vi.fn()
    renderEditor(importedStack, setParamValues)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'LoRA strength for slot 1' }), { target: { value: '0.70' } })
    expect(setParamValues).toHaveBeenCalledWith({ ...importedStack, positive_lora_wt_1: '0.70' })
  })

})
