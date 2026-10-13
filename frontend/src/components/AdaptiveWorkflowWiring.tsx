import { useState, useMemo, useEffect } from 'react'
import type { MappingMasterV2, MappingMaster, Workflow } from '../api/types'
import { ActiveStageInfo } from '../utils/workflowAdaptiveStageDetector'
import StageInputGroup from './StageInputGroup'
import { buildWiringStageGroups } from '../utils/wiringStageGroups'
import { rankWorkflowNodeCandidates } from '../utils/workflowNodeUtils'
import { candidateConfidenceLabel } from '../utils/workflowCandidatePresentation'
import { hydrateSlotStates, mappingSlotKey, type SlotDefinition } from '../utils/workflowMappingState'

export interface WiringMappingItem {
  master_id: number
  node_id: string
  variant_id?: number
}

export interface AdaptiveWorkflowWiringProps {
  workflow?: Workflow | null
  activeStages: ActiveStageInfo[]
  mappingMasters: (MappingMasterV2 | MappingMaster)[]
  onSaveMappings?: (mappings: WiringMappingItem[], states?: Record<string, boolean>) => void | Promise<void>
  currentMappings?: WiringMappingItem[]
  onChangeMappings?: (mappings: WiringMappingItem[]) => void
  isSaving?: boolean
  currentSlotStates?: Record<string, boolean>
  onChangeSlotStates?: (states: Record<string, boolean>) => void
}

export function AdaptiveWorkflowWiring({
  workflow,
  activeStages,
  mappingMasters,
  onSaveMappings,
  currentMappings,
  onChangeMappings,
  isSaving = false,
  currentSlotStates,
  onChangeSlotStates,
}: AdaptiveWorkflowWiringProps) {
  const definitions = useMemo<SlotDefinition[]>(() => mappingMasters.flatMap((master) => {
    const variants = 'variants' in master ? master.variants : []
    return variants.length ? variants.map((variant) => ({ masterId: master.id, variantId: variant.id, stageId: variant.stage_id, role: variant.computed_role, legacyRole: master.role, defaultEnabled: master.default_enabled !== false }))
      : [{ masterId: master.id, defaultEnabled: master.default_enabled !== false }]
  }), [mappingMasters])
  const [mappingsMap, setMappingsMap] = useState<Map<string, WiringMappingItem>>(() => {
    const map = new Map<string, WiringMappingItem>()
    const initial = currentMappings || workflow?.mappings || []
    for (const m of initial) {
      const item: WiringMappingItem = m.variant_id == null
        ? { master_id: m.master_id, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id, variant_id: m.variant_id }
      const key = mappingSlotKey(m, definitions)
      map.set(key, {
        ...item,
        ...(key.startsWith('v:') ? { variant_id: Number(key.slice(2)) } : {}),
      })
    }
    return map
  })

  // Sync when currentMappings or workflow.mappings changes
  useEffect(() => {
    const nextList = currentMappings || workflow?.mappings || []
    const nextMap = new Map<string, WiringMappingItem>()
    for (const m of nextList) {
      const item: WiringMappingItem = m.variant_id == null
        ? { master_id: m.master_id, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id, variant_id: m.variant_id }
      const key = mappingSlotKey(m, definitions)
      nextMap.set(key, {
        ...item,
        ...(key.startsWith('v:') ? { variant_id: Number(key.slice(2)) } : {}),
      })
    }
    setMappingsMap(nextMap)
  }, [currentMappings, workflow?.mappings, definitions])

  const resolvedStates = useMemo(() => hydrateSlotStates(currentSlotStates ?? workflow?.mapping_slot_states, Array.from(mappingsMap.values()), definitions), [currentSlotStates, workflow?.mapping_slot_states, mappingsMap, definitions])

  // Memoized workflow nodes scan
  const stageGroups = useMemo(
    () => buildWiringStageGroups(activeStages, mappingMasters, Array.from(mappingsMap.values()), resolvedStates),
    [activeStages, mappingMasters, mappingsMap, resolvedStates]
  )

  const workflowNodesByRank = useMemo(() => {
    const stageNames = mappingMasters.flatMap((master) => 'variants' in master ? master.variants.map((variant) => variant.stage_name) : [])
    return new Map(stageGroups.flatMap((group) => group.slots.map((slot) => {
      const master = mappingMasters.find((item) => item.id === slot.masterId)
      const expectedClassTypes = master?.expected_class_types ?? []
      const patterns = 'base_title_patterns' in (master ?? {})
        ? ((master as MappingMasterV2).base_title_patterns ?? [])
        : ((master as MappingMaster).title_patterns ?? [])
      const variants = master && 'variants' in master ? master.variants : []
      const fallbackParams = master && 'fallback_param_names' in master ? master.fallback_param_names ?? [] : []
      return [slot.slotKey, rankWorkflowNodeCandidates(workflow?.json_body, {
        expectedClassTypes,
        titlePatterns: [...patterns, ...variants.flatMap((variant) => variant.extra_title_patterns ?? [])],
        paramNames: [slot.paramName, ...fallbackParams].filter(Boolean),
      }, group.info.stage.name, stageNames)] as const
    })))
  }, [stageGroups, mappingMasters, workflow?.json_body])

  const handleNodeChange = (slot: (typeof stageGroups)[number]['slots'][number], newNodeId: string) => {
    const updatedMap = new Map(mappingsMap)
    if (!newNodeId) {
      updatedMap.delete(slot.slotKey)
    } else {
      updatedMap.set(slot.slotKey, {
        master_id: slot.masterId,
        node_id: newNodeId,
        ...(slot.variantId !== undefined ? { variant_id: slot.variantId } : {}),
      })
    }
    setMappingsMap(updatedMap)
    const list = Array.from(updatedMap.values())
    onChangeMappings?.(list)
  }

  const handleSave = () => {
    const list = Array.from(mappingsMap.values())
    onSaveMappings?.(list, resolvedStates)
  }

  const handleSlotEnabledChange = (slotKey: string, enabled: boolean) => {
    const next = { ...resolvedStates, [slotKey]: enabled }
    onChangeSlotStates?.(next)
  }

  if (activeStages.length === 0) {
    return (
      <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
        アクティブなステージが検出されませんでした。ワークフローのノード構成を確認してください。
      </div>
    )
  }

  return (
    <div className="space-y-4" aria-label="アダプティブ配線設定">
      <div
        id="settings-mapping-scroll"
        data-stage-scroll-root=""
        className="stage-input-scroll-root"
        style={{ maxHeight: 'min(60vh, 480px)', overflowY: 'auto' }}
      >
        {stageGroups.map((group) => {
          return (
            <StageInputGroup
              key={group.info.stage.id}
              groupKey={`settings:${group.info.stage.key}`}
              stageName={group.info.stage.name}
              stageKey={group.info.stage.key}
            >
              <div className="space-y-2">
                {group.slots.length === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-500">
                    このステージに割り当て可能なマッピングスロットはありません
                  </p>
                ) : group.slots.map((slot) => {
                  const currentNodeId = mappingsMap.get(slot.slotKey)?.node_id || ''
                  const ranked = workflowNodesByRank.get(slot.slotKey) ?? []
                  const recommendedNodes = ranked.filter((candidate) => candidate.recommended)
                  const otherNodes = ranked.filter((candidate) => !candidate.recommended)
                  const selectedCandidate = ranked.find((candidate) => candidate.id === currentNodeId)
                  return (
              <div
                key={slot.slotKey}
                className="grid grid-cols-12 items-center gap-2 rounded bg-zinc-900/60 p-2 text-xs border border-zinc-800/60 hover:border-zinc-700/60 transition-colors"
              >
                {/* Slot Role & Param Label */}
                <div className="col-span-5 flex flex-col">
                  <span className="font-medium text-zinc-200">{slot.role}</span>
                  <label className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                    <input aria-label={`${group.info.stage.name} ${slot.role} を有効化`} type="checkbox" checked={slot.enabled} onChange={(event) => handleSlotEnabledChange(slot.slotKey, event.target.checked)} />
                    {slot.enabled ? '利用許可' : '無効'}
                  </label>
                  <span className="text-xs text-zinc-300">
                    {slot.role} → {slot.paramName || '—'}
                  </span>
                </div>

                {/* Node Selection Dropdown */}
                <div className="col-span-7">
                  <select
                    title="適合スコア"
                    aria-label={`${group.info.stage.name} ${slot.role} → ${slot.paramName || '—'} のノード`}
                    value={currentNodeId}
                    disabled={!slot.enabled}
                    onChange={(e) => handleNodeChange(slot, e.target.value)}
                    className="w-full min-h-[44px] rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">未指定 (未割り当て)</option>
                    {currentNodeId && !selectedCandidate && <option value={currentNodeId}>参照先なし · ID {currentNodeId}</option>}
                    {recommendedNodes.length > 0 && (
                      <optgroup label="推奨ノード">
                        {recommendedNodes.map((node) => (
                          <option key={node.id} value={node.id} className="text-emerald-400 font-semibold">
                            ★ {node.title || node.classType} · {node.classType} · ID {node.id} · {candidateConfidenceLabel(node)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherNodes.length > 0 && (
                      <optgroup label={recommendedNodes.length > 0 ? 'その他ノード' : 'ノード一覧'}>
                        {otherNodes.map((node) => (
                          <option key={node.id} value={node.id} className="text-zinc-200">
                            {node.title || node.classType} · {node.classType} · ID {node.id} · {candidateConfidenceLabel(node)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {!currentNodeId && <p className="mt-1 text-xs text-zinc-400">未割当</p>}
                </div>
              </div>
                  )
                })}
              </div>
            </StageInputGroup>
          )
        })}
      </div>

      {/* Save Button */}
      <div className="pt-1">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="rounded bg-accent-green/15 px-3 py-2 text-xs font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-50 transition-colors"
        >
          {isSaving ? '保存中…' : '対応付けを保存'}
        </button>
      </div>
    </div>
  )
}
