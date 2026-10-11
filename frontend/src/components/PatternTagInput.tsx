import React, { useState, useRef, useEffect } from 'react'
import { Copy, Check, Edit2, X } from 'lucide-react'

export interface PatternTagInputProps {
  patterns: string[]
  onChange: (patterns: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export const PatternTagInput: React.FC<PatternTagInputProps> = ({
  patterns,
  onChange,
  placeholder = '検索パターン (例: positive, sampler)...',
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [copied, setCopied] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingIndex])

  const addTag = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!patterns.includes(trimmed)) {
      onChange([...patterns, trimmed])
    }
    setInputValue('')
  }

  const removeTag = (index: number) => {
    if (disabled) return
    onChange(patterns.filter((_, i) => i !== index))
  }

  const startEditing = (index: number) => {
    if (disabled) return
    setEditingIndex(index)
    setEditingValue(patterns[index])
  }

  const commitEditing = () => {
    if (editingIndex === null) return
    const trimmed = editingValue.trim()
    if (!trimmed) {
      removeTag(editingIndex)
    } else {
      const next = [...patterns]
      next[editingIndex] = trimmed
      onChange(next)
    }
    setEditingIndex(null)
    setEditingValue('')
  }

  const cancelEditing = () => {
    setEditingIndex(null)
    setEditingValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const rawTokens = text.split(/[,\n\r]+/)
    const cleanTokens = rawTokens
      .map((t) => t.replace(/["']/g, '').trim())
      .filter((t) => t.length > 0)

    const merged = Array.from(new Set([...patterns, ...cleanTokens]))
    onChange(merged)
    setInputValue('')
  }

  const handleCopyAll = async () => {
    if (patterns.length === 0) return
    const text = patterns.join(', ')
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Failed to copy to clipboard', err)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-300">
          タイトル検索パターン (OR一致)
        </label>
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={patterns.length === 0 || disabled}
          aria-label="パターンをコピー"
          title="クリップボードに全パターンをコピー"
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400">コピー完了</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>パターンをコピー</span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 p-2 bg-zinc-950/60 border border-zinc-800 rounded-lg min-h-[42px] items-center focus-within:border-zinc-700">
        {patterns.map((pattern, index) => {
          if (editingIndex === index) {
            return (
              <input
                key={index}
                ref={editInputRef}
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitEditing()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelEditing()
                  }
                }}
                className="bg-zinc-800 text-xs text-white border border-[#7C6FDD] rounded px-1.5 py-0.5 outline-none font-mono min-w-[80px]"
              />
            )
          }

          return (
            <span
              key={index}
              onDoubleClick={() => startEditing(index)}
              title="ダブルクリックまたは編集アイコンで編集"
              className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-0.5 rounded border border-zinc-700 group hover:border-zinc-500 transition-colors cursor-pointer select-none"
            >
              <span className="font-mono">{pattern}</span>
              <button
                type="button"
                onClick={() => startEditing(index)}
                aria-label={`パターン ${pattern} を編集`}
                className="text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
              >
                <Edit2 size={10} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(index)
                }}
                disabled={disabled}
                aria-label={`パターン ${pattern} を削除`}
                className="text-zinc-500 hover:text-rose-400 p-0.5 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          )
        })}

        <div className="flex-1 flex items-center min-w-[140px]">
          <input
            type="text"
            placeholder={patterns.length === 0 ? placeholder : 'パターン追加...'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            className="bg-transparent text-xs text-zinc-200 outline-none w-full"
          />
        </div>
      </div>
    </div>
  )
}
