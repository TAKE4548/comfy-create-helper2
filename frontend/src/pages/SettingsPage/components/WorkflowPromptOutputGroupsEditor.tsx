import { useMemo } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, X, Layers, AlertCircle, ArrowUpDown } from 'lucide-react'
import type {
  PromptTemplate,
  WorkflowMapping,
  WorkflowPromptTemplateConfig,
  PromptOutputGroup,
  PromptTemplateBlock,
} from '../../../api/types'

export interface WorkflowPromptOutputGroupsEditorProps {
  templates: PromptTemplate[]
  textareaMappings: WorkflowMapping[]
  config: WorkflowPromptTemplateConfig
  onChange: (nextConfig: WorkflowPromptTemplateConfig) => void
}

const inputCls =
  'w-full min-h-11 min-w-0 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD] focus:border-[#7C6FDD]/40'
const iconActionCls =
  'relative inline-flex touch-manipulation before:absolute before:-inset-2 min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FDD]'

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function WorkflowPromptOutputGroupsEditor({
  templates,
  textareaMappings,
  config,
  onChange,
}: WorkflowPromptOutputGroupsEditorProps) {
  const activeTemplate = useMemo(() => {
    if (!config.template_id) return null
    return templates.find((t) => t.id === config.template_id) || null
  }, [templates, config.template_id])

  const structure = config.template_snapshot || activeTemplate?.structure || null

  const allBlocksMap = useMemo(() => {
    const map = new Map<string, PromptTemplateBlock>()
    if (structure?.sections) {
      for (const section of structure.sections) {
        if (section.blocks) {
          for (const block of section.blocks) {
            map.set(block.id, block)
          }
        }
      }
    }
    return map
  }, [structure])

  const naturalBlockOrder = useMemo(() => {
    if (!structure?.sections) return []
    return structure.sections.flatMap((s) => s.blocks?.map((b) => b.id) || [])
  }, [structure])

  const handleTemplateChange = (templateIdStr: string) => {
    if (!templateIdStr) {
      onChange({
        template_id: null,
        template_snapshot: null,
        output_groups: [],
      })
      return
    }
    const templateId = Number(templateIdStr)
    const selected = templates.find((t) => t.id === templateId)
    if (!selected) return

    const snapshot = JSON.parse(JSON.stringify(selected.structure || { sections: [] }))
    const allBlockIds = snapshot.sections?.flatMap((s: any) => s.blocks?.map((b: any) => b.id) || []) || []

    const initialGroups: PromptOutputGroup[] =
      config.output_groups && config.output_groups.length > 0
        ? config.output_groups
        : [
            {
              id: generateId(),
              name: 'メインプロンプト',
              target_role: textareaMappings[0]?.role ?? '',
              block_ids: allBlockIds,
              repeat_filter: { mode: 'all' },
            },
          ]

    onChange({
      template_id: selected.id,
      template_snapshot: snapshot,
      output_groups: initialGroups,
    })
  }

  const addOutputGroup = () => {
    const newGroup: PromptOutputGroup = {
      id: generateId(),
      name: `出力グループ ${config.output_groups.length + 1}`,
      target_role: textareaMappings[0]?.role ?? '',
      block_ids: [...naturalBlockOrder],
      repeat_filter: { mode: 'all' },
    }
    onChange({
      ...config,
      output_groups: [...config.output_groups, newGroup],
    })
  }

  const removeOutputGroup = (groupIdx: number) => {
    onChange({
      ...config,
      output_groups: config.output_groups.filter((_, i) => i !== groupIdx),
    })
  }

  const updateOutputGroup = (groupIdx: number, patch: Partial<PromptOutputGroup>) => {
    onChange({
      ...config,
      output_groups: config.output_groups.map((g, i) =>
        i === groupIdx ? { ...g, ...patch } : g
      ),
    })
  }

  const toggleBlockInGroup = (groupIdx: number, blockId: string) => {
    const group = config.output_groups[groupIdx]
    if (!group) return
    const exists = group.block_ids.includes(blockId)
    const nextBlockIds = exists
      ? group.block_ids.filter((id) => id !== blockId)
      : [...group.block_ids, blockId]
    updateOutputGroup(groupIdx, { block_ids: nextBlockIds })
  }

  const selectAllBlocksInSection = (groupIdx: number, sectionBlockIds: string[]) => {
    const group = config.output_groups[groupIdx]
    if (!group) return
    const set = new Set(group.block_ids)
    for (const bId of sectionBlockIds) {
      set.add(bId)
    }
    updateOutputGroup(groupIdx, { block_ids: Array.from(set) })
  }

  const deselectAllBlocksInSection = (groupIdx: number, sectionBlockIds: string[]) => {
    const group = config.output_groups[groupIdx]
    if (!group) return
    const removeSet = new Set(sectionBlockIds)
    const nextBlockIds = group.block_ids.filter((id) => !removeSet.has(id))
    updateOutputGroup(groupIdx, { block_ids: nextBlockIds })
  }

  const moveBlockInGroup = (
    groupIdx: number,
    blockIdx: number,
    direction: 'up' | 'down'
  ) => {
    const group = config.output_groups[groupIdx]
    if (!group) return
    const targetIdx = direction === 'up' ? blockIdx - 1 : blockIdx + 1
    if (targetIdx < 0 || targetIdx >= group.block_ids.length) return
    const next = [...group.block_ids]
    const temp = next[blockIdx]
    next[blockIdx] = next[targetIdx]
    next[targetIdx] = temp
    updateOutputGroup(groupIdx, { block_ids: next })
  }

  const sortBlocksToSectionOrder = (groupIdx: number) => {
    const group = config.output_groups[groupIdx]
    if (!group) return
    const currentSet = new Set(group.block_ids)
    const sorted = naturalBlockOrder.filter((id) => currentSet.has(id))
    // Append any ids not in naturalBlockOrder at the end
    for (const id of group.block_ids) {
      if (!sorted.includes(id)) sorted.push(id)
    }
    updateOutputGroup(groupIdx, { block_ids: sorted })
  }

  // Calculate unassigned roles
  const assignedRoles = useMemo(() => {
    return new Set(config.output_groups.map((g) => g.target_role).filter(Boolean))
  }, [config.output_groups])

  const unassignedMappings = useMemo(() => {
    return textareaMappings.filter((m) => !assignedRoles.has(m.role || ''))
  }, [textareaMappings, assignedRoles])

  return (
    <div className="space-y-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface/20 p-4">
      <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
        <Layers size={16} className="text-[#7C6FDD]" />
        <h3 className="text-sm font-semibold text-zinc-200">
          プロンプト構造テンプレート・出力グループ設定
        </h3>
      </div>

      {/* Template Select */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-zinc-300">
          適用プロンプト構造テンプレート
        </label>
        <select
          aria-label="適用プロンプト構造テンプレート"
          value={config.template_id ? String(config.template_id) : ''}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className={inputCls}
        >
          <option value="">未適用 (従来の単一プロンプト入力)</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name} {tpl.is_builtin ? '(組込)' : ''}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-zinc-500">
          テンプレートを選択すると、複数ブロックに構造化されたプロンプト入力をワークフロー内の対象ノードへ結合送信できます。
        </p>
      </div>

      {/* Output Groups Editor if template is selected */}
      {config.template_id != null && structure && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              出力グループ一覧 ({config.output_groups.length}件)
            </span>
            <button
              type="button"
              onClick={addOutputGroup}
              className="flex items-center gap-1.5 min-h-11 px-3 py-1.5 rounded-lg bg-[#7C6FDD]/20 text-[#7C6FDD] hover:bg-[#7C6FDD]/30 border border-[#7C6FDD]/40 text-xs font-medium transition-colors"
            >
              <Plus size={15} />
              <span>出力グループを追加</span>
            </button>
          </div>

          {config.output_groups.length === 0 ? (
            <div className="p-4 rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
              出力グループがありません。「出力グループを追加」からプロンプトの送信先ノードを設定してください。
            </div>
          ) : (
            <div className="space-y-4">
              {config.output_groups.map((group, groupIdx) => (
                <div
                  key={group.id || groupIdx}
                  data-testid={`output-group-card-${groupIdx}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-3.5"
                >
                  {/* Header Row: Group Name & Delete */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        aria-label="出力グループ名"
                        value={group.name}
                        onChange={(e) =>
                          updateOutputGroup(groupIdx, { name: e.target.value })
                        }
                        placeholder="出力グループ名 (例: 全体プロンプト, アップスケール用)"
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOutputGroup(groupIdx)}
                      aria-label={`出力グループ削除 ${group.name}`}
                      className={iconActionCls}
                      title="グループを削除"
                    >
                      <Trash2 size={15} className="text-red-400 hover:text-red-300" />
                    </button>
                  </div>

                  {/* Target Role & Repeat Filter */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-zinc-300">
                        送信先プロンプトノード
                      </label>
                      <select
                        aria-label="送信先プロンプトノード"
                        value={group.target_role}
                        onChange={(e) =>
                          updateOutputGroup(groupIdx, { target_role: e.target.value })
                        }
                        className={inputCls}
                      >
                        <option value="">(未選択)</option>
                        {textareaMappings.map((m) => (
                          <option
                            key={m.node_id + (m.role || '')}
                            value={m.role || ''}
                          >
                            {m.display_name || m.role} (ノード: {m.node_id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-zinc-300">
                        Repeat対象
                      </label>
                      <div className="flex gap-2">
                        <select
                          aria-label="Repeat対象モード"
                          value={group.repeat_filter.mode}
                          onChange={(e) =>
                            updateOutputGroup(groupIdx, {
                              repeat_filter: {
                                ...group.repeat_filter,
                                mode: e.target.value as 'all' | 'index',
                              },
                            })
                          }
                          className={inputCls}
                        >
                          <option value="all">全インスタンスを結合</option>
                          <option value="index">特定インスタンスのみ結合</option>
                        </select>
                        {group.repeat_filter.mode === 'index' && (
                          <input
                            type="number"
                            aria-label="Repeatインスタンス番号"
                            min={1}
                            value={group.repeat_filter.index ?? 1}
                            onChange={(e) =>
                              updateOutputGroup(groupIdx, {
                                repeat_filter: {
                                  mode: 'index',
                                  index: Math.max(1, parseInt(e.target.value, 10) || 1),
                                },
                              })
                            }
                            className="w-24 min-h-11 min-w-0 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded-lg px-2 py-2 text-xs text-zinc-200"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Block Selection grouped by Sections */}
                  <div className="space-y-3 pt-1">
                    <label className="block text-xs font-medium text-zinc-300">
                      結合対象ブロックの選択
                    </label>

                    <div className="space-y-2">
                      {structure.sections?.map((sec) => {
                        const secBlockIds = sec.blocks?.map((b) => b.id) || []
                        return (
                          <div
                            key={sec.id}
                            className="rounded-lg border border-[rgba(255,255,255,0.04)] bg-surface-2/30 p-2.5 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-200">
                                  {sec.name}
                                </span>
                                {sec.is_repeatable && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/40 text-purple-300 border border-purple-700/50">
                                    Repeat可能
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    selectAllBlocksInSection(groupIdx, secBlockIds)
                                  }
                                  aria-label={`${sec.name} を全選択`}
                                  className="min-h-11 px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                >
                                  全選択
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    deselectAllBlocksInSection(groupIdx, secBlockIds)
                                  }
                                  aria-label={`${sec.name} を全解除`}
                                  className="min-h-11 px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                >
                                  全解除
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                              {sec.blocks?.map((blk) => {
                                const isChecked = group.block_ids.includes(blk.id)
                                return (
                                  <label
                                    key={blk.id}
                                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                      isChecked
                                        ? 'bg-[#7C6FDD]/10 border-[#7C6FDD]/40 text-zinc-200'
                                        : 'bg-surface/20 border-transparent text-zinc-400 hover:bg-surface/40'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      aria-label={`ブロック ${blk.label}`}
                                      checked={isChecked}
                                      onChange={() =>
                                        toggleBlockInGroup(groupIdx, blk.id)
                                      }
                                      className="rounded border-zinc-700 text-[#7C6FDD] focus:ring-[#7C6FDD]"
                                    />
                                    <span className="truncate">{blk.label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Selected Blocks Order Adjustment */}
                  <div className="space-y-2 pt-2 border-t border-zinc-900">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">
                        結合順序 (選択中: {group.block_ids.length}個)
                      </span>
                      <button
                        type="button"
                        onClick={() => sortBlocksToSectionOrder(groupIdx)}
                        className="flex items-center gap-1 min-h-11 px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        title="セクション内の定義順に並び替え"
                      >
                        <ArrowUpDown size={13} />
                        <span>セクション順に整列</span>
                      </button>
                    </div>

                    {group.block_ids.length === 0 ? (
                      <p className="text-[11px] text-zinc-500 italic">
                        ブロックが選択されていません。上のチェックボックスから選択してください。
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-surface/30 border border-zinc-800">
                        {group.block_ids.map((bId, bIdx) => {
                          const blockInfo = allBlocksMap.get(bId)
                          const label = blockInfo?.label || bId
                          return (
                            <div
                              key={bId + bIdx}
                              data-testid={`selected-block-${bId}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                            >
                              <span className="text-[10px] text-zinc-500 font-mono">
                                #{bIdx + 1}
                              </span>
                              <span>{label}</span>
                              <div className="inline-flex items-center gap-0.5 ml-1 border-l border-zinc-700 pl-1">
                                <button
                                  type="button"
                                  disabled={bIdx === 0}
                                  onClick={() =>
                                    moveBlockInGroup(groupIdx, bIdx, 'up')
                                  }
                                  aria-label={`ブロックを上へ ${label}`}
                                  className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 min-h-11 min-w-8 flex items-center justify-center"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={bIdx === group.block_ids.length - 1}
                                  onClick={() =>
                                    moveBlockInGroup(groupIdx, bIdx, 'down')
                                  }
                                  aria-label={`ブロックを下へ ${label}`}
                                  className="p-1 text-zinc-400 hover:text-white disabled:opacity-30 min-h-11 min-w-8 flex items-center justify-center"
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleBlockInGroup(groupIdx, bId)}
                                  aria-label={`ブロックを解除 ${label}`}
                                  className="p-1 text-red-400/70 hover:text-red-300 min-h-11 min-w-8 flex items-center justify-center"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Unassigned Roles Display (AC-4) */}
          <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-3 text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <AlertCircle size={14} className="text-amber-400" />
              <span>出力グループ未割り当てプロンプトノード (AC-4)</span>
            </div>
            {unassignedMappings.length === 0 ? (
              <p className="text-zinc-500">
                すべてのプロンプトノードが出力グループに割り当てられています。
              </p>
            ) : (
              <div className="space-y-1.5">
                <p className="text-zinc-400">
                  以下のノードはいずれの出力グループにも割り当てられていないため、生成画面では従来の単一入力欄として維持されます（例: ネガティブプロンプト等）:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {unassignedMappings.map((m) => (
                    <span
                      key={m.node_id + (m.role || '')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs"
                    >
                      <span className="font-semibold">{m.display_name || m.role}</span>
                      <span className="text-[10px] text-zinc-500">
                        (ノード {m.node_id})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
