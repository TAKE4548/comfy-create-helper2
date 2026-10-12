import { describe, expect, it } from 'vitest'
import { buildWiringStageGroups } from '../wiringStageGroups'

const stage = (id: number, key: string, sort_order: number) => ({
  id,
  key,
  name: key,
  suffix: `_${key}`,
  search_keywords: null,
  previous_suffixes: null,
  is_builtin: false,
  is_active: true,
  sort_order,
})

const variant = (id: number, stageInfo: ReturnType<typeof stage>, is_enabled = true) => ({
  id,
  master_id: 1,
  stage_id: stageInfo.id,
  stage_key: stageInfo.key,
  stage_name: stageInfo.name,
  stage_suffix: stageInfo.suffix,
  custom_role_override: null,
  computed_role: `${stageInfo.key}-role`,
  extra_title_patterns: null,
  is_enabled,
})

const activeStage = (stageInfo: ReturnType<typeof stage>) => ({
  stage: stageInfo,
  matchingNodesCount: 0,
  matchedNodeIds: [],
  isAlwaysVisible: false,
})

describe('buildWiringStageGroups', () => {
  it('sorts every stage stably, keeps empty groups, and projects enabled variant and legacy slots once', () => {
    const main = stage(1, 'main', 0)
    const rough = stage(2, 'rough', 1)
    const customA = stage(3, 'custom-a', 2)
    const customB = stage(4, 'custom-b', 2)
    const groups = buildWiringStageGroups(
      [rough, customA, main, customB].map(activeStage),
      [
        {
          id: 1,
          group_id: null,
          base_key: 'prompt',
          name: 'Prompt',
          param_name: 'text',
          input_type: 'textarea',
          expected_class_types: null,
          base_title_patterns: null,
          sort_order: 0,
          variants: [variant(1, rough), variant(2, customA, false)],
        },
        {
          id: 1,
          role: 'legacy-role',
          expected_class_types: null,
          param_name: 'legacy_text',
          input_type: 'textarea',
          display_name: 'Legacy prompt',
          title_patterns: null,
          sort_order: 1,
        },
        {
          id: 2,
          group_id: null,
          base_key: 'empty',
          name: 'Empty',
          param_name: 'value',
          input_type: 'int',
          expected_class_types: null,
          base_title_patterns: null,
          sort_order: 2,
          variants: [variant(3, customB)],
        },
      ],
      [],
    )

    expect(groups.map((group) => group.info.stage.id)).toEqual([1, 2, 3, 4])
    expect(groups.map((group) => group.slots.map((slot) => slot.slotKey))).toEqual([
      ['m:1'],
      ['v:1'],
      [],
      ['v:3'],
    ])
    expect(groups[0].slots[0]).toMatchObject({
      masterId: 1,
      variantId: undefined,
      role: 'legacy-role',
      paramName: 'legacy_text',
      inputType: 'textarea',
      stageId: 1,
    })
    expect(groups[1].slots[0]).toMatchObject({
      slotKey: 'v:1',
      variantId: 1,
      role: 'rough-role',
      paramName: 'text',
      stageId: 2,
    })
  })

  it('does not remove enabled candidates when mappings are absent and matches variants by stage key', () => {
    const stageInfo = stage(10, 'custom', 0)
    const groups = buildWiringStageGroups(
      [activeStage(stageInfo)],
      [{
        id: 5,
        group_id: null,
        base_key: 'seed',
        name: 'Seed',
        param_name: 'seed',
        input_type: 'textarea',
        expected_class_types: null,
        base_title_patterns: null,
        sort_order: 0,
        variants: [{ ...variant(8, stageInfo), stage_id: 99 }],
      }],
      [],
    )

    expect(groups[0].slots).toHaveLength(1)
    expect(groups[0].slots[0]).toMatchObject({ slotKey: 'v:8', masterId: 1, variantId: 8, stageId: 10 })
  })
})
