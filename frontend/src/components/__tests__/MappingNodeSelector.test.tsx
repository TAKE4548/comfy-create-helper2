import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MappingNodeSelector } from '../MappingNodeSelector'
import { rankWorkflowNodeCandidates } from '../../utils/workflowNodeUtils'

const candidates = rankWorkflowNodeCandidates({
  '11': { class_type: 'Sampler', title: 'Face Detailer' },
  '12': { class_type: 'Other', title: 'Unrelated' },
}, { expectedClassTypes: ['Sampler'], titlePatterns: ['Face Detailer'], paramNames: [] }, 'FaceDetailer', ['FaceDetailer'])

describe('MappingNodeSelector suitability display', () => {
  it('places selected metadata and short score inside the field and preserves direct ID editing', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MappingNodeSelector value="11" candidates={candidates} readOnly={false} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'ノードID' })
    const metadata = screen.getByLabelText('選択中のノード')
    expect(metadata.parentElement).toBe(input.parentElement)
    expect(metadata).toHaveTextContent('Face Detailer · Sampler')
    expect(metadata).not.toHaveTextContent('ID 11')
    expect(metadata).toHaveTextContent('100%')
    expect(screen.getByTitle('適合スコア')).toHaveTextContent('100%')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1' } })
    rerender(<MappingNodeSelector value="1" candidates={candidates} readOnly={false} onChange={onChange} />)
    expect(screen.getByRole('textbox', { name: 'ノードID' })).toBe(input)
    expect(input).toHaveValue('1')
    expect(onChange).toHaveBeenLastCalledWith('1')
    expect(screen.queryByLabelText('選択中のノード')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.click(screen.getByRole('option', { name: /Unrelated/ }))
    expect(onChange).toHaveBeenLastCalledWith('12')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('opens candidates from selected metadata and the blank field area using the same input', () => {
    render(<MappingNodeSelector value="11" candidates={candidates} readOnly={false} onChange={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'ノードID' })
    const field = input.parentElement!
    fireEvent.click(screen.getByLabelText('選択中のノード'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(field)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'ノードID' })).toBe(input)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens candidates from the score badge and keeps readonly keyboard actions inert', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MappingNodeSelector value="11" candidates={candidates} readOnly={false} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'ノードID' })
    fireEvent.click(screen.getByTitle('適合スコア'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    rerender(<MappingNodeSelector value="11" candidates={candidates} readOnly onChange={onChange} />)
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '12' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps missing references inside a readonly field without opening editable candidates', () => {
    const onChange = vi.fn()
    render(<MappingNodeSelector value="999" candidates={candidates} readOnly onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'ノードID' })
    expect(input).toHaveValue('999')
    expect(input).toHaveAttribute('readonly')
    expect(screen.getByLabelText('選択中のノード')).toHaveTextContent('参照先なし')
    expect(screen.getByLabelText('選択中のノード')).not.toHaveTextContent('999')
    fireEvent.click(screen.getByLabelText('選択中のノード'))
    fireEvent.click(input.parentElement!)
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
