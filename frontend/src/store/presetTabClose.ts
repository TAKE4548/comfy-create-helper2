import type { MultiSetState } from './types'

export type PresetTabCloseMode = 'others' | 'left' | 'right'
export type PresetId = string | number
export interface PresetTabClosePlan {
  workflowId: number
  triggerId: PresetId
  mode: PresetTabCloseMode
  orderedOpenIds: PresetId[]
  targetIds: PresetId[]
  activeSetId: PresetId | null
  nextActiveId: PresetId
}
type PlanInput = Pick<MultiSetState, 'selectedWorkflowId' | 'sets' | 'openPresetIds' | 'activeSetId'>

export function createPresetTabClosePlan(input: PlanInput, triggerId: PresetId, mode: PresetTabCloseMode): PresetTabClosePlan | null {
  const workflowId = input.selectedWorkflowId
  if (workflowId === null || !input.sets.some((item) => String(item.id) === String(triggerId))) return null
  const open = new Set(input.openPresetIds.map(String))
  const seen = new Set<string>()
  const orderedOpenIds = input.sets.filter((item) => {
    const key = String(item.id)
    if (!open.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  }).map((item) => item.id)
  const triggerIndex = orderedOpenIds.findIndex((id) => String(id) === String(triggerId))
  if (triggerIndex < 0) return null
  const targetIds = orderedOpenIds.filter((id, index) => String(id) !== String(triggerId) &&
    (mode === 'others' || (mode === 'left' ? index < triggerIndex : index > triggerIndex)))
  if (!targetIds.length) return null
  const targets = new Set(targetIds.map(String))
  return { workflowId, triggerId, mode, orderedOpenIds: [...orderedOpenIds], targetIds, activeSetId: input.activeSetId,
    nextActiveId: input.activeSetId !== null && !targets.has(String(input.activeSetId)) ? input.activeSetId : triggerId }
}
