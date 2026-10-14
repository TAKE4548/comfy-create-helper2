import { describe, expect, it } from 'vitest'
import { groupMappingsByStage } from '../mappingStageGroups'

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
