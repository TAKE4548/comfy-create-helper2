import { useState, useMemo } from 'react'
import { Search, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { Lora, TagSet } from '../../../api/types'
import type { AppliedAsset } from '../../../store/useGenerationStore'

export interface AddAssetModalProps {
  role: string
  loras?: Lora[]
  tagSets?: TagSet[]
  onClose: () => void
  addAppliedAsset: (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => void
  setRoleCollapsed: (role: string, collapsed: boolean) => void
}

interface LoraConfig {
  strength: number
  triggerSetId: number | 'default'
  insertLoadTag: boolean
}

export const AddAssetModal = ({
  role,
  loras = [],
  tagSets = [],
  onClose,
  addAppliedAsset,
  setRoleCollapsed,
}: AddAssetModalProps) => {
  const [activeTab, setActiveTab] = useState<'lora' | 'tagset'>('lora')
  const [searchQuery, setSearchQuery] = useState('')

  // 選択されたアセットのステート
  const [selectedLoras, setSelectedLoras] = useState<Map<number, LoraConfig>>(new Map())
  const [selectedTagSets, setSelectedTagSets] = useState<Map<number, { selectedSubsetId: number | 'all' }>>(new Map())

  // 詳細設定展開中のLoRA IDリスト
  const [expandedLoras, setExpandedLoras] = useState<Set<number>>(new Set())

  // LoRAのデフォルト値決定
  const getInitialLoraConfig = (lora: Lora): LoraConfig => {
    const min = lora.recommended_strength_min
    const max = lora.recommended_strength_max
    let strength = 1.0
    if (min != null && max != null) strength = Math.round(((min + max) / 2) * 10) / 10
    else if (min != null) strength = min
    else if (max != null) strength = max

    const triggerSetId = lora.trigger_word_sets?.length ? lora.trigger_word_sets[0].id : 'default'

    return {
      strength,
      triggerSetId,
      insertLoadTag: true,
    }
  }

  // フィルタリング処理（大文字小文字区別なし）
  const query = searchQuery.toLowerCase().trim()

  const filteredLoras = useMemo(() => {
    if (!query) return loras
    return loras.filter((lora) => {
      const nameMatch = lora.model_name.toLowerCase().includes(query)
      const descMatch = lora.description?.toLowerCase().includes(query) ?? false
      const tagsMatch = lora.trigger_word_sets?.some((set) =>
        set.words.some((word) => word.toLowerCase().includes(query))
      ) ?? false
      return nameMatch || descMatch || tagsMatch
    })
  }, [loras, query])

  const filteredTagSets = useMemo(() => {
    if (!query) return tagSets
    return tagSets.filter((ts) => {
      const nameMatch = ts.name.toLowerCase().includes(query)
      const descMatch = ts.description?.toLowerCase().includes(query) ?? false
      const tagsMatch = ts.tags?.some((tag) => tag.toLowerCase().includes(query)) ?? false
      return nameMatch || descMatch || tagsMatch
    })
  }, [tagSets, query])

  // 選択トグル
  const handleToggleLora = (lora: Lora) => {
    const next = new Map(selectedLoras)
    if (next.has(lora.id)) {
      next.delete(lora.id)
      // 選択解除時は詳細展開も閉じる
      const nextExpanded = new Set(expandedLoras)
      nextExpanded.delete(lora.id)
      setExpandedLoras(nextExpanded)
    } else {
      next.set(lora.id, getInitialLoraConfig(lora))
      // 選択時に詳細展開をデフォルトで開く
      const nextExpanded = new Set(expandedLoras)
      nextExpanded.add(lora.id)
      setExpandedLoras(nextExpanded)
    }
    setSelectedLoras(next)
  }

  const handleToggleTagSet = (ts: any) => {
    const next = new Map(selectedTagSets)
    if (next.has(ts.id)) {
      next.delete(ts.id)
    } else {
      next.set(ts.id, { selectedSubsetId: ts.subsets && ts.subsets.length > 0 ? ts.subsets[0].id : 'all' })
    }
    setSelectedTagSets(next)
  }

  // LoRA個別設定の更新
  const handleUpdateLoraConfig = (
    loraId: number,
    key: keyof LoraConfig,
    value: LoraConfig[keyof LoraConfig]
  ) => {
    const next = new Map(selectedLoras)
    const current = next.get(loraId)
    if (current) {
      next.set(loraId, { ...current, [key]: value })
      setSelectedLoras(next)
    }
  }

  const toggleExpandLora = (loraId: number) => {
    const next = new Set(expandedLoras)
    if (next.has(loraId)) {
      next.delete(loraId)
    } else {
      next.add(loraId)
    }
    setExpandedLoras(next)
  }

  // 適用処理
  const handleApply = () => {
    // LoRAの適用
    selectedLoras.forEach((config, loraId) => {
      const lora = loras.find((l) => l.id === loraId)
      if (!lora) return

      const path = lora.file_path || lora.model_name || ''
      const filename = path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || 'lora'

      let twsWords: string[] = []
      if (config.triggerSetId !== 'default') {
        const selectedSet = lora.trigger_word_sets?.find((s) => s.id === config.triggerSetId)
        if (selectedSet) twsWords = selectedSet.words
      }

      const loraPromptString = config.insertLoadTag
        ? `<lora:${filename}:${config.strength.toFixed(1)}>`
        : undefined

      addAppliedAsset(role, {
        type: 'lora',
        assetId: lora.id,
        name: lora.description || filename,
        tags: twsWords,
        loraPromptString,
      })
    })

    // TagSetの適用
    selectedTagSets.forEach((config, tsId) => {
      const ts = tagSets.find((t) => t.id === tsId)
      if (!ts) return

      let tagsToApply = ts.tags || []
      let appliedName = ts.name
      
      if (config.selectedSubsetId !== 'all') {
        const subset = (ts as any).subsets?.find((s: any) => s.id === config.selectedSubsetId)
        if (subset) {
          tagsToApply = subset.tags || []
          appliedName = `${ts.name} (${subset.name})`
        }
      }

      addAppliedAsset(role, {
        type: 'tagset',
        assetId: ts.id,
        name: appliedName,
        tags: tagsToApply,
      })
    })

    setRoleCollapsed(role, false)
    onClose()
  }

  const totalSelectedCount = selectedLoras.size + selectedTagSets.size

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
      <div className="bg-surface border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-left">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <div>
            <h2 className="text-base font-bold text-zinc-150">アセットの追加</h2>
            <p className="text-xs text-zinc-550 mt-0.5">対象ロール: <span className="text-accent-green font-semibold">{role}</span></p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] text-zinc-450 hover:text-white hover:bg-white/5 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="p-6 pb-3 border-b border-[rgba(255,255,255,0.04)] space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              placeholder="アセット名、説明、またはタグで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-[rgba(255,255,255,0.08)] rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-accent-green/50 placeholder-zinc-500"
            />
          </div>

          <div className="flex border-b border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={() => setActiveTab('lora')}
              className={`flex-1 text-center pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'lora'
                  ? 'border-accent-green text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              LoRA ({filteredLoras.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tagset')}
              className={`flex-1 text-center pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                activeTab === 'tagset'
                  ? 'border-[#7C6FDD] text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              タグセット ({filteredTagSets.length})
            </button>
          </div>
        </div>

        {/* Asset List Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar min-h-[250px]">
          {activeTab === 'lora' ? (
            filteredLoras.length > 0 ? (
              filteredLoras.map((lora) => {
                const isSelected = selectedLoras.has(lora.id)
                const config = selectedLoras.get(lora.id)
                const isExpanded = expandedLoras.has(lora.id)

                return (
                  <div
                    key={lora.id}
                    className={`border rounded-xl transition-all ${
                      isSelected
                        ? 'border-accent-green/40 bg-accent-green/5'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/30 hover:bg-surface-2/50'
                    }`}
                  >
                    {/* Item Row */}
                    <div className="flex items-start gap-3 p-4 cursor-pointer" onClick={() => handleToggleLora(lora)}>
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleLora(lora)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-accent-green border-accent-green text-background'
                              : 'border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-zinc-200 truncate">
                            {lora.description || lora.model_name.split('/').pop()?.replace('.safetensors', '')}
                          </h4>
                          {isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpandLora(lora.id)
                              }}
                              className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">{lora.model_name}</p>

                        {/* Trigger Words Preview */}
                        {lora.trigger_word_sets && lora.trigger_word_sets.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {lora.trigger_word_sets[0].words.slice(0, 3).map((w, idx) => (
                              <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                                {w}
                              </span>
                            ))}
                            {lora.trigger_word_sets[0].words.length > 3 && (
                              <span className="text-[9px] text-zinc-555 self-center">
                                +{lora.trigger_word_sets[0].words.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expandable Configuration Area */}
                    {isSelected && isExpanded && config && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] bg-black/20 p-4 space-y-4 text-xs text-zinc-300">
                        {/* Load Tag Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={config.insertLoadTag}
                            onChange={(e) => handleUpdateLoraConfig(lora.id, 'insertLoadTag', e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-zinc-850 accent-accent-green cursor-pointer"
                          />
                          <span>LoRAロードタグ（&lt;lora:...&gt;）を挿入する</span>
                        </label>

                        {/* Strength Slider */}
                        {config.insertLoadTag && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[11px] text-zinc-400">
                              <span>推奨強度</span>
                              <span className="font-semibold text-accent-green font-mono">{config.strength.toFixed(1)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min="0.0"
                                max="2.0"
                                step="0.1"
                                value={config.strength}
                                onChange={(e) => handleUpdateLoraConfig(lora.id, 'strength', parseFloat(e.target.value))}
                                className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-accent-green"
                              />
                            </div>
                          </div>
                        )}

                        {/* Trigger Word Set Selection */}
                        {lora.trigger_word_sets && lora.trigger_word_sets.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] text-zinc-400">トリガーワードセット</span>
                            <div className="space-y-1">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name={`tws-${lora.id}`}
                                  checked={config.triggerSetId === 'default'}
                                  onChange={() => handleUpdateLoraConfig(lora.id, 'triggerSetId', 'default')}
                                  className="accent-accent-green cursor-pointer"
                                />
                                <span>トリガーワードなし（デフォルト）</span>
                              </label>

                              {lora.trigger_word_sets.map((set) => (
                                <label key={set.id} className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="radio"
                                    name={`tws-${lora.id}`}
                                    checked={config.triggerSetId === set.id}
                                    onChange={() => handleUpdateLoraConfig(lora.id, 'triggerSetId', set.id)}
                                    className="accent-accent-green cursor-pointer"
                                  />
                                  <span className="truncate">
                                    {set.name} ({set.words.join(', ')})
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-zinc-550 text-center py-8">LoRAが見つかりませんでした。</p>
            )
          ) : (
            filteredTagSets.length > 0 ? (
              filteredTagSets.map((ts) => {
                const isSelected = selectedTagSets.has(ts.id)
                const config = selectedTagSets.get(ts.id)
                const hasSubsets = (ts as any).subsets && (ts as any).subsets.length > 0
                return (
                  <div
                    key={ts.id}
                    onClick={() => handleToggleTagSet(ts)}
                    className={`flex flex-col gap-3 p-4 border rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#7C6FDD]/40 bg-[#7C6FDD]/5'
                        : 'border-[rgba(255,255,255,0.06)] bg-surface-2/30 hover:bg-surface-2/50'
                    }`}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleTagSet(ts)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-[#7C6FDD] border-[#7C6FDD] text-white'
                              : 'border-zinc-700 hover:border-zinc-500'
                          }`}
                        >
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-zinc-200 truncate">{ts.name}</h4>
                        {ts.description && (
                          <p className="text-[10px] text-zinc-450 mt-1 line-clamp-2">{ts.description}</p>
                        )}
                        {ts.tags && ts.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {ts.tags.slice(0, 5).map((tag, idx) => (
                              <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                                {tag}
                              </span>
                            ))}
                            {ts.tags.length > 5 && (
                              <span className="text-[9px] text-zinc-555 self-center">
                                +{ts.tags.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Subsets Selection UI */}
                    {isSelected && hasSubsets && config && (
                      <div className="mt-2 pl-8 border-t border-[rgba(255,255,255,0.06)] pt-3 w-full" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[11px] text-zinc-400 block mb-1.5 font-medium">適用するバリエーション</span>
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300">
                            <input
                              type="radio"
                              name={`subset-${ts.id}`}
                              checked={config.selectedSubsetId === 'all'}
                              onChange={() => {
                                const next = new Map(selectedTagSets)
                                next.set(ts.id, { selectedSubsetId: 'all' })
                                setSelectedTagSets(next)
                              }}
                              className="accent-[#7C6FDD] cursor-pointer"
                            />
                            <span>すべてのタグ ({ts.tags?.join(', ')})</span>
                          </label>

                          {(ts as any).subsets.map((sub: any) => (
                            <label key={sub.id} className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300">
                              <input
                                type="radio"
                                name={`subset-${ts.id}`}
                                checked={config.selectedSubsetId === sub.id}
                                onChange={() => {
                                  const next = new Map(selectedTagSets)
                                  next.set(ts.id, { selectedSubsetId: sub.id })
                                  setSelectedTagSets(next)
                                }}
                                className="accent-[#7C6FDD] cursor-pointer"
                              />
                              <span className="truncate">
                                {sub.name} ({sub.tags?.join(', ')})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-zinc-550 text-center py-8">タグセットが見つかりませんでした。</p>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(255,255,255,0.06)] bg-surface-2/50">
          <span className="text-xs text-zinc-450">
            {totalSelectedCount > 0 ? `${totalSelectedCount} 件のアセットを選択中` : 'アセット未選択'}
          </span>
          <div className="flex gap-3 font-medium">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface-2 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-white hover:bg-white/5 text-xs transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={totalSelectedCount === 0}
              className="px-4 py-2 rounded-lg bg-accent-green text-background hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold transition-all"
            >
              追加{totalSelectedCount > 0 && ` (${totalSelectedCount}件適用)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
