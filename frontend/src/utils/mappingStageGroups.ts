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

export interface MappingStageGroup {
  key: string
  stageId?: number
  stageKey: string
  stageName: string
  mappings: WorkflowMapping[]
}

type ResolvedVariant = { variant: MappingVariant; master: MappingMasterV2 }

function isV2(master: MappingMaster | MappingMasterV2): master is MappingMasterV2 {
  return 'variants' in master && Array.isArray(master.variants)
}

/** Projects workflow mappings into stage groups without changing the source objects. */
export function groupMappingsByStage(
  mappings: readonly WorkflowMapping[],
  masters: readonly (MappingMaster | MappingMasterV2)[],
  stages: readonly StageMaster[],
): MappingStageGroup[] {
  const stageById = new Map(stages.map(stage => [stage.id, stage]))
  const resolved: Array<{ group: MappingStageGroup; firstIndex: number; activeOrder?: number }> = []
  const groupByIdentity = new Map<string, (typeof resolved)[number]>()
  const activeOrderById = new Map(
    stages
      .map((stage, index) => ({ stage, index }))
      .filter(({ stage }) => stage.is_active)
      .sort((a, b) => a.stage.sort_order - b.stage.sort_order || a.index - b.index)
      .map(({ stage }, order) => [stage.id, order] as const),
  )

  const addMapping = (index: number, mapping: WorkflowMapping, variant?: ResolvedVariant) => {
    const stage = variant ? stageById.get(variant.variant.stage_id) : undefined
    const stageId = variant?.variant.stage_id
    const stageKey = stage?.key ?? variant?.variant.stage_key ?? 'unknown'
    const stageName = stage?.name ?? variant?.variant.stage_name ?? 'Unknown'
    const key = variant ? stageKey : mapping.variant_id != null ? `unknown-variant:${mapping.variant_id}` : 'unknown'
    const identity = variant ? `stage:${stageId}` : key
    let entry = groupByIdentity.get(identity)
    if (!entry) {
      const group: MappingStageGroup = {
        key,
        ...(stageId !== undefined ? { stageId } : {}),
        stageKey,
        stageName: variant ? stageName : mapping.variant_id != null ? `Unknown variant ${mapping.variant_id}` : 'Unknown',
        mappings: [],
      }
      entry = { group, firstIndex: index, ...(stageId !== undefined ? { activeOrder: activeOrderById.get(stageId) } : {}) }
      groupByIdentity.set(identity, entry)
      resolved.push(entry)
    }
    entry.group.mappings.push(mapping)
  }

  mappings.forEach((mapping, index) => {
    let match: ResolvedVariant | undefined
    if (mapping.variant_id != null) {
      const master = masters.find(candidate => candidate.id === mapping.master_id && isV2(candidate))
      if (master && isV2(master)) {
        const variant = master.variants.find(item => item.id === mapping.variant_id && item.master_id === master.id)
        if (variant) match = { variant, master }
      }
    } else if (mapping.role != null) {
      const candidates: ResolvedVariant[] = []
      for (const master of masters) {
        if (!isV2(master) || master.id !== mapping.master_id) continue
        for (const variant of master.variants) {
          if (variant.master_id === master.id && variant.computed_role === mapping.role) candidates.push({ variant, master })
        }
      }
      if (candidates.length === 1) match = candidates[0]
    }
    addMapping(index, mapping, match)
  })

  return resolved
    .sort((a, b) => {
      const aActive = a.activeOrder !== undefined
      const bActive = b.activeOrder !== undefined
      if (aActive && bActive) return a.activeOrder! - b.activeOrder!
      if (aActive) return -1
      if (bActive) return 1
      return a.firstIndex - b.firstIndex
    })
    .map(({ group }) => group)
}
