import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { PatternTagInput } from '../PatternTagInput'

describe('PatternTagInput', () => {
  it('renders existing patterns as chips', () => {
    const patterns = ['positive', 'sampler']
    render(<PatternTagInput patterns={patterns} onChange={vi.fn()} />)
    expect(screen.getByText('positive')).toBeInTheDocument()
    expect(screen.getByText('sampler')).toBeInTheDocument()
  })

  it('adds a new pattern on Enter', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    fireEvent.change(input, { target: { value: 'ksampler' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['positive', 'ksampler'])
  })

  it('parses comma-separated pasted text into multiple unique chips', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => '"ksampler", prompt, positive, test',
      },
    })
    expect(onChange).toHaveBeenCalledWith(['positive', 'ksampler', 'prompt', 'test'])
  })

  it('allows inline editing via double click and Enter', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['typo_pattern']} onChange={onChange} />)
    const chipText = screen.getByText('typo_pattern')
    fireEvent.doubleClick(chipText)

    const inlineInput = screen.getByDisplayValue('typo_pattern')
    fireEvent.change(inlineInput, { target: { value: 'corrected_pattern' } })
    fireEvent.keyDown(inlineInput, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['corrected_pattern'])
  })

  it('cancels inline editing on Escape', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['typo_pattern']} onChange={onChange} />)
    const chipText = screen.getByText('typo_pattern')
    fireEvent.doubleClick(chipText)

    const inlineInput = screen.getByDisplayValue('typo_pattern')
    fireEvent.change(inlineInput, { target: { value: 'something_else' } })
    fireEvent.keyDown(inlineInput, { key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('typo_pattern')).toBeInTheDocument()
  })

  it('removes tag when delete button clicked', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive', 'sampler']} onChange={onChange} />)
    const deleteBtn = screen.getByLabelText('パターン positive を削除')
    fireEvent.click(deleteBtn)
    expect(onChange).toHaveBeenCalledWith(['sampler'])
  })
})
