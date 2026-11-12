import React, { useState, useMemo, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Filter,
  SlidersHorizontal,
} from 'lucide-react'
import type {
  Lora,
  PromptTemplateStructure,
  TagSet,
  WorkflowPromptTemplateConfig,
} from '../../../api/types'
import type { AppliedAsset } from '../../../store/useGenerationStore'
import { TagChipEditor } from '../../../components/TagChipEditor'
import type { TagChip } from '../../../components/TagChipEditor/useChipParser'
import { parseToChips, chipsToString } from '../../../components/TagChipEditor/useChipParser'
import { generateChipId } from '../../../components/TagChipEditor/idGenerator'
import { PromptSectionClipboardMenu } from './PromptSectionClipboardMenu'
import { AddAssetModal } from './AddAssetModal'
import {
  PROMPT_TEMPLATE_STATE_KEY,
  parsePresetState,
  serializePresetState,
  computeAllOutputGroupValues,
  formatEnabledBlockChips,
  type PromptTemplatePresetState,
  type PromptTemplateInstanceState,
} from '../../../utils/promptTemplateEngine'

export interface PromptTemplateSplitEditorProps {
  config: WorkflowPromptTemplateConfig
  structure: PromptTemplateStructure
  paramValues: Record<string, string>
  setParamValues: (values: Record<string, string>) => void
  loras?: Lora[]
  tagSets?: TagSet[]
  activeBaseModelId?: number | null
  addAppliedAsset: (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => void
  onOpenTranslation?: (targetKey: string, currentValue: string, onApplyText?: (newText: string) => void) => void
  onOpenSaveAsTagSet?: (label: string, currentValue: string) => void
}

export const PromptTemplateSplitEditor: React.FC<PromptTemplateSplitEditorProps> = ({
  config,
  structure,
  paramValues,
  setParamValues,
  loras = [],
  tagSets = [],
  activeBaseModelId,
  addAppliedAsset,
  onOpenTranslation,
  onOpenSaveAsTagSet,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [hideEmptyBlocks, setHideEmptyBlocks] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [assetModalTarget, setAssetModalTarget] = useState<{
    sectionId: string
    instIndex: number
    blockId: string
  } | null>(null)

  // Current parsed state (preserves enabled: false chips)
  const state = useMemo(
    () => parsePresetState(paramValues[PROMPT_TEMPLATE_STATE_KEY], structure, paramValues, config.output_groups),
    [paramValues, structure, config.output_groups]
  )

  // Update state and all output groups in one atomic call
  const updateStateAndParams = useCallback(
    (nextState: PromptTemplatePresetState) => {
      const serialized = serializePresetState(nextState)
      const joinedGroupValues = computeAllOutputGroupValues(structure, nextState, config.output_groups)
      setParamValues({
        ...paramValues,
        [PROMPT_TEMPLATE_STATE_KEY]: serialized,
        ...joinedGroupValues,
      })
    },
    [structure, config.output_groups, paramValues, setParamValues]
  )

  // Update chips for a specific block within an instance
  const handleBlockChipsChange = useCallback(
    (sectionId: string, instIndex: number, blockId: string, newChips: TagChip[]) => {
      const secState = state.sections[sectionId] || { instances: [] }
      const instances = [...secState.instances]
      if (!instances[instIndex]) return
      instances[instIndex] = {
        ...instances[instIndex],
        blocks: {
          ...instances[instIndex].blocks,
          [blockId]: newChips,
        },
      }
      const nextState: PromptTemplatePresetState = {
        ...state,
        sections: {
          ...state.sections,
          [sectionId]: { instances },
        },
      }
      updateStateAndParams(nextState)
    },
    [state, updateStateAndParams]
  )

  // Handle direct text edits from TagChipEditor (e.g. text mode input)
  const handleBlockTextChange = useCallback(
    (sectionId: string, instIndex: number, blockId: string, text: string) => {
      const parsed = parseToChips(text)
      handleBlockChipsChange(sectionId, instIndex, blockId, parsed)
    },
    [handleBlockChipsChange]
  )

  // Add an instance to a repeatable section
  const handleAddInstance = useCallback(
    (sectionId: string) => {
      const secDef = structure.sections.find((s) => s.id === sectionId)
      const secState = state.sections[sectionId] || { instances: [] }
      const defaultBlocks: Record<string, TagChip[]> = {}
      if (secDef?.blocks) {
        for (const blk of secDef.blocks) {
          defaultBlocks[blk.id] = blk.default_value ? parseToChips(blk.default_value) : []
        }
      }
      const newInstance: PromptTemplateInstanceState = {
        instanceId: `${sectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        blocks: defaultBlocks,
      }
      const nextState: PromptTemplatePresetState = {
        ...state,
        sections: {
          ...state.sections,
          [sectionId]: { instances: [...secState.instances, newInstance] },
        },
      }
      updateStateAndParams(nextState)
    },
    [structure.sections, state, updateStateAndParams]
  )

  // Remove an instance from a repeatable section (compacts instances without gaps)
  const handleRemoveInstance = useCallback(
    (sectionId: string, instIndex: number) => {
      const secState = state.sections[sectionId]
      if (!secState || secState.instances.length <= 1) return
      const nextInstances = secState.instances.filter((_, idx) => idx !== instIndex)
      const nextState: PromptTemplatePresetState = {
        ...state,
        sections: {
          ...state.sections,
          [sectionId]: { instances: nextInstances },
        },
      }
      updateStateAndParams(nextState)
    },
    [state, updateStateAndParams]
  )

  // Find target role for modal block
  const modalTargetRole = useMemo(() => {
    if (!assetModalTarget) return 'positive'
    const group = config.output_groups.find((g) => g.block_ids.includes(assetModalTarget.blockId))
    return group?.target_role || config.output_groups[0]?.target_role || 'positive'
  }, [assetModalTarget, config.output_groups])

  // Asset application from modal
  const handleAddAssetFromModal = useCallback(
    (role: string, asset: Omit<AppliedAsset, 'id' | 'enabled'>) => {
      if (!assetModalTarget) return
      const { sectionId, instIndex, blockId } = assetModalTarget

      if (asset.type === 'lora') {
        addAppliedAsset(role, { ...asset, tags: [] })
      }

      const secState = state.sections[sectionId]
      const inst = secState?.instances[instIndex]
      const currentChips = inst?.blocks[blockId] ?? []
      const newChips: TagChip[] = [...currentChips]

      if (asset.tags && asset.tags.length > 0) {
        for (const t of asset.tags) {
          if (t && t.trim().length > 0) {
            newChips.push({ id: generateChipId(), text: t.trim(), enabled: true })
          }
        }
      }
      if (asset.loraPromptString && asset.loraPromptString.trim().length > 0) {
        newChips.push({ id: generateChipId(), text: asset.loraPromptString.trim(), enabled: true })
      }

      if (newChips.length > currentChips.length) {
        handleBlockChipsChange(sectionId, instIndex, blockId, newChips)
      }
      setAssetModalTarget(null)
    },
    [assetModalTarget, state.sections, addAppliedAsset, handleBlockChipsChange]
  )

  const isBlockEmpty = (chips?: TagChip[]) => {
    if (!chips || chips.length === 0) return true
    return chips.every((c) => !c.text || c.text.trim().length === 0)
  }

  // Precomputed joined values for preview
  const joinedGroupValues = useMemo(
    () => computeAllOutputGroupValues(structure, state, config.output_groups),
    [structure, state, config.output_groups]
  )

  return (
    <div
      className="space-y-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface p-3 sm:p-4 text-left"
      data-testid="prompt-template-split-editor"
    >
      {/* Top Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.06)] pb-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-accent-green" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            プロンプト構造テンプレート
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideEmptyBlocks((prev) => !prev)}
            aria-pressed={hideEmptyBlocks}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
              hideEmptyBlocks
                ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
                : 'border-[rgba(255,255,255,0.08)] bg-surface-2 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Filter size={12} aria-hidden="true" />
            <span>空ブロックを隠す</span>
          </button>
        </div>
      </div>

      {/* Sections List */}
      <div className="space-y-3">
        {structure.sections.map((sec) => {
          const isCollapsed = Boolean(collapsedSections[sec.id])
          const secState = state.sections[sec.id] || { instances: [] }
          const instances = secState.instances.length > 0 ? secState.instances : [{ instanceId: `${sec.id}-1`, blocks: {} }]

          return (
            <div
              key={sec.id}
              className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/40 overflow-hidden"
              data-testid={`prompt-section-${sec.id}`}
            >
              {/* Section Header */}
              <div className="flex items-center justify-between bg-surface-2/80 px-3 py-2 border-b border-[rgba(255,255,255,0.04)]">
                <button
                  type="button"
                  onClick={() => setCollapsedSections((prev) => ({ ...prev, [sec.id]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 text-left font-semibold text-xs text-zinc-200 hover:text-white transition-colors"
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{sec.name}</span>
                  {sec.is_repeatable && (
                    <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-xs font-medium text-sky-300">
                      Repeatable ({instances.length})
                    </span>
                  )}
                </button>

                {sec.is_repeatable && (
                  <button
                    type="button"
                    onClick={() => handleAddInstance(sec.id)}
                    data-testid={`add-instance-${sec.id}`}
                    className="flex items-center gap-1 rounded bg-accent-green/10 border border-accent-green/30 px-2 py-0.5 text-xs font-semibold text-accent-green hover:bg-accent-green/20 transition-all"
                  >
                    <Plus size={12} />
                    <span>インスタンスを追加</span>
                  </button>
                )}
              </div>

              {/* Section Content */}
              {!isCollapsed && (
                <div className="p-2 sm:p-3 space-y-3">
                  {instances.map((inst, instIdx) => {
                    return (
                      <div
                        key={inst.instanceId || `${sec.id}-${instIdx}`}
                        className={`space-y-2 rounded-lg ${
                          sec.is_repeatable
                            ? 'border border-[rgba(255,255,255,0.08)] bg-surface/60 p-2.5 sm:p-3'
                            : ''
                        }`}
                        data-testid={`section-instance-${sec.id}-${instIdx}`}
                      >
                        {/* Repeat Instance Header */}
                        {sec.is_repeatable && (
                          <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.04)] pb-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs font-bold text-zinc-300">
                              #{instIdx + 1}
                            </span>
                            {instances.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveInstance(sec.id, instIdx)}
                                data-testid={`remove-instance-${sec.id}-${instIdx}`}
                                aria-label={`インスタンス #${instIdx + 1} を削除`}
                                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 size={12} />
                                <span>削除</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Blocks */}
                        <div className="space-y-2">
                          {sec.blocks.map((blk) => {
                            const chips = inst.blocks?.[blk.id] ?? []
                            const empty = isBlockEmpty(chips)
                            if (hideEmptyBlocks && empty) {
                              return null
                            }

                            const currentValue = formatEnabledBlockChips(chips)

                            return (
                              <div
                                key={blk.id}
                                className="space-y-1 rounded border border-[rgba(255,255,255,0.04)] bg-surface-2/20 p-2"
                                data-testid={`prompt-block-${sec.id}-${instIdx}-${blk.id}`}
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <label
                                    htmlFor={`prompt-block-input-${sec.id}-${instIdx}-${blk.id}`}
                                    className="font-medium text-zinc-300"
                                  >
                                    {blk.label}
                                  </label>
                                </div>

                                <TagChipEditor
                                  id={`prompt-block-input-${sec.id}-${instIdx}-${blk.id}`}
                                  chips={chips}
                                  onChipsChange={(newChips) =>
                                    handleBlockChipsChange(sec.id, instIdx, blk.id, newChips)
                                  }
                                  onChange={(val) =>
                                    handleBlockTextChange(sec.id, instIdx, blk.id, val)
                                  }
                                  value={chipsToString(chips)}
                                  placeholder={`${blk.label}…`}
                                  variant="positive"
                                  showModeStatus={false}
                                  toolbarStart={
                                    <div className="relative flex w-full min-w-0 flex-wrap items-center gap-1.5">
                                      <PromptSectionClipboardMenu
                                        role={`${sec.id}:${instIdx}:${blk.id}`}
                                        currentValue={currentValue}
                                        onChangeValue={(val) => {
                                          const parsed = parseToChips(val)
                                          handleBlockChipsChange(sec.id, instIdx, blk.id, parsed)
                                        }}
                                        onOpenSaveAsTagSet={
                                          onOpenSaveAsTagSet
                                            ? () => onOpenSaveAsTagSet(blk.label, currentValue)
                                            : undefined
                                        }
                                        menuAlign="start"
                                      />
                                      {onOpenTranslation && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onOpenTranslation(
                                              `${sec.id}:${instIdx}:${blk.id}`,
                                              currentValue,
                                              (newText) => {
                                                const parsed = parseToChips(newText)
                                                handleBlockChipsChange(sec.id, instIdx, blk.id, parsed)
                                              }
                                            )
                                          }
                                          className="flex items-center gap-1 text-[10px] px-2 py-0.5 border rounded border-[rgba(255,255,255,0.06)] bg-surface-2 text-zinc-400 hover:text-[#7C6FDD] hover:border-[#7C6FDD]/40 transition-all"
                                        >
                                          <span>翻訳</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        data-testid={`add-asset-btn-${sec.id}-${instIdx}-${blk.id}`}
                                        onClick={() =>
                                          setAssetModalTarget({
                                            sectionId: sec.id,
                                            instIndex: instIdx,
                                            blockId: blk.id,
                                          })
                                        }
                                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-surface-2 border border-[rgba(255,255,255,0.06)] rounded text-zinc-400 hover:text-accent-green hover:border-accent-green/30 transition-all"
                                      >
                                        <Plus size={10} />
                                        <span>Add Asset</span>
                                      </button>
                                    </div>
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Output Group Joined Preview Accordion */}
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30">
        <button
          type="button"
          onClick={() => setIsPreviewOpen((prev) => !prev)}
          aria-expanded={isPreviewOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            {isPreviewOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>出力グループ別結合プレビュー ({config.output_groups.length})</span>
          </div>
        </button>
        {isPreviewOpen && (
          <div className="p-3 space-y-2 border-t border-[rgba(255,255,255,0.04)]">
            {config.output_groups.map((group) => {
              const joinedText = joinedGroupValues[group.target_role] || ''
              return (
                <div
                  key={group.id}
                  className="rounded border border-[rgba(255,255,255,0.06)] bg-surface/50 p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">{group.name}</span>
                    <span className="font-mono text-xs text-accent-green">
                      {group.target_role}
                    </span>
                  </div>
                  <pre className="max-h-24 overflow-auto rounded bg-black/30 p-2 text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words">
                    {joinedText || <span className="text-zinc-500">（空）</span>}
                  </pre>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {assetModalTarget && (
        <AddAssetModal
          role={modalTargetRole}
          loras={loras}
          tagSets={tagSets}
          onClose={() => setAssetModalTarget(null)}
          addAppliedAsset={handleAddAssetFromModal}
          setRoleCollapsed={() => {}}
          activeBaseModelId={activeBaseModelId}
        />
      )}
    </div>
  )
}
