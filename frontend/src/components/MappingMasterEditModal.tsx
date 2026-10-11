import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Layers, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { stageMastersApi } from '../api/domains/stageMasters'
import { mappingGroupsApi } from '../api/domains/mappingGroups'
import { useComfyNodeTypes } from '../hooks/useComfyNodeTypes'
import type {
  MappingMasterV2,
  MappingMasterV2Create,
  MappingMasterV2Update,
  MappingGroupMaster,
  StageMaster,
  ParamTypeMaster,
  MappingVariantUpdateItem,
} from '../api/types'

export const COMMON_CLASS_CANDIDATES = [
  'PrimitiveStringMultiline',
  'BasicScheduler',
  'SamplerCustom',
  'KSampler',
  'FaceDetailerPipe',
  'UltimateSDUpscale',
] as const

export interface MappingMasterEditModalProps {
  isOpen: boolean
  onClose: () => void
  master: MappingMasterV2 | null
  groups?: MappingGroupMaster[]
  stages?: StageMaster[]
  paramTypeMasters?: ParamTypeMaster[]
  onSave: (data: MappingMasterV2Create | MappingMasterV2Update) => Promise<void> | void
  isPending?: boolean
}

interface VariantFormItem {
  id?: number
  stage_id: number
  stage_key: string
  stage_name: string
  stage_suffix: string
  is_enabled: boolean
  custom_role_override: string
  extra_title_patterns: string[]
}

const DEFAULT_INPUT_TYPES = [
  { id: 'textarea', name: 'textarea' },
  { id: 'int', name: 'int' },
  { id: 'float', name: 'float' },
  { id: 'select', name: 'select' },
  { id: 'lora_stack', name: 'lora_stack' },
  { id: 'select_sampler', name: 'select_sampler' },
  { id: 'select_scheduler', name: 'select_scheduler' },
  { id: 'boolean', name: 'boolean' },
]

export function MappingMasterEditModal({
  isOpen,
  onClose,
  master,
  groups: propGroups,
  stages: propStages,
  paramTypeMasters = [],
  onSave,
  isPending = false,
}: MappingMasterEditModalProps) {
  // Query fallback if props not supplied
  const { data: fetchedGroups = [] } = useQuery({
    queryKey: ['mapping-groups'],
    queryFn: () => mappingGroupsApi.list(true),
    enabled: isOpen && !propGroups,
  })
  const { data: fetchedStages = [] } = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list(true),
    enabled: isOpen && !propStages,
  })

  const groups = propGroups || fetchedGroups
  const stages = propStages || fetchedStages

  // Form State
  const [name, setName] = useState('')
  const [paramName, setParamName] = useState('')
  const [inputType, setInputType] = useState('textarea')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [classTypes, setClassTypes] = useState<string[]>([])
  const [titlePatterns, setTitlePatterns] = useState<string[]>([])
  const [inputClass, setInputClass] = useState('')
  const [inputPattern, setInputPattern] = useState('')
  const [variants, setVariants] = useState<VariantFormItem[]>([])
  const [showPreview, setShowPreview] = useState(true)

  // Sync state when master changes or opens
  useEffect(() => {
    if (!isOpen) return

    if (master) {
      setName(master.name || master.display_name || '')
      setParamName(master.param_name || '')
      setInputType(master.input_type || 'textarea')
      setGroupId(master.group_id ?? null)
      setClassTypes(master.expected_class_types || [])
      setTitlePatterns(master.base_title_patterns || master.title_patterns || [])

      // Map variants from master and merge with available stages
      const existingVariants = master.variants || []
      const mergedVariants: VariantFormItem[] = stages.map((st) => {
        const found = existingVariants.find((v) => v.stage_id === st.id || v.stage_key === st.key)
        return {
          id: found?.id,
          stage_id: st.id,
          stage_key: st.key,
          stage_name: st.name,
          stage_suffix: st.suffix || '',
          is_enabled: found ? found.is_enabled : true,
          custom_role_override: found?.custom_role_override || '',
          extra_title_patterns: found?.extra_title_patterns || [],
        }
      })
      setVariants(mergedVariants)
    } else {
      // Create mode
      setName('')
      setParamName('')
      setInputType('textarea')
      setGroupId(groups[0]?.id ?? null)
      setClassTypes([])
      setTitlePatterns([])
      setVariants(
        stages.map((st) => ({
          stage_id: st.id,
          stage_key: st.key,
          stage_name: st.name,
          stage_suffix: st.suffix || '',
          is_enabled: true,
          custom_role_override: '',
          extra_title_patterns: [],
        }))
      )
    }
  }, [isOpen, master, stages, groups])

  if (!isOpen) return null

  const { filterClassTypes, isLoading: isNodeTypesLoading, isError: isNodeTypesError } = useComfyNodeTypes()
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)

  const filteredCandidates = React.useMemo(() => {
    if (!inputClass.trim() || isNodeTypesLoading || isNodeTypesError) {
      return []
    }
    return filterClassTypes(inputClass, classTypes)
  }, [inputClass, classTypes, filterClassTypes, isNodeTypesLoading, isNodeTypesError])

  // Class Type Chip Handlers
  const addClassType = (typeToAdd: string) => {
    const trimmed = typeToAdd.trim()
    if (!trimmed) return
    if (!classTypes.includes(trimmed)) {
      setClassTypes([...classTypes, trimmed])
    }
    setInputClass('')
    setShowDropdown(false)
    setHighlightIndex(-1)
  }

  const removeClassType = (typeToRemove: string) => {
    setClassTypes(classTypes.filter((t) => t !== typeToRemove))
  }

  const handleClassKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && filteredCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev + 1) % filteredCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => (prev <= 0 ? filteredCandidates.length - 1 : prev - 1))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowDropdown(false)
        setHighlightIndex(-1)
        return
      }
      if (e.key === 'Tab') {
        if (highlightIndex >= 0 && filteredCandidates[highlightIndex]) {
          e.preventDefault()
          addClassType(filteredCandidates[highlightIndex])
          return
        }
      }
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (showDropdown && highlightIndex >= 0 && filteredCandidates[highlightIndex]) {
        addClassType(filteredCandidates[highlightIndex])
      } else {
        addClassType(inputClass)
      }
    }
  }

  // Pattern Chip Handlers
  const addPattern = (patternToAdd: string) => {
    const trimmed = patternToAdd.trim()
    if (!trimmed) return
    if (!titlePatterns.includes(trimmed)) {
      setTitlePatterns([...titlePatterns, trimmed])
    }
    setInputPattern('')
  }

  const removePattern = (patternToRemove: string) => {
    setTitlePatterns(titlePatterns.filter((p) => p !== patternToRemove))
  }

  const handlePatternKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addPattern(inputPattern)
    }
  }

  // Variant Toggles and Edits
  const toggleVariant = (stageId: number) => {
    setVariants(
      variants.map((v) => (v.stage_id === stageId ? { ...v, is_enabled: !v.is_enabled } : v))
    )
  }

  const updateVariantOverride = (stageId: number, override: string) => {
    setVariants(
      variants.map((v) =>
        v.stage_id === stageId ? { ...v, custom_role_override: override } : v
      )
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedParamName = paramName.trim()
    if (!trimmedName || !trimmedParamName) return

    const variantItems: MappingVariantUpdateItem[] = variants.map((v) => ({
      id: v.id,
      stage_id: v.stage_id,
      custom_role_override: v.custom_role_override.trim() || null,
      extra_title_patterns: v.extra_title_patterns.length > 0 ? v.extra_title_patterns : null,
      is_enabled: v.is_enabled,
    }))

    const payload: MappingMasterV2Create | MappingMasterV2Update = {
      name: trimmedName,
      display_name: trimmedName,
      param_name: trimmedParamName,
      input_type: inputType,
      group_id: groupId,
      expected_class_types: classTypes.length > 0 ? classTypes : null,
      base_title_patterns: titlePatterns.length > 0 ? titlePatterns : null,
      title_patterns: titlePatterns.length > 0 ? titlePatterns : null,
      variants: variantItems,
    }

    onSave(payload)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapping-master-edit-title"
    >
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers className="text-[#7C6FDD]" size={20} />
            <h2 id="mapping-master-edit-title" className="text-base font-semibold">
              {master ? `マッピングマスター編集: ${master.name || master.display_name}` : '新規マッピングマスター作成'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-zinc-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: 親共通設定 */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>親共通マスター設定</span>
              <span className="text-[10px] text-zinc-500 font-normal lowercase">(全バリアントへ継承)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  表示名 (Name) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: Positive Prompt"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-[#7C6FDD]"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  パラメータ名 (Param Name) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: text, steps, cfg"
                  value={paramName}
                  onChange={(e) => setParamName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-[#7C6FDD]"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">入力型 (Input Type)</label>
                <select
                  value={inputType}
                  onChange={(e) => setInputType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-[#7C6FDD]"
                >
                  <optgroup label="標準型">
                    {DEFAULT_INPUT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                  {paramTypeMasters.length > 0 && (
                    <optgroup label="カスタム型">
                      {paramTypeMasters.map((pt) => (
                        <option key={pt.id} value={pt.name}>
                          {pt.name} ({pt.widget_type})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">大カテゴリグループ</label>
                <select
                  value={groupId ?? ''}
                  onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-[#7C6FDD]"
                >
                  <option value="">(グループなし)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.key})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: 期待 Class Types チップ入力 & 代表的候補パレット */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs text-zinc-400">
                期待 Class Types (Expected Class Types)
              </label>
              <span className="text-[11px] text-zinc-500">Enter またはカンマで追加</span>
            </div>

            <div className="relative">
              <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-900 rounded-lg border border-zinc-800 min-h-[42px]">
                {classTypes.map((type) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1 bg-[#7C6FDD]/20 text-[#7C6FDD] text-xs px-2 py-0.5 rounded"
                  >
                    {type}
                    <button
                      type="button"
                      onClick={() => removeClassType(type)}
                      className="hover:text-white"
                      aria-label={`${type} を削除`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder="クラス名を入力してEnter..."
                  value={inputClass}
                  onChange={(e) => {
                    setInputClass(e.target.value)
                    setShowDropdown(true)
                    setHighlightIndex(-1)
                  }}
                  onFocus={() => {
                    if (inputClass.trim()) setShowDropdown(true)
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowDropdown(false), 150)
                  }}
                  onKeyDown={handleClassKeyDown}
                  className="bg-transparent text-xs text-zinc-200 outline-none flex-1 min-w-[140px]"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && filteredCandidates.length > 0 && (
                <ul
                  data-testid="classtype-autocomplete-dropdown"
                  className="absolute left-0 right-0 top-full mt-1 z-20 max-h-60 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 text-xs list-none"
                >
                  {filteredCandidates.map((candidate, idx) => (
                    <li
                      key={candidate}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        addClassType(candidate)
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      className={`px-3 py-1.5 cursor-pointer transition-colors flex items-center justify-between ${
                        idx === highlightIndex
                          ? 'bg-[#7C6FDD]/20 text-[#7C6FDD] font-medium'
                          : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span>{candidate}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 代表的候補クラスパレット */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-zinc-400 pt-1">
              <span className="text-zinc-500 text-[11px]">💡 候補クラス:</span>
              {COMMON_CLASS_CANDIDATES.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => addClassType(candidate)}
                  className="px-1.5 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors"
                >
                  + {candidate}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: 共通タイトル検索パターン */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs text-zinc-400">
                共通タイトル検索パターン (Base Title Patterns)
              </label>
              <span className="text-[11px] text-zinc-500">Enter またはカンマで追加</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-900 rounded-lg border border-zinc-800 min-h-[42px]">
              {titlePatterns.map((pat) => (
                <span
                  key={pat}
                  className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-200 text-xs px-2 py-0.5 rounded border border-zinc-700"
                >
                  {pat}
                  <button
                    type="button"
                    onClick={() => removePattern(pat)}
                    className="hover:text-white"
                    aria-label={`${pat} を削除`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="検索パターン (例: positive, sampler)..."
                value={inputPattern}
                onChange={(e) => setInputPattern(e.target.value)}
                onKeyDown={handlePatternKeyDown}
                className="bg-transparent text-xs text-zinc-200 outline-none flex-1 min-w-[140px]"
              />
            </div>
          </div>

          {/* Section 4: バリアント一覧リスト (全ステージ) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  ステージバリアント設定
                </h3>
                <p className="text-[11px] text-zinc-500">
                  親のClass TypesおよびBase Patternsは自動継承されます。ステージ毎に有効/無効やRoleの上書きを指定できます。
                </p>
              </div>
            </div>

            <div className="border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-800 bg-zinc-950/60">
              {variants.map((v) => {
                const computedRole = v.custom_role_override.trim()
                  ? v.custom_role_override.trim()
                  : `${paramName || 'param'}${v.stage_suffix}`

                return (
                  <div
                    key={v.stage_id}
                    className={`p-3 flex items-center justify-between gap-4 transition-colors ${
                      !v.is_enabled ? 'opacity-50 bg-zinc-950/80' : 'hover:bg-zinc-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={v.is_enabled}
                          onChange={() => toggleVariant(v.stage_id)}
                          className="rounded border-zinc-700 text-[#7C6FDD] focus:ring-0"
                        />
                        <span className="text-xs font-medium text-zinc-200">{v.stage_name}</span>
                      </label>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {v.stage_suffix || '(接尾辞なし)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-1 max-w-sm justify-end">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-[11px] text-zinc-500">導出Role:</span>
                        <span className="font-mono text-zinc-300 text-[11px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          {computedRole}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="Role上書き (任意)"
                        value={v.custom_role_override}
                        onChange={(e) => updateVariantOverride(v.stage_id, e.target.value)}
                        disabled={!v.is_enabled}
                        className="w-32 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 outline-none focus:border-[#7C6FDD] disabled:opacity-50"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 5: リアルタイム合致プレビュー */}
          <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40 space-y-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="w-full flex items-center justify-between text-xs font-medium text-zinc-300"
            >
              <div className="flex items-center gap-1.5 text-[#7C6FDD]">
                <Sparkles size={14} />
                <span>リアルタイム合致プレビュー (SSoT Inheritance Check)</span>
              </div>
              {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showPreview && (
              <div className="pt-2 text-[11px] text-zinc-400 space-y-1.5 border-t border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">合致対象クラス:</span>
                  <span className="text-zinc-200 font-mono">
                    {classTypes.length > 0 ? classTypes.join(', ') : '(全クラス対象)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">継承タイトルパターン:</span>
                  <span className="text-zinc-200 font-mono">
                    {titlePatterns.length > 0 ? titlePatterns.join(', ') : '(パターン未指定)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">有効ステージバリアント数:</span>
                  <span className="text-zinc-200 font-bold">
                    {variants.filter((v) => v.is_enabled).length} / {variants.length}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !paramName.trim() || isPending}
              className="px-5 py-2 text-xs bg-[#7C6FDD] text-white font-medium rounded-lg hover:bg-[#6d62cc] transition-colors disabled:opacity-50"
            >
              {isPending ? '保存中...' : 'マスターを保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
