import React, { useState } from 'react'
import type { Category } from '../../api/types'
import { Check, X, Loader2 } from 'lucide-react'

export interface CategorySelectProps {
  value: number | undefined
  onChange: (categoryId: number | undefined) => void
  categories: Category[]
  onCategoryCreated: (cat: Category) => void
  apiCreateFn: (name: string) => Promise<Category>
  accentClass?: string // e.g. 'accent-green' | '[#7C6FDD]'
  id?: string
}

export const CategorySelect: React.FC<CategorySelectProps> = ({
  value,
  onChange,
  categories,
  onCategoryCreated,
  apiCreateFn,
  accentClass = 'accent-green',
  id,
}) => {
  const [isCreating, setIsCreating] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__new__') {
      setIsCreating(true)
      setError(null)
    } else {
      onChange(val ? Number(val) : undefined)
    }
  }

  const handleCreate = async () => {
    if (!newCategoryName.trim()) {
      setError('カテゴリ名を入力してください')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const newCat = await apiCreateFn(newCategoryName.trim())
      onCategoryCreated(newCat)
      onChange(newCat.id)
      setNewCategoryName('')
      setIsCreating(false)
    } catch (err: any) {
      setError(err.message || '作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setIsCreating(false)
    setNewCategoryName('')
    setError(null)
  }

  // Determine dynamic classes based on accent
  const focusBorderClass = accentClass.includes('[#7C6FDD]') 
    ? 'focus:border-[#7C6FDD]/40' 
    : 'focus:border-accent-green/40'
  const textAccentClass = accentClass.includes('[#7C6FDD]')
    ? 'text-[#7C6FDD]'
    : 'text-accent-green'
  const bgAccentHoverClass = accentClass.includes('[#7C6FDD]')
    ? 'hover:bg-[#7C6FDD]/20'
    : 'hover:bg-accent-green/20'

  if (isCreating) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 animate-fade-in">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreate()
              } else if (e.key === 'Escape') {
                handleCancel()
              }
            }}
            placeholder="新規カテゴリ名"
            disabled={loading}
            className={`flex-1 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none ${focusBorderClass}`}
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className={`p-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.08)] ${textAccentClass} ${bgAccentHoverClass} disabled:opacity-50 transition-all`}
            title="追加"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="p-1.5 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.08)] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50 transition-all"
            title="キャンセル"
          >
            <X size={15} />
          </button>
        </div>
        {error && <p className="text-xs text-red-400 pl-1 animate-fade-in">{error}</p>}
      </div>
    )
  }

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={handleSelectChange}
      className={`w-full bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none ${focusBorderClass}`}
    >
      <option value="">None</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new__" className={textAccentClass}>
        新規カテゴリを追加
      </option>
    </select>
  )
}
