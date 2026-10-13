import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkflowMappingEditor, type EditableSlot } from '../WorkflowMappingEditor'
import { rankWorkflowNodeCandidates } from '../../utils/workflowNodeUtils'

const { selectorRenders } = vi.hoisted(() => ({ selectorRenders: vi.fn() }))
vi.mock('../MappingNodeSelector', async (importOriginal) => {
  const original = await importOriginal<typeof import('../MappingNodeSelector')>()
  return {
    ...original,
    MappingNodeSelector: (props: import('../MappingNodeSelector').MappingNodeSelectorProps) => {
      selectorRenders(props.value)
      return <original.MappingNodeSelector {...props} />
    },
  }
})

const candidates = rankWorkflowNodeCandidates({
  '11': { class_type: 'Sampler', title: 'Main Sampler' },
  '12': { class_type: 'Sampler', title: 'Detail Sampler' },
}, { expectedClassTypes: ['Sampler'], titlePatterns: [], paramNames: [] }, 'Main', ['Main'])

const rows: EditableSlot[] = [
  { slotKey: 'v:1', masterId: 1, variantId: 1, stageId: 1, stageName: 'Main', roleLabel: 'Seed', nodeId: '11', enabled: true, missingReference: false, candidates },
  { slotKey: 'v:2', masterId: 2, variantId: 2, stageId: 1, stageName: 'Main', roleLabel: 'Steps', nodeId: '12', enabled: true, missingReference: false, candidates },
]

describe('WorkflowMappingEditor row isolation', () => {
  it('only rerenders a changed selector while retaining ID, focus and the latest callbacks', () => {
    const oldChange = vi.fn()
    const oldToggle = vi.fn()
    const latestChange = vi.fn()
    const latestToggle = vi.fn()
    const onToggleStage = vi.fn()
    const { rerender } = render(<WorkflowMappingEditor rows={rows} onChangeSlot={oldChange} onToggleSlot={oldToggle} onToggleStage={onToggleStage} />)
    const steps = within(screen.getByTestId('mapping-slot-v:2')).getByRole('textbox')
    act(() => steps.focus())
    selectorRenders.mockClear()
    rerender(<WorkflowMappingEditor rows={rows.map((row) => ({ ...row, enabled: row.slotKey === 'v:1' ? false : row.enabled }))} onChangeSlot={latestChange} onToggleSlot={latestToggle} onToggleStage={onToggleStage} />)
    expect(selectorRenders.mock.calls.map(([value]) => value)).toEqual(['11'])
    const seedRow = within(screen.getByTestId('mapping-slot-v:1'))
    expect(seedRow.getByRole('textbox')).toHaveAttribute('readonly')
    expect(seedRow.getByRole('textbox')).toHaveValue('11')
    expect(seedRow.getByRole('checkbox')).not.toBeChecked()
    expect(steps).toHaveFocus()
    fireEvent.change(steps, { target: { value: '123' } })
    fireEvent.click(within(screen.getByTestId('mapping-slot-v:2')).getByRole('checkbox'))
    expect(latestChange).toHaveBeenCalledWith('v:2', '123')
    expect(latestToggle).toHaveBeenCalledWith('v:2', false)
    expect(oldChange).not.toHaveBeenCalled()
    expect(oldToggle).not.toHaveBeenCalled()
    selectorRenders.mockClear()
    rerender(<WorkflowMappingEditor rows={rows.map((row) => ({ ...row }))} onChangeSlot={latestChange} onToggleSlot={latestToggle} onToggleStage={onToggleStage} />)
    expect(selectorRenders.mock.calls.map(([value]) => value)).toEqual(['11'])
    expect(seedRow.getByRole('textbox')).not.toHaveAttribute('readonly')
    expect(seedRow.getByRole('textbox')).toHaveValue('11')
  })

  it('updates candidate metadata and saving guards when those row inputs change', () => {
    const props = { onChangeSlot: vi.fn(), onToggleSlot: vi.fn(), onToggleStage: vi.fn() }
    const { rerender } = render(<WorkflowMappingEditor rows={rows} {...props} />)
    const changedRows = rows.map((row) => row.slotKey === 'v:1'
      ? { ...row, candidates: row.candidates.map((candidate) => ({ ...candidate, title: 'Updated title' })) }
      : { ...row })
    selectorRenders.mockClear()
    rerender(<WorkflowMappingEditor rows={changedRows} {...props} />)
    expect(selectorRenders.mock.calls.map(([value]) => value)).toEqual(['11'])
    expect(within(screen.getByTestId('mapping-slot-v:1')).getByLabelText('選択中のノード')).toHaveTextContent('Updated title')
    selectorRenders.mockClear()
    rerender(<WorkflowMappingEditor rows={changedRows.map((row) => ({ ...row }))} saving {...props} />)
    expect(selectorRenders.mock.calls.map(([value]) => value)).toEqual(['11', '12'])
    for (const row of rows) {
      const slot = within(screen.getByTestId(`mapping-slot-${row.slotKey}`))
      expect(slot.getByRole('textbox')).toHaveAttribute('readonly')
      expect(slot.getByRole('checkbox')).toBeDisabled()
    }
  })
})
