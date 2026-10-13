import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildWiringStageGroups } from '../wiringStageGroups'
import { generationWorkflow, hydrateSlotStates, isSlotEnabled, setStageEnabled, slotKey } from '../workflowMappingState'

describe('REQ-358/STATE', () => {
  it('[REQ-358/AC-20] hydrates explicit states, saved mappings, then defaults', () => {
    const slots = [{ masterId: 1, variantId: 11, defaultEnabled: false }, { masterId: 2, defaultEnabled: true }]
    expect(hydrateSlotStates({ 'v:11': false, 'v:999': false }, [{ master_id: 1, variant_id: 11, node_id: '' }], slots))
      .toEqual({ 'v:11': false, 'v:999': false, 'm:2': true })
    expect(hydrateSlotStates(undefined, [{ master_id: 1, variant_id: 11, node_id: '' }], slots))
      .toEqual({ 'v:11': true, 'm:2': true })
  })

  it('[REQ-358/AC-21] updates only exact stage slots and preserves unknown keys', () => {
    const slots = [
      { masterId: 1, variantId: 11, stageId: 10, defaultEnabled: true },
      { masterId: 1, variantId: 12, stageId: 10, defaultEnabled: false },
      { masterId: 2, variantId: 21, stageId: 20, defaultEnabled: true },
      { masterId: 2, variantId: 22, stageId: 1, defaultEnabled: true },
      { masterId: 4, defaultEnabled: true },
    ]
    const states = { 'v:11': true, 'v:12': false, 'v:21': true, 'v:22': false, 'm:4': false, 'v:999': false }
    const changed = setStageEnabled(states, slots, 10, false)
    expect(changed).toEqual({ ...states, 'v:11': false, 'v:12': false })
    expect(changed).not.toBe(states)
    expect(states['v:11']).toBe(true)
  })

  it('[REQ-358/AC-22] enables all displayed slots, including default-disabled slots', () => {
    const slots = [{ masterId: 1, variantId: 11, stageId: 10, defaultEnabled: false }, { masterId: 1, variantId: 12, stageId: 10, defaultEnabled: true }]
    expect(setStageEnabled({ 'v:12': false, 'v:999': false }, slots, 10, true))
      .toEqual({ 'v:12': true, 'v:999': false, 'v:11': true })
  })

  it('[REQ-358/AC-21/22] handles an empty stage and adds only displayed missing keys', () => {
    const states = { 'v:999': false }
    const slots = [{ masterId: 1, variantId: 11, stageId: 10, defaultEnabled: false }, { masterId: 2, variantId: 22, defaultEnabled: true }]
    expect(setStageEnabled(states, slots, 99, true)).toEqual(states)
    expect(setStageEnabled(states, slots, 10, false)).toEqual({ 'v:999': false, 'v:11': false })
  })

  it('[REQ-358/AC-23/31] filters only explicit false states without mutating frozen inputs', () => {
    const records = [
      Object.freeze({ master_id: 1, variant_id: 11, node_id: 'a', metadata: { a: 1 } }),
      Object.freeze({ master_id: 1, variant_id: 12, node_id: 'b' }),
      Object.freeze({ master_id: 2, variant_id: 21, node_id: 'c' }),
      Object.freeze({ master_id: 4, variant_id: null, node_id: 'd' }),
      Object.freeze({ master_id: 5, node_id: 'e' }),
    ]
    const states = Object.freeze({ 'v:11': false, 'v:12': true, 'm:4': false, 'v:999': false })
    const raw = Object.freeze({ mappings: Object.freeze(records), mapping_slot_states: states, json_body: { keep: true }, extra: 'x' })
    const output = generationWorkflow(raw)
    expect(output).not.toBe(raw)
    expect(output.mappings).not.toBe(raw.mappings)
    expect(output.mappings).toEqual([records[1], records[2], records[4]])
    expect(output.mappings[0]).toBe(records[1])
    expect(output.mapping_slot_states).toBe(states)
    expect(output.json_body).toBe(raw.json_body)
    expect(output.extra).toBe('x')
    expect(raw.mappings).toHaveLength(5)
    expect(states['v:999']).toBe(false)
  })

  it('[REQ-359/AC-4] keeps raw mappings and slot states unchanged while preserving generated mapping order', () => {
    const mappings = Object.freeze([
      Object.freeze({ master_id: 1, variant_id: 11, node_id: 'first' }),
      Object.freeze({ master_id: 2, variant_id: 22, node_id: 'disabled' }),
      Object.freeze({ master_id: 3, variant_id: 33, node_id: 'last' }),
    ])
    const mappingSlotStates = Object.freeze({ 'v:11': true, 'v:22': false, 'v:33': true, 'v:999': false })
    const raw = Object.freeze({ mappings, mapping_slot_states: mappingSlotStates })

    const generated = generationWorkflow(raw)

    expect(generated.mappings.map((mapping) => mapping.node_id)).toEqual(['first', 'last'])
    expect(raw.mappings).toBe(mappings)
    expect(raw.mappings.map((mapping) => mapping.node_id)).toEqual(['first', 'disabled', 'last'])
    expect(raw.mapping_slot_states).toBe(mappingSlotStates)
    expect(raw.mapping_slot_states).toEqual({ 'v:11': true, 'v:22': false, 'v:33': true, 'v:999': false })
  })

  it('[REQ-358/AC-31] keeps all mappings when state is absent or empty', () => {
    const mappings = [{ master_id: 99, variant_id: 8, node_id: 'x' }]
    expect(generationWorkflow({ mappings }).mappings).toEqual(mappings)
    expect(generationWorkflow({ mappings, mapping_slot_states: {} }).mappings).toEqual(mappings)
    expect(generationWorkflow({ mappings, mapping_slot_states: { 'v:999': false } }).mappings).toEqual(mappings)
  })

  it('[REQ-358/AC-23/31] returns a new empty mapping array when all mappings are disabled', () => {
    const mappings = Object.freeze([Object.freeze({ master_id: 1, node_id: 'x' })])
    const raw = Object.freeze({ mappings, mapping_slot_states: Object.freeze({ 'm:1': false }) })
    const output = generationWorkflow(raw)
    expect(output.mappings).toEqual([])
    expect(output.mappings).not.toBe(mappings)
    expect(raw.mappings).toHaveLength(1)
  })

  it('[REQ-358/AC-20] uses canonical variant and legacy slot keys', () => {
    expect(slotKey(4)).toBe('m:4')
    expect(slotKey(4, null)).toBe('m:4')
    expect(slotKey(4, 7)).toBe('v:7')
    expect(isSlotEnabled({}, 'v:7')).toBe(true)
    expect(isSlotEnabled({ 'v:7': false }, 'v:7')).toBe(false)
  })

  it('[REQ-358/AC-21/22] preserves non-target stage values across generated slot sets', () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.integer({ min: 1, max: 1000 }), { maxLength: 30 }),
      fc.integer({ min: 1 }), fc.boolean(),
      (ids, stageId, enabled) => {
        const slots = ids.map((id) => ({ masterId: id, variantId: id, stageId: id % 5 + 1, defaultEnabled: false }))
        const initial = Object.fromEntries(slots.map((slot) => [slotKey(slot.masterId, slot.variantId), false]))
        const changed = setStageEnabled(initial, slots, stageId, enabled)
        for (const slot of slots) {
          expect(changed[slotKey(slot.masterId, slot.variantId)]).toBe(slot.stageId === stageId ? enabled : false)
        }
        expect(initial).toEqual(Object.fromEntries(slots.map((slot) => [slotKey(slot.masterId, slot.variantId), false])))
      },
    ), { numRuns: 100 })
  })

  it('[REQ-358/AC-23/31] preserves source mapping order for generated workflow records', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ master_id: fc.integer({ min: 1 }), variant_id: fc.option(fc.integer({ min: 1 }), { nil: null }), node_id: fc.string() })),
      (mappings) => {
        const result = generationWorkflow({ mappings })
        expect(result.mappings).toEqual(mappings)
        expect(result.mappings).not.toBe(mappings)
        expect(mappings).toHaveLength(result.mappings.length)
      },
    ), { numRuns: 100 })
  })
})

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
