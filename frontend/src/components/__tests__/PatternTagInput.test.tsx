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

  it('[REQ-415/AC-1] adds tag and clears input when clicking "追加" button', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    const addButton = screen.getByRole('button', { name: /追加/i })

    expect(addButton).toBeDisabled()
    fireEvent.change(input, { target: { value: 'latent' } })
    expect(addButton).not.toBeDisabled()

    fireEvent.click(addButton)
    expect(onChange).toHaveBeenCalledWith(['positive', 'latent'])
    expect(input).toHaveValue('')
  })

  it('[REQ-415/AC-2] has enterKeyHint="done" and adds tag on Enter preventing default', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    expect(input).toHaveAttribute('enterkeyhint', 'done')

    fireEvent.change(input, { target: { value: 'checkpoint' } })
    const notPrevented = fireEvent.keyDown(input, { key: 'Enter', cancelable: true })
    expect(notPrevented).toBe(false)
    expect(onChange).toHaveBeenCalledWith(['positive', 'checkpoint'])
  })

  it('[REQ-415/AC-3] automatically commits tag on blur', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    fireEvent.change(input, { target: { value: 'lora' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(['positive', 'lora'])
    expect(input).toHaveValue('')
  })

  it('[REQ-415/AC-4] guards against IME composition when pressing Enter', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    fireEvent.change(input, { target: { value: 'モデル' } })

    // During IME composition (isComposing = true)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(onChange).not.toHaveBeenCalled()

    // After IME composition completes (isComposing = false)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 })
    expect(onChange).toHaveBeenCalledWith(['positive', 'モデル'])
  })

  it('[REQ-415/AC-5] disables "追加" button and suppresses add on empty or duplicate text', () => {
    const onChange = vi.fn()
    render(<PatternTagInput patterns={['positive']} onChange={onChange} />)
    const input = screen.getByPlaceholderText('パターン追加...')
    const addButton = screen.getByRole('button', { name: /追加/i })

    // Initial state (empty)
    expect(addButton).toBeDisabled()

    // Whitespace only
    fireEvent.change(input, { target: { value: '   ' } })
    expect(addButton).toBeDisabled()

    // Duplicate text
    fireEvent.change(input, { target: { value: 'positive' } })
    expect(addButton).toBeDisabled()

    // Duplicate text with spaces
    fireEvent.change(input, { target: { value: '  positive  ' } })
    expect(addButton).toBeDisabled()

    // Non-duplicate text
    fireEvent.change(input, { target: { value: 'vae' } })
    expect(addButton).not.toBeDisabled()
  })
})

