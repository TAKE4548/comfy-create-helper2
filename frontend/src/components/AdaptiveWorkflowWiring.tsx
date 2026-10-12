import { useState, useMemo, useEffect } from 'react'
import type { MappingMasterV2, MappingMaster, Workflow } from '../api/types'
import {
  ActiveStageInfo,
  extractWorkflowNodes,
  ExtractedWorkflowNode,
} from '../utils/workflowAdaptiveStageDetector'
import StageInputGroup from './StageInputGroup'
import { buildWiringStageGroups } from '../utils/wiringStageGroups'

export interface WiringMappingItem {
  master_id: number
  node_id: string
  variant_id?: number
}

export interface AdaptiveWorkflowWiringProps {
  workflow?: Workflow | null
  activeStages: ActiveStageInfo[]
  mappingMasters: (MappingMasterV2 | MappingMaster)[]
  onSaveMappings?: (mappings: WiringMappingItem[]) => void | Promise<void>
  currentMappings?: WiringMappingItem[]
  onChangeMappings?: (mappings: WiringMappingItem[]) => void
  isSaving?: boolean
}

const mappingKey = (mapping: WiringMappingItem) =>
  mapping.variant_id !== undefined ? `v:${mapping.variant_id}` : `m:${mapping.master_id}`

export function AdaptiveWorkflowWiring({
  workflow,
  activeStages,
  mappingMasters,
  onSaveMappings,
  currentMappings,
  onChangeMappings,
  isSaving = false,
}: AdaptiveWorkflowWiringProps) {
  const [mappingsMap, setMappingsMap] = useState<Map<string, WiringMappingItem>>(() => {
    const map = new Map<string, WiringMappingItem>()
    const initial = currentMappings || workflow?.mappings || []
    for (const m of initial) {
      const item: WiringMappingItem = m.variant_id == null
        ? { master_id: m.master_id, node_id: m.node_id }
        : { master_id: m.master_id, node_id: m.node_id, variant_id: m.variant_id }
      const key = mappingKey(item)
      map.set(key, {
        ...item,
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
      const key = mappingKey(item)
      nextMap.set(key, {
        ...item,
      })
    }
    setMappingsMap(nextMap)
  }, [currentMappings, workflow?.mappings])

  // Memoized workflow nodes scan
  const workflowNodes = useMemo<ExtractedWorkflowNode[]>(() => {
    return extractWorkflowNodes(workflow?.json_body)
  }, [workflow?.json_body])

  const stageGroups = useMemo(
    () => buildWiringStageGroups(activeStages, mappingMasters, Array.from(mappingsMap.values())),
    [activeStages, mappingMasters, mappingsMap]
  )

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
    onSaveMappings?.(list)
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
          const matchedNodeIds = new Set(group.info.matchedNodeIds)
          const recommendedNodes = workflowNodes.filter((node) => matchedNodeIds.has(node.id))
          const otherNodes = workflowNodes.filter((node) => !matchedNodeIds.has(node.id))
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
                  return (
              <div
                key={slot.slotKey}
                className="grid grid-cols-12 items-center gap-2 rounded bg-zinc-900/60 p-2 text-xs border border-zinc-800/60 hover:border-zinc-700/60 transition-colors"
              >
                {/* Slot Role & Param Label */}
                <div className="col-span-5 flex flex-col">
                  <span className="font-medium text-zinc-200">{slot.role}</span>
                  <span className="text-[11px] text-zinc-400">
                    {slot.role} → {slot.paramName || '—'}
                  </span>
                </div>

                {/* Node Selection Dropdown */}
                <div className="col-span-7">
                  <select
                    aria-label={`${group.info.stage.name} ${slot.role} → ${slot.paramName || '—'} のノード`}
                    value={currentNodeId}
                    onChange={(e) => handleNodeChange(slot, e.target.value)}
                    className="w-full min-h-[44px] rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">未指定 (未割り当て)</option>
                    {recommendedNodes.length > 0 && (
                      <optgroup label="推奨ノード (ステージ一致)">
                        {recommendedNodes.map((node) => (
                          <option key={node.id} value={node.id} className="text-emerald-400 font-semibold">
                            ★ [{node.id}] {node.title || node.classType} [推奨]
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {otherNodes.length > 0 && (
                      <optgroup label={recommendedNodes.length > 0 ? 'その他ノード' : 'ノード一覧'}>
                        {otherNodes.map((node) => (
                          <option key={node.id} value={node.id} className="text-zinc-300">
                            [{node.id}] {node.title || node.classType}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
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
