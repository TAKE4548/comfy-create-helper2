import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react'

export interface StepperSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  presets?: number[]
  className?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

function getPrecision(num: number): number {
  const str = num.toString()
  if (str.includes('e-')) {
    const parts = str.split('e-')
    return parseInt(parts[1], 10)
  }
  const dotIndex = str.indexOf('.')
  return dotIndex >= 0 ? str.length - dotIndex - 1 : 0
}

function roundToStep(val: number, stepVal: number): number {
  const precision = Math.max(getPrecision(stepVal), 4)
  return Number(val.toFixed(precision))
}

function clampAndRound(val: number, min: number, max: number, step: number): number {
  if (Number.isNaN(val)) return min
  const clamped = Math.min(Math.max(val, min), max)
  return roundToStep(clamped, step)
}

export function StepperSlider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  label,
  presets,
  className = '',
  disabled = false,
  id,
  ariaLabel,
}: StepperSliderProps) {
  const [inputValue, setInputValue] = useState<string>(String(value))
  const isFocusedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!isFocusedRef.current) {
      setInputValue(String(value))
    }
  }, [value])

  const commitValue = () => {
    const parsed = parseFloat(inputValue)
    if (Number.isNaN(parsed)) {
      setInputValue(String(value))
    } else {
      const next = clampAndRound(parsed, min, max, step)
      setInputValue(String(next))
      onChange(next)
    }
  }

  const handleDecrease = () => {
    if (disabled || value <= min) return
    const next = clampAndRound(value - step, min, max, step)
    setInputValue(String(next))
    onChange(next)
  }


  const handleIncrease = () => {
    if (disabled || value >= max) return
    const next = clampAndRound(value + step, min, max, step)
    setInputValue(String(next))
    onChange(next)
  }


  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setInputValue(text)
    const parsed = parseFloat(text)
    if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
      const rounded = clampAndRound(parsed, min, max, step)
      onChange(rounded)
    }
  }

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue()
      e.currentTarget.blur()
    }
  }


  const handleInputBlur = () => {
    isFocusedRef.current = false
    commitValue()
  }

  const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value)
    if (!Number.isNaN(parsed)) {
      const rounded = clampAndRound(parsed, min, max, step)
      setInputValue(String(rounded))
      onChange(rounded)
    }
  }

  const handlePresetClick = (presetValue: number) => {
    const rounded = clampAndRound(presetValue, min, max, step)
    setInputValue(String(rounded))
    onChange(rounded)
  }

  const stepPrecision = getPrecision(step)

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-zinc-400">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="decrease"
          disabled={disabled || value <= min}
          onClick={handleDecrease}
          className="w-8 h-8 rounded bg-surface border border-zinc-700/50 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2 flex items-center justify-center transition-colors select-none font-bold text-sm"
        >
          -
        </button>
        <input
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            isFocusedRef.current = true
          }}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          aria-label={ariaLabel ? `${ariaLabel} input` : label ? `${label} input` : 'Value input'}
          className="w-16 h-8 text-center font-mono tabular-nums bg-surface-2 border border-zinc-700/50 rounded text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-[#7C6FDD] text-xs"
        />
        <button
          type="button"
          aria-label="increase"
          disabled={disabled || value >= max}
          onClick={handleIncrease}
          className="w-8 h-8 rounded bg-surface border border-zinc-700/50 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-2 flex items-center justify-center transition-colors select-none font-bold text-sm"
        >
          +
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleSliderChange}
          aria-label={ariaLabel || label || 'Slider'}
          className="flex-1 accent-[#7C6FDD] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        />
      </div>
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => handlePresetClick(p)}
              className="px-2 py-0.5 text-[10px] rounded bg-surface-2 border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono tabular-nums"
            >
              {p.toFixed(Math.max(stepPrecision, 2))}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

