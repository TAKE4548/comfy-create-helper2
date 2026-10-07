import React, { useState, useEffect, useMemo } from 'react'
import type { OutfitMasterPreset } from '../../../api/types'
import { datasetApi } from '../../../api/client'
import { X, Plus, Check, Loader2 } from 'lucide-react'

export interface OutfitMasterModalProps {
  isOpen: boolean
  onClose: () => void
  selectedOutfitIds: number[]
  onSelectOutfits: (outfits: OutfitMasterPreset[]) => void
}

export function distributeAltOutfits(
  selectedOutfits: OutfitMasterPreset[],
  altSlotCount: number = 5
): OutfitMasterPreset[] {
  if (selectedOutfits.length === 0) return []
  const result: OutfitMasterPreset[] = []
  for (let i = 0; i < altSlotCount; i++) {
    result.push(selectedOutfits[i % selectedOutfits.length])
  }
  return result
}

export const OutfitMasterModal: React.FC<OutfitMasterModalProps> = ({
  isOpen,
  onClose,
  selectedOutfitIds,
  onSelectOutfits,
}) => {
  const [presets, setPresets] = useState<OutfitMasterPreset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>(selectedOutfitIds)
  const [activeCategory, setActiveCategory] = useState<string>('all')

  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState('custom')
  const [customTags, setCustomTags] = useState('')
  const [isAddingCustom, setIsAddingCustom] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(selectedOutfitIds)
      setIsLoading(true)
      datasetApi
        .getOutfitMasters()
        .then((data) => {
          setPresets(data || [])
        })
        .catch((err) => {
          console.error('Failed to load outfit masters:', err)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen, selectedOutfitIds])

  const categories = useMemo(() => {
    const cats = Array.from(new Set(presets.map((p) => p.category)))
    return ['all', ...cats]
  }, [presets])

  const filteredPresets = useMemo(() => {
    if (activeCategory === 'all') return presets
    return presets.filter((p) => p.category === activeCategory)
  }, [presets, activeCategory])

  const toggleSelect = (preset: OutfitMasterPreset) => {
    setSelectedIds((prev) =>
      prev.includes(preset.id)
        ? prev.filter((id) => id !== preset.id)
        : [...prev, preset.id]
    )
  }

  const handleApply = () => {
    const selected = presets.filter((p) => selectedIds.includes(p.id))
    onSelectOutfits(selected)
    onClose()
  }

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customName.trim() || !customTags.trim()) return

    const newPreset: OutfitMasterPreset = {
      id: Date.now(),
      name: customName.trim(),
      category: customCategory.trim() || 'custom',
      prompt_tags: customTags.trim(),
      is_builtin: false,
    }

    setPresets((prev) => [...prev, newPreset])
    setSelectedIds((prev) => [...prev, newPreset.id])
    setCustomName('')
    setCustomTags('')
    setIsAddingCustom(false)
  }

  if (!isOpen) return null

  return (
    <div
      data-testid="outfit-master-modal-backdrop"
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        data-testid="outfit-master-modal"
        className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              別衣装マスタライブラリ
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              直交マトリクス25%別衣装枠（全20件中5件）に均等配分する衣装プリセットを選択してください
            </p>
          </div>
          <button
            type="button"
            data-testid="close-modal-button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800/80 bg-zinc-950/40 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              data-testid={`category-tab-${cat}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat === 'all' ? 'すべて' : cat}
            </button>
          ))}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-zinc-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>プリセット読み込み中...</span>
            </div>
          ) : filteredPresets.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">
              利用可能な別衣装プリセットがありません
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const isSelected = selectedIds.includes(preset.id)
              return (
                <div
                  key={preset.id}
                  data-testid={`preset-item-${preset.id}`}
                  onClick={() => toggleSelect(preset)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500/80 text-zinc-100'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    data-testid={`checkbox-outfit-${preset.id}`}
                    checked={isSelected}
                    onChange={() => {}}
                    className="mt-1 h-4 w-4 rounded border-zinc-700 text-indigo-600 focus:ring-indigo-500 bg-zinc-900 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-zinc-100">
                        {preset.name}
                      </span>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        {preset.category}
                      </span>
                      {preset.is_builtin && (
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                          内蔵
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-1 break-words line-clamp-2">
                      {preset.prompt_tags}
                    </p>
                  </div>
                </div>
              )
            })
          )}

          <div className="pt-2">
            {!isAddingCustom ? (
              <button
                type="button"
                data-testid="toggle-add-custom-button"
                onClick={() => setIsAddingCustom(true)}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                新規カスタム衣装を追加
              </button>
            ) : (
              <form
                onSubmit={handleAddCustom}
                data-testid="custom-outfit-form"
                className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-3"
              >
                <div className="text-xs font-semibold text-zinc-300">
                  新規カスタム別衣装
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    data-testid="custom-outfit-name-input"
                    placeholder="衣装名"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    data-testid="custom-outfit-category-input"
                    placeholder="カテゴリ"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2.5 py-1.5 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <textarea
                  data-testid="custom-outfit-tags-input"
                  placeholder="プロンプトタグ"
                  value={customTags}
                  onChange={(e) => setCustomTags(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded p-2 focus:border-indigo-500 focus:outline-none font-mono"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="px-3 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    data-testid="save-custom-outfit-button"
                    disabled={!customName.trim() || !customTags.trim()}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white rounded text-xs font-medium transition-colors"
                  >
                    追加
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
          <div className="text-xs text-zinc-400">
            選択中:{' '}
            <span className="font-bold text-indigo-400">
              {selectedIds.length}件
            </span>{' '}
            (5枠の別衣装スロットに均等配分)
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              data-testid="cancel-modal-button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              data-testid="apply-outfits-button"
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              保存・適用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
