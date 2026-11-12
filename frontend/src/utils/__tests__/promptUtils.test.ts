// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { prependToPrompt, appendToPrompt } from '../promptUtils'
import type { PromptOutputGroup, PromptTemplateStructure } from '../../api/types'
import {
  isWorkflowTemplateActive,
  normalizePromptSegment,
  formatEnabledBlockChips,
  joinOutputGroup,
  computeAllOutputGroupValues,
  serializePresetState,
  parsePresetState,
  createDefaultPresetState,
  addRepeatInstance,
  removeRepeatInstance,
  updateBlockChips,
  type PromptTemplatePresetState,
} from '../promptTemplateEngine'
import type { TagChip } from '../../components/TagChipEditor/useChipParser'

const chip = (text: string, enabled = true, id?: string): TagChip => ({
  id: id || `chip-${text.replace(/\s+/g, '-')}`,
  text,
  enabled,
})

const dummyStructure: PromptTemplateStructure = {
  sections: [
    {
      id: 'character',
      name: 'キャラクター',
      is_repeatable: true,
      blocks: [
        { id: 'character_name', label: 'character name' },
        { id: 'expression', label: 'expression' },
        { id: 'upper_clothes', label: 'upper clothes' },
      ],
    },
    {
      id: 'global',
      name: '全体',
      is_repeatable: false,
      blocks: [
        { id: 'lighting', label: 'lighting' },
      ],
    },
  ],
}

describe('promptUtils', () => {
  describe('prependToPrompt', () => {
    it('prepends a prefix to an existing prompt with comma delimiter', () => {
      expect(prependToPrompt('1girl, blue eyes', 'masterpiece')).toBe('masterpiece, 1girl, blue eyes')
    })

    it('returns clean prefix when existing prompt is empty, spaces, or commas only', () => {
      expect(prependToPrompt('', 'masterpiece')).toBe('masterpiece')
      expect(prependToPrompt('   ', 'masterpiece')).toBe('masterpiece')
      expect(prependToPrompt(', , ,', 'masterpiece')).toBe('masterpiece')
    })

    it('returns clean existing prompt when prefix is empty, spaces, or commas only', () => {
      expect(prependToPrompt('1girl', '')).toBe('1girl')
      expect(prependToPrompt('1girl', '   ')).toBe('1girl')
      expect(prependToPrompt('1girl', ', , ')).toBe('1girl')
    })

    it('normalizes extra commas and spaces without producing duplicate commas', () => {
      expect(prependToPrompt(' , 1girl, blue eyes, ', ' , masterpiece, best quality, ')).toBe(
        'masterpiece, best quality, 1girl, blue eyes'
      )
    })
  })

  describe('appendToPrompt', () => {
    it('appends a suffix to an existing prompt with comma delimiter', () => {
      expect(appendToPrompt('masterpiece', '1girl, blue eyes')).toBe('masterpiece, 1girl, blue eyes')
    })

    it('returns clean suffix when existing prompt is empty, spaces, or commas only', () => {
      expect(appendToPrompt('', '1girl')).toBe('1girl')
      expect(appendToPrompt('   ', '1girl')).toBe('1girl')
      expect(appendToPrompt(' , , ', '1girl')).toBe('1girl')
    })

    it('returns clean existing prompt when suffix is empty, spaces, or commas only', () => {
      expect(appendToPrompt('1girl', '')).toBe('1girl')
      expect(appendToPrompt('1girl', '   ')).toBe('1girl')
      expect(appendToPrompt('1girl', ', ,')).toBe('1girl')
    })

    it('normalizes extra commas and spaces without producing duplicate commas', () => {
      expect(appendToPrompt(' , masterpiece, best quality, ', ' , 1girl, blue eyes, ')).toBe(
        'masterpiece, best quality, 1girl, blue eyes'
      )
    })
  })

  describe('promptTemplateEngine', () => {
    it('[REQ-425/AC-9] isWorkflowTemplateActive correctly detects active/inactive template configurations', () => {
      expect(isWorkflowTemplateActive(null)).toBe(false)
      expect(isWorkflowTemplateActive(undefined)).toBe(false)
      expect(isWorkflowTemplateActive({ output_groups: [] })).toBe(false)
      expect(
        isWorkflowTemplateActive({
          template_id: 1,
          output_groups: [],
        })
      ).toBe(false)
      expect(
        isWorkflowTemplateActive({
          template_id: 1,
          output_groups: [
            {
              id: 'g1',
              name: 'Main',
              target_role: 'positive',
              block_ids: ['b1'],
              repeat_filter: { mode: 'all' },
            },
          ],
        })
      ).toBe(true)
      expect(
        isWorkflowTemplateActive({
          template_id: null,
          template_snapshot: dummyStructure,
          output_groups: [
            {
              id: 'g1',
              name: 'Main',
              target_role: 'positive',
              block_ids: ['b1'],
              repeat_filter: { mode: 'all' },
            },
          ],
        })
      ).toBe(true)
    })

    it('[REQ-425/AC-5] scopes asset tag addition to a single repeat instance block and compacts remaining instances on removal', () => {
      let state = createDefaultPresetState(dummyStructure)
      // Character 1 has character_name: 'alice'
      state = updateBlockChips(state, 'character', 0, 'character_name', [chip('alice')])

      // Add second character instance
      state = addRepeatInstance(state, 'character', dummyStructure)
      expect(state.sections.character.instances).toHaveLength(2)

      // Add asset tags to character 2 upper_clothes only
      state = updateBlockChips(state, 'character', 1, 'upper_clothes', [chip('suit'), chip('tie')])

      // Verify character 1 was not polluted
      expect(state.sections.character.instances[0].blocks.upper_clothes ?? []).toEqual([])
      expect(state.sections.character.instances[0].blocks.character_name).toEqual([chip('alice')])

      // Verify character 2 has the added tags
      expect(state.sections.character.instances[1].blocks.upper_clothes).toEqual([chip('suit'), chip('tie')])

      // Remove character 1
      state = removeRepeatInstance(state, 'character', 0)
      expect(state.sections.character.instances).toHaveLength(1)
      // Remaining character is former character 2, now compacted at index 0
      expect(state.sections.character.instances[0].blocks.upper_clothes).toEqual([chip('suit'), chip('tie')])
    })

    it('[REQ-425/AC-6] evaluates overlapping output groups independently in instance order while skipping disabled chips and empty blocks', () => {
      const state: PromptTemplatePresetState = {
        version: 1,
        templateId: 1,
        sections: {
          character: {
            instances: [
              {
                instanceId: 'char-1',
                blocks: {
                  character_name: [chip('alice')],
                  expression: [chip('smile')],
                  upper_clothes: [chip('shirt', false)], // all disabled
                },
              },
              {
                instanceId: 'char-2',
                blocks: {
                  character_name: [chip('bob')],
                  expression: [], // empty
                  upper_clothes: [chip('coat')],
                },
              },
            ],
          },
          global: {
            instances: [
              {
                instanceId: 'global-1',
                blocks: {
                  lighting: [chip('rim light')],
                },
              },
            ],
          },
        },
      }

      const groupA: PromptOutputGroup = {
        id: 'g1',
        name: 'Node A All',
        target_role: 'node_a',
        block_ids: ['character_name', 'expression', 'upper_clothes', 'lighting'],
        repeat_filter: { mode: 'all' },
      }

      const groupB: PromptOutputGroup = {
        id: 'g2',
        name: 'Node B Face',
        target_role: 'node_b',
        block_ids: ['character_name', 'expression'],
        repeat_filter: { mode: 'all' },
      }

      const joinedA = joinOutputGroup(dummyStructure, state, groupA)
      const joinedB = joinOutputGroup(dummyStructure, state, groupB)

      // AC-6 specified output: "alice, smile, bob, coat, rim light" and "alice, smile, bob"
      expect(joinedA).toBe('alice, smile, bob, coat, rim light')
      expect(joinedB).toBe('alice, smile, bob')

      const allValues = computeAllOutputGroupValues(dummyStructure, state, [groupA, groupB])
      expect(allValues).toEqual({
        node_a: 'alice, smile, bob, coat, rim light',
        node_b: 'alice, smile, bob',
      })
    })

    it('[REQ-425/AC-7] preserves disabled chips and multi-instance structure in preset state JSON', () => {
      const originalState: PromptTemplatePresetState = {
        version: 1,
        templateId: 42,
        sections: {
          character: {
            instances: [
              {
                instanceId: 'char-1',
                blocks: {
                  character_name: [chip('alice', true)],
                  upper_clothes: [chip('shirt', false), chip('ribbon', true)],
                },
              },
              {
                instanceId: 'char-2',
                blocks: {
                  character_name: [chip('bob', true)],
                  upper_clothes: [chip('coat', false)],
                },
              },
            ],
          },
        },
      }

      const serialized = serializePresetState(originalState)
      expect(typeof serialized).toBe('string')
      expect(serialized).toContain('"enabled":false')

      const parsed = parsePresetState(serialized, dummyStructure)
      expect(parsed.version).toBe(1)
      expect(parsed.templateId).toBe(42)
      expect(parsed.sections.character.instances).toHaveLength(2)

      const char1Clothes = parsed.sections.character.instances[0].blocks.upper_clothes
      expect(char1Clothes).toHaveLength(2)
      expect(char1Clothes[0]).toMatchObject({ text: 'shirt', enabled: false })
      expect(char1Clothes[1]).toMatchObject({ text: 'ribbon', enabled: true })

      const char2Clothes = parsed.sections.character.instances[1].blocks.upper_clothes
      expect(char2Clothes).toHaveLength(1)
      expect(char2Clothes[0]).toMatchObject({ text: 'coat', enabled: false })
    })

    it('[REQ-425/AC-10] skips non-existent repeat instance index without error or extra commas and joins 1st and 2nd instances when added', () => {
      const groupA: PromptOutputGroup = {
        id: 'ga',
        name: 'Node A',
        target_role: 'node_a',
        block_ids: ['character_name', 'upper_clothes'],
        repeat_filter: { mode: 'all' },
      }
      const groupB: PromptOutputGroup = {
        id: 'gb',
        name: 'Node B',
        target_role: 'node_b',
        block_ids: ['character_name', 'upper_clothes'],
        repeat_filter: { mode: 'index', index: 1 },
      }
      const groupC: PromptOutputGroup = {
        id: 'gc',
        name: 'Node C',
        target_role: 'node_c',
        block_ids: ['character_name', 'upper_clothes'],
        repeat_filter: { mode: 'index', index: 2 },
      }

      // Step 1: Only Character 1 exists
      const state1Char: PromptTemplatePresetState = {
        version: 1,
        templateId: 1,
        sections: {
          character: {
            instances: [
              {
                instanceId: 'c1',
                blocks: {
                  character_name: [chip('alice')],
                  upper_clothes: [chip('dress')],
                },
              },
            ],
          },
        },
      }

      expect(joinOutputGroup(dummyStructure, state1Char, groupA)).toBe('alice, dress')
      expect(joinOutputGroup(dummyStructure, state1Char, groupB)).toBe('alice, dress')
      expect(joinOutputGroup(dummyStructure, state1Char, groupC)).toBe('') // Instance 2 does not exist, empty without error

      // Step 2: Character 2 added
      const state2Chars: PromptTemplatePresetState = {
        ...state1Char,
        sections: {
          character: {
            instances: [
              ...state1Char.sections.character.instances,
              {
                instanceId: 'c2',
                blocks: {
                  character_name: [chip('bob')],
                  upper_clothes: [chip('suit')],
                },
              },
            ],
          },
        },
      }

      expect(joinOutputGroup(dummyStructure, state2Chars, groupA)).toBe('alice, dress, bob, suit')
      expect(joinOutputGroup(dummyStructure, state2Chars, groupB)).toBe('alice, dress')
      expect(joinOutputGroup(dummyStructure, state2Chars, groupC)).toBe('bob, suit')
    })

    it('[REQ-425/AC-10] RT-1: joins prompt blocks without leading, trailing, or double commas even with empty or all-disabled blocks', () => {
      expect(normalizePromptSegment('')).toBe('')
      expect(normalizePromptSegment('   ')).toBe('')
      expect(normalizePromptSegment(' , , , ')).toBe('')
      expect(normalizePromptSegment(' , tag1, , tag2 , , ')).toBe('tag1, tag2')
      expect(normalizePromptSegment(', (masterpiece:1.2), , 1girl, ')).toBe('(masterpiece:1.2), 1girl')

      expect(formatEnabledBlockChips([])).toBe('')
      expect(formatEnabledBlockChips([chip('disabled', false)])).toBe('')
      expect(formatEnabledBlockChips([chip('  , ,  ', true)])).toBe('')
      expect(formatEnabledBlockChips([chip('a', false), chip('b', true), chip('c', false)])).toBe('b')

      const state: PromptTemplatePresetState = {
        version: 1,
        templateId: 1,
        sections: {
          character: {
            instances: [
              {
                instanceId: 'c1',
                blocks: {
                  character_name: [chip('disabled', false)],
                  expression: [chip('  , ,  ')],
                  upper_clothes: [chip('1girl')],
                },
              },
            ],
          },
          global: {
            instances: [
              {
                instanceId: 'g1',
                blocks: {
                  lighting: [chip(', indoors, ')],
                },
              },
            ],
          },
        },
      }
      const group: PromptOutputGroup = {
        id: 'g',
        name: 'G',
        target_role: 'pos',
        block_ids: ['character_name', 'expression', 'upper_clothes', 'lighting'],
        repeat_filter: { mode: 'all' },
      }
      expect(joinOutputGroup(dummyStructure, state, group)).toBe('1girl, indoors')
    })
  })
})
