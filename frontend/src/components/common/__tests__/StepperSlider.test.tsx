import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepperSlider } from '../StepperSlider'

describe('StepperSlider', () => {
  const defaultProps = {
    value: 0.5,
    onChange: vi.fn(),
    min: 0,
    max: 1,
    step: 0.05,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('??????????????????????????', () => {
    render(<StepperSlider {...defaultProps} label="CFG Scale" id="cfg-input" />)

    expect(screen.getByText('CFG Scale')).toBeInTheDocument()
    const decreaseBtn = screen.getByRole('button', { name: 'decrease' })
    const increaseBtn = screen.getByRole('button', { name: 'increase' })
    const numInput = screen.getByRole('spinbutton')
    const slider = screen.getByRole('slider')

    expect(decreaseBtn).toBeInTheDocument()
    expect(increaseBtn).toBeInTheDocument()
    expect(numInput).toBeInTheDocument()
    expect(slider).toBeInTheDocument()
    expect(numInput).toHaveValue(0.5)
    expect(slider).toHaveValue('0.5')
    expect(numInput).toHaveClass('tabular-nums')
    expect(numInput).toHaveClass('font-mono')
  })

  it('[-] ?????? -step (0.05) ??????? onChange ???????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} />)

    const decreaseBtn = screen.getByRole('button', { name: 'decrease' })
    fireEvent.click(decreaseBtn)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(0.45)
  })

  it('[+] ?????? +step (0.05) ??????? onChange ???????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} />)

    const increaseBtn = screen.getByRole('button', { name: 'increase' })
    fireEvent.click(increaseBtn)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(0.55)
  })

  it('??????????: 0.7 - 0.05????????????0.65??????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0.7} />)

    const decreaseBtn = screen.getByRole('button', { name: 'decrease' })
    fireEvent.click(decreaseBtn)

    expect(onChange).toHaveBeenCalledWith(0.65)
  })

  it('?????? [-] ??????????????????????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0} min={0} />)

    const decreaseBtn = screen.getByRole('button', { name: 'decrease' })
    expect(decreaseBtn).toBeDisabled()
    fireEvent.click(decreaseBtn)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('?????? [+] ??????????????????????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={1} max={1} />)

    const increaseBtn = screen.getByRole('button', { name: 'increase' })
    expect(increaseBtn).toBeDisabled()
    fireEvent.click(increaseBtn)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('???????????? Enter ???????? onChange ???????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} />)

    const numInput = screen.getByRole('spinbutton')
    fireEvent.change(numInput, { target: { value: '0.85' } })
    fireEvent.keyDown(numInput, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(0.85)
  })

  it('?????????????????? onChange ???????', () => {
    const onChange = vi.fn()
    render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} />)

    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0.75' } })

    expect(onChange).toHaveBeenCalledWith(0.75)
  })

  it('presets ???????????????????????????????????', () => {
    const onChange = vi.fn()
    const presets = [0.25, 0.5, 0.75, 1.0]
    render(<StepperSlider {...defaultProps} onChange={onChange} presets={presets} />)

    const presetBtn = screen.getByText('0.75')
    expect(presetBtn).toBeInTheDocument()

    fireEvent.click(presetBtn)
    expect(onChange).toHaveBeenCalledWith(0.75)
  })

  it('disabled={true} ????????????????????', () => {
    render(<StepperSlider {...defaultProps} disabled presets={[0.5]} />)

    expect(screen.getByRole('button', { name: 'decrease' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'increase' })).toBeDisabled()
    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(screen.getByRole('slider')).toBeDisabled()
    expect(screen.getByText('0.50')).toBeDisabled()
  })

  describe('Red Team 1: ???????????', () => {
    it('?? (abc) ???? NaN ? emit ??????????????????????', () => {
      const onChange = vi.fn()
      render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} />)

      const numInput = screen.getByRole('spinbutton')
      fireEvent.change(numInput, { target: { value: 'abc' } })
      fireEvent.blur(numInput)

      expect(onChange).not.toHaveBeenCalledWith(NaN)
      expect(numInput).toHaveValue(0.5)
    })

    it('????? (-999) ????????????? min (0) ????????????', () => {
      const onChange = vi.fn()
      render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} min={0} max={1} />)

      const numInput = screen.getByRole('spinbutton')
      fireEvent.change(numInput, { target: { value: '-999' } })
      fireEvent.blur(numInput)

      expect(onChange).toHaveBeenCalledWith(0)
      expect(numInput).toHaveValue(0)
    })

    it('????? (999) ???? Enter ????? max (1) ????????????', () => {
      const onChange = vi.fn()
      render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} min={0} max={1} />)

      const numInput = screen.getByRole('spinbutton')
      fireEvent.change(numInput, { target: { value: '999' } })
      fireEvent.keyDown(numInput, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(1)
      expect(numInput).toHaveValue(1)
    })

    it('???? (0.0000001) ????????????????????????????', () => {
      const onChange = vi.fn()
      render(<StepperSlider {...defaultProps} onChange={onChange} value={0.5} min={0} max={1} step={0.05} />)

      const numInput = screen.getByRole('spinbutton')
      fireEvent.change(numInput, { target: { value: '0.0000001' } })
      fireEvent.blur(numInput)

      expect(onChange).toHaveBeenCalled()
      const lastCallArg = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(typeof lastCallArg).toBe('number')
      expect(Number.isNaN(lastCallArg)).toBe(false)
      expect(lastCallArg).toBeGreaterThanOrEqual(0)
      expect(lastCallArg).toBeLessThanOrEqual(1)
    })
  })
})
