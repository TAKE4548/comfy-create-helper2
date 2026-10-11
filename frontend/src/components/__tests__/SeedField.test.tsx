import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SeedField } from '../SeedField'
import { SEED_MODES_KEY } from '../../utils/seedModel'
import type { WorkflowMapping } from '../../api/types'

const mapping: WorkflowMapping = { id: 10, master_id: 2, variant_id: 4, node_id: 'n', role: 'Sampler_Seed', param_name: 'seed', input_type: 'seed', display_name: 'Seed' }

describe('SeedField', () => {
  it('shows fixed values editable and records mode without changing the value', () => {
    const onChange = vi.fn()
    render(<SeedField mapping={mapping} paramValues={{ Sampler_Seed: '42' }} onChange={onChange} />)
    expect(screen.getByRole('spinbutton', { name: 'Seedの値' })).toHaveValue(42)
    fireEvent.click(screen.getByRole('button', { name: 'ランダムにする' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ Sampler_Seed: '42', [SEED_MODES_KEY]: expect.any(String) }))
    expect(JSON.parse(onChange.mock.calls[0][0][SEED_MODES_KEY]).modes['master:2:variant:4']).toBe('random')
  })

  it('disables the value in random mode and uses mapping-specific mobile ids', () => {
    const values = { Sampler_Seed: '7', [SEED_MODES_KEY]: JSON.stringify({ version: 1, modes: { 'master:2:variant:4': 'random' } }) }
    render(<SeedField mapping={mapping} paramValues={values} onChange={vi.fn()} mobile />)
    expect(screen.getByRole('spinbutton', { name: 'Seedの値' })).toBeDisabled()
    expect(document.getElementById('seed-input-10-mobile')).toBeInTheDocument()
    expect(screen.getByText('ランダム')).toBeInTheDocument()
  })

  it('shows malformed metadata as an accessible field error', () => {
    render(<SeedField mapping={mapping} paramValues={{ Sampler_Seed: '1', [SEED_MODES_KEY]: '{' }} onChange={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Seed mode metadata is invalid JSON')
  })
})
