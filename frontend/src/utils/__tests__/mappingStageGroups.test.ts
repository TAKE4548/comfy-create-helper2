// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildParamSyncCandidates, groupMappingsByStage } from '../mappingStageGroups'

const stages = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
  { id: 2, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 2 },
]

const master = {
  id: 10, group_id: null, base_key: 'prompt', name: 'Prompt', param_name: 'text', input_type: 'textarea',
  expected_class_types: null, base_title_patterns: null, sort_order: 1,
  variants: [
    { id: 101, master_id: 10, stage_id: 1, stage_key: 'main', stage_name: 'Old Main', stage_suffix: '', custom_role_override: null, computed_role: 'positive_prompt', extra_title_patterns: null, is_enabled: true },
    { id: 102, master_id: 10, stage_id: 2, stage_key: 'rough', stage_name: 'Old Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'rough_prompt', extra_title_patterns: null, is_enabled: true },
  ],
}

const mapping = (id: number, variant_id: number | null, role: string | null = null) => ({
  id, master_id: 10, node_id: `node-${id}`, variant_id, role, param_name: 'text', input_type: 'textarea', display_name: null,
})

describe('groupMappingsByStage', () => {
  it('[REQ-347/AC-1] groups interleaved explicit variants by active stage order and preserves mapping references', () => {
    const rough = mapping(1, 102)
    const main = mapping(2, 101)
    const groups = groupMappingsByStage([rough, main], [master], stages)

    expect(groups.map(({ key, stageName }) => [key, stageName])).toEqual([['main', 'Main'], ['rough', 'Rough']])
    expect(groups[0].mappings[0]).toBe(main)
    expect(groups[1].mappings[0]).toBe(rough)
  })

  it('[REQ-347/AC-1] uses unique computed-role matches for legacy mappings, while leaving ambiguous matches unresolved', () => {
    const unique = mapping(3, null, 'rough_prompt')
    const ambiguousMaster = { ...master, variants: [...master.variants, { ...master.variants[1], id: 103, stage_key: 'other' }] }
    const ambiguous = mapping(4, null, 'rough_prompt')
    const uniqueGroups = groupMappingsByStage([unique], [master], stages)
    const ambiguousGroups = groupMappingsByStage([ambiguous], [ambiguousMaster], stages)

    expect(uniqueGroups.find(group => group.key === 'rough')?.mappings).toContain(unique)
    expect(ambiguousGroups.find(group => group.key === 'unknown')?.mappings).toContain(ambiguous)
  })

  it('[REQ-347/AC-1] keeps unresolved explicit variants and inactive or undefined stages after active stages', () => {
    const inactiveStage = { ...stages[1], is_active: false }
    const groups = groupMappingsByStage([mapping(1, 999), mapping(2, 102)], [master], [stages[0], inactiveStage])

    expect(groups.map(group => group.key)).toEqual(['unknown-variant:999', 'rough'])
    expect(groups[0].stageName).toBe('Unknown variant 999')
    expect(groups[1].stageName).toBe('Rough')

    const missing = groupMappingsByStage([mapping(3, 102)], [master], [stages[0]])
    expect(missing[0].stageName).toBe('Old Rough')
  })

  it('[REQ-347/AC-1] supports empty metadata while retaining every mapping and reprojects metadata without mutation', () => {
    const item = mapping(7, 101)
    const input = [item]
    const fallback = groupMappingsByStage(input, [], [])
    const projected = groupMappingsByStage(input, [master], stages)

    expect(fallback.flatMap(group => group.mappings)).toHaveLength(input.length)
    expect(fallback[0].mappings[0]).toBe(item)
    expect(projected[0].stageName).toBe('Main')
    expect(input).toEqual([item])
  })

  it('[REQ-347/AC-1] uses stage definition names/order when variants share a stage, and preserves source order within groups', () => {
    const first = mapping(1, 101)
    const second = mapping(2, 101)
    const groups = groupMappingsByStage([first, second], [master], stages)

    expect(groups[0].mappings).toEqual([first, second])
    expect(groups[0].stageId).toBe(1)
    expect(groups[0].stageKey).toBe('main')
  })

  it('[REQ-347/AC-1] keeps distinct stage identities separate when their display names match', () => {
    const sameNameStages = stages.map(stage => ({ ...stage, name: 'Stage' }))
    const groups = groupMappingsByStage([mapping(1, 102), mapping(2, 101)], [master], sameNameStages)

    expect(groups.map(group => group.stageId)).toEqual([1, 2])
    expect(groups.map(group => group.stageName)).toEqual(['Stage', 'Stage'])
  })
})

describe('buildParamSyncCandidates', () => {
  const syncStages = [
    { ...stages[0] },
    { ...stages[1] },
    { id: 3, key: 'detail', name: 'Detail', suffix: '_detail', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 3 },
  ]
  const variant = (id: number, master_id: number, stage_id: number, computed_role: string) => ({
    id, master_id, stage_id, stage_key: syncStages[stage_id - 1].key, stage_name: syncStages[stage_id - 1].name,
    stage_suffix: '', custom_role_override: null, computed_role, extra_title_patterns: null, is_enabled: true,
  })
  const syncMaster = (id: number, base_key: string, input_type: string, variants: ReturnType<typeof variant>[]) => ({
    id, group_id: null, base_key, name: base_key, param_name: base_key, input_type,
    expected_class_types: null, base_title_patterns: null, sort_order: id, variants,
  })
  const syncMasters = [
    syncMaster(10, 'Sampler_Steps', 'int', [
      variant(201, 10, 1, 'Sampler_Steps'), variant(202, 10, 2, 'Sampler_Steps_Rough'), variant(203, 10, 3, 'Sampler_Steps_Detail'),
    ]),
    syncMaster(20, 'Other_Steps', 'int', [variant(301, 20, 1, 'Other_Steps'), variant(302, 20, 2, 'Other_Steps_Rough')]),
    syncMaster(30, 'Sampler_CFG', 'float', [variant(401, 30, 1, 'Sampler_CFG')]),
  ]
  const sm = (id: number, master_id: number, variant_id: number | null, role: string | null, input_type: string | null, display_name: string | null) => ({
    id, master_id, node_id: `n${id}`, variant_id, role, param_name: 'x', input_type, display_name,
  })
  const mainSteps = sm(1, 10, 201, 'Sampler_Steps', 'int', 'Steps')
  const roughSteps = sm(2, 10, 202, 'Sampler_Steps_Rough', 'int', 'Steps')
  const detailSteps = sm(3, 10, 203, 'Sampler_Steps_Detail', 'int', 'Steps')
  const roughOther = sm(4, 20, 302, 'Other_Steps_Rough', 'int', 'OtherSteps')
  const mainCfg = sm(5, 30, 401, 'Sampler_CFG', 'float', 'CFG')

  it('[REQ-351/AC-1] builds stage-qualified candidates for every mapped role in stage order', () => {
    const result = buildParamSyncCandidates([detailSteps, mainCfg, roughOther, roughSteps, mainSteps], syncMasters, syncStages)

    expect(result).toEqual([
      { role: 'Sampler_CFG', stageName: 'Main', displayName: 'CFG', inputType: 'float' },
      { role: 'Sampler_Steps', stageName: 'Main', displayName: 'Steps', inputType: 'int' },
      { role: 'Other_Steps_Rough', stageName: 'Rough', displayName: 'OtherSteps', inputType: 'int' },
      { role: 'Sampler_Steps_Rough', stageName: 'Rough', displayName: 'Steps', inputType: 'int' },
      { role: 'Sampler_Steps_Detail', stageName: 'Detail', displayName: 'Steps', inputType: 'int' },
    ])
  })

  it('[REQ-351/AC-1] dedupes duplicate roles and skips null roles without mutating inputs', () => {
    const duplicate = sm(6, 10, 202, 'Sampler_Steps_Rough', 'int', 'Steps dup')
    const nullRole = sm(7, 10, 201, null, 'int', 'No role')
    const emptyRole = sm(8, 10, 201, '', 'int', 'Empty role')
    const blankName = sm(9, 20, 302, 'Other_Steps_Rough', 'int', '')
    const input = [mainSteps, nullRole, roughSteps, duplicate, emptyRole, blankName]
    const snapshot = JSON.parse(JSON.stringify(input))
    const mastersSnapshot = JSON.parse(JSON.stringify(syncMasters))

    const result = buildParamSyncCandidates(input, syncMasters, syncStages)

    expect(result.map(c => c.role)).toEqual(['Sampler_Steps', 'Sampler_Steps_Rough', 'Other_Steps_Rough'])
    expect(result[1].displayName).toBe('Steps')
    expect(result[2].displayName).toBeNull()
    expect(input).toEqual(snapshot)
    expect(syncMasters).toEqual(mastersSnapshot)
  })

  it('[REQ-351/AC-1] leaves stageName null when a mapping cannot be resolved to a stage', () => {
    const orphan = sm(10, 99, null, 'Legacy_Role', 'int', 'Legacy')
    const unknownVariant = sm(11, 10, 999, 'Ghost_Role', 'int', 'Ghost')
    const result = buildParamSyncCandidates([orphan, unknownVariant, mainSteps], syncMasters, syncStages)

    expect(result.find(c => c.role === 'Legacy_Role')).toEqual({ role: 'Legacy_Role', stageName: null, displayName: 'Legacy', inputType: 'int' })
    expect(result.find(c => c.role === 'Ghost_Role')?.stageName).toBeNull()
    expect(result.find(c => c.role === 'Sampler_Steps')?.stageName).toBe('Main')
  })
})
