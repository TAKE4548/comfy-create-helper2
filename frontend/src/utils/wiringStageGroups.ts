export interface WorkflowMapping {
  id: number
  master_id: number
  node_id: string
  variant_id?: number | null
  role: string | null
  param_name: string | null
  input_type: string | null
  display_name: string | null
}

export interface MappingMaster {
  id: number
  role: string
  expected_class_types: string[] | null
  param_name: string
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean'
  display_name: string
  title_patterns: string[] | null
  sort_order: number
}

export interface MappingVariant {
  id: number
  master_id: number
  stage_id: number
  stage_key: string
  stage_name: string
  stage_suffix: string
  custom_role_override: string | null
  computed_role: string
  extra_title_patterns: string[] | null
  is_enabled: boolean
}

export interface MappingMasterV2 {
  id: number
  group_id: number | null
  base_key: string
  name: string
  param_name: string
  input_type: string
  expected_class_types: string[] | null
  base_title_patterns: string[] | null
  fallback_param_names?: string[] | null
  sort_order: number
  variants: MappingVariant[]
  role?: string
  display_name?: string
  title_patterns?: string[] | null
}

export interface StageMaster {
  id: number
  key: string
  name: string
  suffix: string
  search_keywords: string[] | null
  previous_suffixes: string[] | null
  is_builtin: boolean
  is_active: boolean
  sort_order: number
}

interface ActiveStageInfo {
  stage: StageMaster
  matchingNodesCount: number
  matchedNodeIds: string[]
  isAlwaysVisible: boolean
}

export interface WiringMappingItem {
  master_id: number
  node_id: string
  variant_id?: number
}

interface WiringStageSlot {
  slotKey: string
  variantId?: number
  masterId: number
  role: string
  paramName: string
  displayName: string
  inputType: string
  stageId: number
}

interface WiringStageGroup {
  info: ActiveStageInfo
  slots: WiringStageSlot[]
}

type MappingMasterLike = MappingMaster | MappingMasterV2

function hasVariants(master: MappingMasterLike): master is MappingMasterV2 {
  return Array.isArray((master as MappingMasterV2).variants)
}

export function buildWiringStageGroups(
  activeStages: readonly ActiveStageInfo[],
  masters: readonly MappingMasterLike[],
  _currentMappings: readonly WiringMappingItem[],
): WiringStageGroup[] {
  const sortedStages = activeStages
    .map((info, index) => ({ info, index }))
    .sort((a, b) => a.info.stage.sort_order - b.info.stage.sort_order || a.index - b.index)
    .map(({ info }) => info)

  const legacyStage = sortedStages.find(({ stage }) => stage.key === 'main') ?? sortedStages[0]

  return sortedStages.map((info) => {
    const stage = info.stage
    const slots: WiringStageSlot[] = []

    for (const master of masters) {
      if (hasVariants(master)) {
        for (const variant of master.variants) {
          if (variant.is_enabled === false) continue
          if (variant.stage_id !== stage.id && variant.stage_key !== stage.key) continue
          slots.push({
            slotKey: `v:${variant.id}`,
            variantId: variant.id,
            masterId: variant.master_id || master.id,
            role: variant.computed_role || variant.custom_role_override || master.role || master.name,
            paramName: master.param_name,
            displayName: master.display_name || master.name,
            inputType: master.input_type,
            stageId: stage.id,
          })
        }
      } else if (info === legacyStage) {
        slots.push({
          slotKey: `m:${master.id}`,
          variantId: undefined,
          masterId: master.id,
          role: master.role,
          paramName: master.param_name,
          displayName: master.display_name,
          inputType: master.input_type,
          stageId: stage.id,
        })
      }
    }

    return { info, slots }
  })
}
