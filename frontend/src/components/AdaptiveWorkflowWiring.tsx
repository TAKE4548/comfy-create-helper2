import { useState, useMemo, useEffect } from 'react'
import type { MappingMasterV2, MappingMaster, Workflow } from '../api/types'
import {
  ActiveStageInfo,
  extractWorkflowNodes,
  ExtractedWorkflowNode,
} from '../utils/workflowAdaptiveStageDetector'
import { Layers, CheckCircle2 } from 'lucide-react'

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

interface VariantSlot {
  variantId: number
  masterId: number
  role: string
  paramName: string
  displayName: string
  inputType: string
  stageId: number
}

export function AdaptiveWorkflowWiring({
  workflow,
  activeStages,
  mappingMasters,
  onSaveMappings,
  currentMappings,
  onChangeMappings,
  isSaving = false,
}: AdaptiveWorkflowWiringProps) {
  const [selectedStageId, setSelectedStageId] = useState<number | null>(() => {
    return activeStages[0]?.stage.id ?? null
  })

  // Ensure selectedStageId remains valid when activeStages change
  useEffect(() => {
    if (activeStages.length > 0) {
      if (!selectedStageId || !activeStages.some((s) => s.stage.id === selectedStageId)) {
        setSelectedStageId(activeStages[0].stage.id)
      }
    } else {
      setSelectedStageId(null)
    }
  }, [activeStages, selectedStageId])

  // Internal mapping state: key is variant_id (or master_id as fallback)
  const [mappingsMap, setMappingsMap] = useState<Map<number, WiringMappingItem>>(() => {
    const map = new Map<number, WiringMappingItem>()
    const initial = currentMappings || workflow?.mappings || []
    for (const m of initial) {
      const key = (m as any).variant_id ?? m.master_id
      map.set(key, {
        master_id: m.master_id,
        node_id: m.node_id,
        variant_id: (m as any).variant_id,
      })
    }
    return map
  })

  // Sync when currentMappings or workflow.mappings changes
  useEffect(() => {
    const nextList = currentMappings || workflow?.mappings || []
    const nextMap = new Map<number, WiringMappingItem>()
    for (const m of nextList) {
      const key = (m as any).variant_id ?? m.master_id
      nextMap.set(key, {
        master_id: m.master_id,
        node_id: m.node_id,
        variant_id: (m as any).variant_id,
      })
    }
    setMappingsMap(nextMap)
  }, [currentMappings, workflow?.mappings])

  // Memoized workflow nodes scan
  const workflowNodes = useMemo<ExtractedWorkflowNode[]>(() => {
    return extractWorkflowNodes(workflow?.json_body)
  }, [workflow?.json_body])

  // Current active stage info
  const currentStageInfo = useMemo(() => {
    if (!selectedStageId) return activeStages[0] || null
    return activeStages.find((s) => s.stage.id === selectedStageId) || activeStages[0] || null
  }, [activeStages, selectedStageId])

  // Check if mappingMasters has REQ-336 V2 variants
  const isV2 = useMemo(() => {
    return mappingMasters.some(
      (m) => Array.isArray((m as any).variants) && (m as any).variants.length > 0
    )
  }, [mappingMasters])

  // Slots for the current active stage
  const stageSlots = useMemo<VariantSlot[]>(() => {
    if (!currentStageInfo) return []
    const stage = currentStageInfo.stage
    const slots: VariantSlot[] = []

    if (isV2) {
      // V2: Render all enabled variants for this stage
      for (const m of mappingMasters) {
        const mRecord = m as any
        const mName = mRecord.name || mRecord.display_name || ''
        if (Array.isArray(mRecord.variants)) {
          for (const v of mRecord.variants) {
            if (v.is_enabled === false) continue
            if (v.stage_id === stage.id || v.stage_key === stage.key) {
              slots.push({
                variantId: v.id,
                masterId: v.master_id || m.id,
                role: v.computed_role || mRecord.role || mName,
                paramName: m.param_name,
                displayName: mRecord.display_name || mName,
                inputType: m.input_type,
                stageId: stage.id,
              })
            }
          }
        }
      }
    } else {
      // Legacy compatibility: Render slots based on existing mappings in workflow
      const existingList = currentMappings || workflow?.mappings || []
      if (existingList.length > 0) {
        for (const m of existingList) {
          const master = mappingMasters.find((opt) => opt.id === m.master_id)
          const mRecord = master as any
          const mName = mRecord?.name || mRecord?.display_name || ''
          slots.push({
            variantId: m.master_id,
            masterId: m.master_id,
            role: mRecord?.role || mName || 'role',
            paramName: master?.param_name || '',
            displayName: mName,
            inputType: master?.input_type || '',
            stageId: stage.id,
          })
        }
      } else {
        // Fallback if no existing mappings
        for (const m of mappingMasters) {
          const mRecord = m as any
          const mName = mRecord?.name || mRecord?.display_name || ''
          slots.push({
            variantId: m.id,
            masterId: m.id,
            role: mRecord?.role || mName || 'role',
            paramName: m.param_name || '',
            displayName: mName,
            inputType: m.input_type || '',
            stageId: stage.id,
          })
        }
      }
    }
    return slots
  }, [currentStageInfo, mappingMasters, isV2, currentMappings, workflow?.mappings])

  // Matched node IDs for priority highlighting in the current stage
  const matchedNodeIdsSet = useMemo(() => {
    return new Set(currentStageInfo?.matchedNodeIds || [])
  }, [currentStageInfo])

  const recommendedNodes = useMemo(() => {
    return workflowNodes.filter((node) => matchedNodeIdsSet.has(node.id))
  }, [workflowNodes, matchedNodeIdsSet])

  const otherNodes = useMemo(() => {
    return workflowNodes.filter((node) => !matchedNodeIdsSet.has(node.id))
  }, [workflowNodes, matchedNodeIdsSet])

  const handleNodeChange = (slot: VariantSlot, newNodeId: string) => {
    const updatedMap = new Map(mappingsMap)
    if (!newNodeId) {
      updatedMap.delete(slot.variantId)
    } else {
      updatedMap.set(slot.variantId, {
        master_id: slot.masterId,
        node_id: newNodeId,
        variant_id: slot.variantId,
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
      {/* Stage Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-2" role="tablist">
        {activeStages.map((s) => {
          const isSelected = (currentStageInfo?.stage.id ?? null) === s.stage.id
          return (
            <button
              key={s.stage.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedStageId(s.stage.id)}
              className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-b-2 border-emerald-400 bg-zinc-800/80 text-emerald-400'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <Layers size={13} />
              <span>{s.stage.name}</span>
              {s.matchingNodesCount > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-300 font-mono">
                  {s.matchingNodesCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Stage Header Info */}
      {currentStageInfo && (
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <div>
            ステージ: <span className="text-zinc-200 font-semibold">{currentStageInfo.stage.name}</span>
            {currentStageInfo.stage.suffix && (
              <span className="ml-1.5 rounded bg-zinc-800 px-1 py-0.5 text-[11px] font-mono text-zinc-400">
                {currentStageInfo.stage.suffix}
              </span>
            )}
          </div>
          {currentStageInfo.matchingNodesCount > 0 ? (
            <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
              <CheckCircle2 size={12} />
              {currentStageInfo.matchingNodesCount} 件のノードが一致
            </span>
          ) : (
            <span className="text-zinc-500 text-[11px]">常時表示（システム必須ステージ）</span>
          )}
        </div>
      )}

      {/* Variant Slots List */}
      <div className="space-y-2">
        {stageSlots.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-500">
            このステージに割り当て可能なマッピングスロットはありません
          </p>
        ) : (
          stageSlots.map((slot) => {
            const currentItem = mappingsMap.get(slot.variantId) || (slot.variantId === slot.masterId ? mappingsMap.get(slot.masterId) : undefined)
            const currentNodeId = currentItem?.node_id || ''

            return (
              <div
                key={slot.variantId}
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
                    aria-label={`${slot.role} のノード`}
                    value={currentNodeId}
                    onChange={(e) => handleNodeChange(slot, e.target.value)}
                    className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
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
          })
        )}
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
