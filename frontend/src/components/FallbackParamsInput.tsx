import React, { useState } from 'react'
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'

export interface FallbackParamsInputProps {
  primaryParamName: string
  fallbackParams: string[]
  onChange: (params: string[]) => void
  disabled?: boolean
}

export const FallbackParamsInput: React.FC<FallbackParamsInputProps> = ({
  primaryParamName,
  fallbackParams,
  onChange,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState('')

  const addFallback = () => {
    const trimmed = inputValue.trim().replace(/["']/g, '')
    if (!trimmed) return
    if (trimmed.toLowerCase() === primaryParamName.trim().toLowerCase()) {
      setInputValue('')
      return
    }
    if (!fallbackParams.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...fallbackParams, trimmed])
    }
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addFallback()
    }
  }

  const handleRemove = (index: number) => {
    if (disabled) return
    onChange(fallbackParams.filter((_, i) => i !== index))
  }

  const movePriority = (index: number, direction: 'up' | 'down') => {
    if (disabled) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= fallbackParams.length) return
    const next = [...fallbackParams]
    const [removed] = next.splice(index, 1)
    next.splice(targetIndex, 0, removed)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          <span>表記ゆれパラメータ名 (フォールバック探索)</span>
          <span className="text-[10px] text-zinc-500 font-normal">
            (プライマリ未合致時に優先順探索)
          </span>
        </label>
      </div>

      <div className="space-y-1.5 p-2.5 bg-zinc-950/60 border border-zinc-800 rounded-lg">
        {/* Primary indicator */}
        <div className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-zinc-900 border border-zinc-800">
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#7C6FDD]/20 text-[#7C6FDD] border border-[#7C6FDD]/30">
            優先度 1 (Primary)
          </span>
          <span className="font-mono text-zinc-200">
            {primaryParamName.trim() || '(未入力)'}
          </span>
        </div>

        {/* Fallback items list with priority controls */}
        {fallbackParams.map((param, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                優先度 {index + 2}
              </span>
              <span className="font-mono text-zinc-200">{param}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => movePriority(index, 'up')}
                disabled={disabled || index === 0}
                aria-label={`${param} を優先度アップ`}
                className="p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => movePriority(index, 'down')}
                disabled={disabled || index === fallbackParams.length - 1}
                aria-label={`${param} を優先度ダウン`}
                className="p-0.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                aria-label={`${param} を削除`}
                className="p-0.5 text-zinc-500 hover:text-rose-400 disabled:opacity-30 transition-colors ml-1"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}

        {/* Add fallback input */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="表記ゆれ追加 (例: noise_seed, random_seed)..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-[#7C6FDD]"
          />
          <button
            type="button"
            onClick={addFallback}
            disabled={disabled || !inputValue.trim()}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 disabled:opacity-40 transition-colors"
          >
            <Plus size={12} />
            <span>追加</span>
          </button>
        </div>
      </div>
    </div>
  )
}
