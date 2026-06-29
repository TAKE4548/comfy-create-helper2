import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Pencil, Trash2, Check, Loader2, Plus } from 'lucide-react'
import { loraCategoriesApi, tagsetCategoriesApi } from '../api/client'
import type { Category } from '../api/types'

interface CategoryManagerModalProps {
  type: 'lora' | 'tagset'
  onClose: () => void
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ type, onClose }) => {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isLora = type === 'lora'
  const api = isLora ? loraCategoriesApi : tagsetCategoriesApi
  const queryKey = isLora ? ['lora-categories'] : ['tagset-categories']
  
  // Design configuration based on type
  const accentColorClass = isLora ? 'text-accent-green' : 'text-[#7C6FDD]'
  const accentBgClass = isLora ? 'bg-accent-green' : 'bg-[#7C6FDD]'
  const focusBorderClass = isLora ? 'focus:border-accent-green/40' : 'focus:border-[#7C6FDD]/40'

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey,
    queryFn: () => api.list() as Promise<Category[]>,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.create(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setNewCatName('')
      setError(null)
    },
    onError: (err: any) => {
      setError(err.message || '作成に失敗しました')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.update(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      setEditingId(null)
      setEditingName('')
      setError(null)
    },
    onError: (err: any) => {
      setError(err.message || '更新に失敗しました')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      // If we are editing the deleted category, reset edit state
      setEditingId(null)
      setError(null)
    },
    onError: (err: any) => {
      setError(err.message || '削除に失敗しました')
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    createMutation.mutate(newCatName.trim())
  }

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
    setError(null)
  }

  const handleSaveEdit = (id: number) => {
    if (!editingName.trim()) return
    updateMutation.mutate({ id, name: editingName.trim() })
  }

  const handleDelete = (id: number, name: string) => {
    if (confirm(`カテゴリ「${name}」を削除しますか？\n※このカテゴリに属するアイテムのカテゴリ設定は解除されます。`)) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="relative w-full max-w-md rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface p-6 shadow-2xl flex flex-col max-h-full lg:max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.06)]">
          <h3 className="text-base font-semibold text-zinc-100">
            {isLora ? 'LoRAカテゴリ管理' : 'タグセットカテゴリ管理'}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-zinc-400" size={24} />
            </div>
          ) : categories && categories.length > 0 ? (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface-2 group transition-all"
              >
                {editingId === cat.id ? (
                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className={`flex-1 bg-surface border border-[rgba(255,255,255,0.1)] rounded-md px-2 py-1 text-sm text-zinc-200 focus:outline-none ${focusBorderClass}`}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(cat.id)
                        else if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button
                      onClick={() => handleSaveEdit(cat.id)}
                      className={`p-1.5 rounded-md bg-surface border border-[rgba(255,255,255,0.06)] ${accentColorClass} hover:bg-zinc-800`}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 rounded-md bg-surface border border-[rgba(255,255,255,0.06)] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span 
                      className="text-sm text-zinc-300 px-2 py-1 cursor-pointer hover:text-zinc-100 flex-1"
                      onClick={() => handleStartEdit(cat)}
                    >
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(cat)}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                        title="編集"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id, cat.name)}
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500 text-center py-6">カテゴリが登録されていません</p>
          )}
        </div>

        {/* Add Form */}
        <form onSubmit={handleCreate} className="pt-4 border-t border-[rgba(255,255,255,0.06)] space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="新しいカテゴリ名を入力"
              className={`flex-1 bg-surface-2 border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none ${focusBorderClass}`}
            />
            <button
              type="submit"
              disabled={!newCatName.trim() || createMutation.isPending}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg font-medium text-sm text-zinc-950 transition-all ${accentBgClass} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              追加
            </button>
          </div>
          {error && <p className="text-xs text-red-400 animate-fade-in">{error}</p>}
        </form>

      </div>
    </div>
  )
}
