import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { MappingMasterEditModal } from '../MappingMasterEditModal'
import type { ParamTypeMaster } from '../../api/types'

vi.mock('../../hooks/useComfyNodeTypes', () => ({
  useComfyNodeTypes: () => ({ filterClassTypes: () => [], isLoading: false, isError: false }),
}))
vi.mock('../WorkflowMappingPreview', () => ({ WorkflowMappingPreview: () => null }))

describe('MappingMasterEditModal Seed input type', () => {
  it('selects and saves the standard seed type without duplicating a reserved custom type', () => {
    const onSave = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const seedCustomType = {
      id: 7,
      name: 'seed',
      widget_type: 'int',
      combo_options: null,
      min_value: null,
      max_value: null,
      step: null,
      created_at: '2026-01-01T00:00:00Z',
    } as ParamTypeMaster

    render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen
          onClose={vi.fn()}
          master={null}
          groups={[]}
          stages={[]}
          paramTypeMasters={[seedCustomType]}
          onSave={onSave}
        />
      </QueryClientProvider>
    )

    const inputType = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    expect(screen.getAllByRole('option', { name: /seed/i })).toHaveLength(1)
    fireEvent.change(inputType, { target: { value: 'seed' } })
    fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Seed' } })
    fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'seed' } })
    fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ input_type: 'seed', param_name: 'seed' }))
  })
})
