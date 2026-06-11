import React, { useState, useRef } from 'react'
import { X } from 'lucide-react'

interface TagChipInputProps {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  id?: string
  variant?: 'positive' | 'negative' | 'neutral'
}

export function TagChipInput({
  value,
  onChange,
  placeholder = '',
  id,
  variant = 'neutral'
}: TagChipInputProps) {
  const [inputValue, setInputValue] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parse tags from value
  const tags = value
    ? value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []

  const updateTags = (newTags: string[]) => {
    onChange(newTags.join(', '))
  }

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // If user enters comma, finalize the tag
    if (val.endsWith(',')) {
      const newTag = val.slice(0, -1).trim()
      if (newTag && !tags.includes(newTag)) {
        updateTags([...tags, newTag])
      }
      setInputValue('')
    } else {
      setInputValue(val)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const newTag = inputValue.trim()
      if (newTag) {
        if (!tags.includes(newTag)) {
          updateTags([...tags, newTag])
        }
        setInputValue('')
      }
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      // Remove last tag if input is empty
      updateTags(tags.slice(0, -1))
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    if (pastedText) {
      const pastedTags = pastedText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      
      if (pastedTags.length > 0) {
        const uniqueNewTags = pastedTags.filter((t) => !tags.includes(t))
        updateTags([...tags, ...uniqueNewTags])
        setInputValue('')
      }
    }
  }

  const removeTag = (indexToRemove: number) => {
    updateTags(tags.filter((_, idx) => idx !== indexToRemove))
  }

  // Determine styles based on variant
  let containerBorderClass = 'border-[rgba(255,255,255,0.08)] focus-within:border-zinc-700/60'
  let chipClass = 'bg-zinc-800 text-zinc-300 border-[rgba(255,255,255,0.06)] hover:bg-zinc-750'
  
  if (variant === 'positive') {
    containerBorderClass = 'border-[rgba(255,255,255,0.08)] focus-within:border-accent-green/40'
    chipClass = 'bg-accent-green/5 text-accent-green border-accent-green/20 hover:bg-accent-green/10'
  } else if (variant === 'negative') {
    containerBorderClass = 'border-[rgba(255,255,255,0.08)] focus-within:border-rose-500/40'
    chipClass = 'bg-rose-500/5 text-rose-355 border-rose-500/20 hover:bg-rose-500/10'
  }

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`flex flex-wrap gap-1.5 p-2 bg-surface-2/40 border rounded-lg min-h-[46px] transition-colors cursor-text hover:border-[rgba(255,255,255,0.15)] ${containerBorderClass}`}
    >
      {tags.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors select-none ${chipClass}`}
        >
          <span className="font-mono">{tag}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              removeTag(idx)
            }}
            className="p-0.5 rounded-full hover:bg-black/20 text-current/60 hover:text-current transition-colors"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-grow bg-transparent border-0 outline-none focus:ring-0 text-sm text-zinc-200 placeholder-zinc-600 min-w-[120px] py-0.5"
      />
    </div>
  )
}
