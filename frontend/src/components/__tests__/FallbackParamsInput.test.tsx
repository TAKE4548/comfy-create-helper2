import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { FallbackParamsInput } from '../FallbackParamsInput'

describe('FallbackParamsInput', () => {
  it('renders primary param name and fallback list', () => {
    render(
      <FallbackParamsInput
        primaryParamName="seed"
        fallbackParams={["noise_seed"]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('seed')).toBeInTheDocument()
    expect(screen.getByText('noise_seed')).toBeInTheDocument()
    expect(screen.getByText('優先度 1 (Primary)')).toBeInTheDocument()
    expect(screen.getByText('優先度 2')).toBeInTheDocument()
  })

  it('adds a new fallback param on click or Enter', () => {
    const onChange = vi.fn()
    render(
      <FallbackParamsInput
        primaryParamName="seed"
        fallbackParams={["noise_seed"]}
        onChange={onChange}
      />
    )
    const input = screen.getByPlaceholderText('表記ゆれ追加 (例: noise_seed, random_seed)...')
    fireEvent.change(input, { target: { value: 'random_seed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['noise_seed', 'random_seed'])
  })

  it('reorders priority when up/down buttons clicked', () => {
    const onChange = vi.fn()
    render(
      <FallbackParamsInput
        primaryParamName="seed"
        fallbackParams={["noise_seed", "random_seed"]}
        onChange={onChange}
      />
    )
    const upBtn = screen.getByLabelText('random_seed を優先度アップ')
    fireEvent.click(upBtn)
    expect(onChange).toHaveBeenCalledWith(['random_seed', 'noise_seed'])
  })

  it('removes fallback item on delete click', () => {
    const onChange = vi.fn()
    render(
      <FallbackParamsInput
        primaryParamName="seed"
        fallbackParams={["noise_seed", "random_seed"]}
        onChange={onChange}
      />
    )
    const delBtn = screen.getByLabelText('noise_seed を削除')
    fireEvent.click(delBtn)
    expect(onChange).toHaveBeenCalledWith(['random_seed'])
  })
})
