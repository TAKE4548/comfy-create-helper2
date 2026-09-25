import { describe, it, expect } from 'vitest'
import { computePresetPatch } from '../presetBulkPatcher'
import type { WorkflowPreset } from '../../../../api/types'
import type { BulkEditPayload } from '../../../../components/ProfileBulkEditModal'

describe('presetBulkPatcher - computePresetPatch', () => {
  const basePreset: WorkflowPreset = {
    id: 1,
    workflow_id: 10,
    name: 'Test Preset',
    description: '',
    param_values: {
      prompt: '1girl, masterpiece, solo, blue eyes',
      negative_prompt: 'bad quality, worst quality',
      other_param: 'some_value',
    },
    applied_assets: {},
    batch_size: 1,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  describe('promptOps', () => {
    it('handles search_replace correctly', () => {
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'search_replace',
            fields: ['prompt'],
            find: 'blue eyes',
            replace: 'red eyes',
          },
        ],
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.prompt).toBe('1girl, masterpiece, solo, red eyes')
      expect(patch.param_values.negative_prompt).toBe('bad quality, worst quality')
    })

    it('handles overwrite correctly and clears appliedAssets for that field', () => {
      const presetWithAssets: WorkflowPreset = {
        ...basePreset,
        applied_assets: {
          prompt: [
            {
              type: 'lora',
              assetId: 'lora-1',
              name: 'lora1',
              loraPromptString: '<lora:test:1.0>',
            },
          ],
        },
      }
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'overwrite',
            fields: ['prompt'],
            value: 'overwritten prompt',
          },
        ],
      }
      const patch = computePresetPatch(presetWithAssets, payload)
      expect(patch.param_values.prompt).toBe('overwritten prompt')
      expect(patch.applied_assets.prompt).toBeUndefined()
    })

    it('handles prefix correctly', () => {
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'prefix',
            fields: ['prompt'],
            value: 'best quality',
          },
        ],
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.prompt).toBe('best quality, 1girl, masterpiece, solo, blue eyes')
    })

    it('handles suffix correctly', () => {
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'suffix',
            fields: ['prompt'],
            value: 'highly detailed',
          },
        ],
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.prompt).toBe('1girl, masterpiece, solo, blue eyes, highly detailed')
    })

    it('handles remove_tags with simple tag list', () => {
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'remove_tags',
            fields: ['prompt'],
            tags: ['solo', 'blue eyes'],
          },
        ],
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.prompt).toBe('1girl, masterpiece')
    })

    it('handles remove_tags with commonTagOps (remove and update actions)', () => {
      const payload: BulkEditPayload = {
        promptOps: [
          {
            op: 'remove_tags',
            fields: ['prompt'],
            commonTagOps: [
              {
                action: 'remove',
                originalBase: 'masterpiece',
                originalFormattedTag: 'masterpiece',
                newFormattedTag: '',
              },
              {
                action: 'update',
                originalBase: 'solo',
                originalFormattedTag: 'solo',
                newFormattedTag: '(solo:1.2)',
              },
            ],
          },
        ],
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.prompt).toBe('1girl, (solo:1.2), blue eyes')
    })
  })

  describe('paramPatch', () => {
    it('applies simple paramPatch', () => {
      const payload: BulkEditPayload = {
        paramPatch: {
          cfg_scale: '7.5',
          steps: '28',
        },
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.param_values.cfg_scale).toBe('7.5')
      expect(patch.param_values.steps).toBe('28')
    })

    it('cleans up previous dynamic slot keys when paramPatch contains _lora_count', () => {
      const presetWithLora: WorkflowPreset = {
        ...basePreset,
        param_values: {
          ...basePreset.param_values,
          main_lora_count: '2',
          main_lora_name_1: 'old_lora_1',
          main_lora_wt_1: '0.8',
          main_model_str_1: '1.0',
          main_clip_str_1: '1.0',
          main_lora_name_2: 'old_lora_2',
          main_lora_wt_2: '0.5',
          main_model_str_2: '0.5',
          main_clip_str_2: '0.5',
        },
      }
      const payload: BulkEditPayload = {
        paramPatch: {
          main_lora_count: '1',
          main_lora_name_1: 'new_lora',
          main_lora_wt_1: '1.0',
          main_model_str_1: '1.0',
          main_clip_str_1: '1.0',
        },
      }
      const patch = computePresetPatch(presetWithLora, payload)
      expect(patch.param_values.main_lora_count).toBe('1')
      expect(patch.param_values.main_lora_name_1).toBe('new_lora')
      expect(patch.param_values.main_lora_name_2).toBeUndefined()
      expect(patch.param_values.main_lora_wt_2).toBeUndefined()
    })
  })

  describe('loraStackOps', () => {
    it('applies loraStackOps overwrite mode', () => {
      const presetWithOldSlots: WorkflowPreset = {
        ...basePreset,
        param_values: {
          ...basePreset.param_values,
          style_lora_count: '1',
          style_lora_name_1: 'old_style',
          style_lora_wt_1: '0.5',
          style_model_str_1: '0.5',
          style_clip_str_1: '0.5',
        },
      }
      const payload: BulkEditPayload = {
        loraStackOps: [
          {
            role: 'style',
            mode: 'overwrite',
            slots: [
              { name: 'style_a', weight: '0.8', modelStrength: '0.9', clipStrength: '0.9' },
              { name: 'style_b', weight: '0.6', modelStrength: '0.7', clipStrength: '0.7' },
            ],
          },
        ],
      }
      const patch = computePresetPatch(presetWithOldSlots, payload)
      expect(patch.param_values.style_lora_count).toBe('2')
      expect(patch.param_values.style_lora_name_1).toBe('style_a')
      expect(patch.param_values.style_lora_wt_1).toBe('0.8')
      expect(patch.param_values.style_lora_name_2).toBe('style_b')
      expect(patch.param_values.style_lora_wt_2).toBe('0.6')
    })

    it('applies loraStackOps differential mode (remove, update, add)', () => {
      const presetWithSlots: WorkflowPreset = {
        ...basePreset,
        param_values: {
          ...basePreset.param_values,
          char_lora_count: '2',
          char_lora_name_1: 'char_keep',
          char_lora_wt_1: '0.5',
          char_model_str_1: '1.0',
          char_clip_str_1: '1.0',
          char_lora_name_2: 'char_remove',
          char_lora_wt_2: '0.7',
          char_model_str_2: '1.0',
          char_clip_str_2: '1.0',
        },
      }
      const payload: BulkEditPayload = {
        loraStackOps: [
          {
            role: 'char',
            mode: 'differential',
            commonOps: [
              {
                name: 'char_remove',
                action: 'remove',
              },
              {
                name: 'char_keep',
                action: 'update',
                weight: '0.95',
                modelStrength: '1.0',
                clipStrength: '1.0',
              },
            ],
            addSlots: [
              { name: 'char_new', weight: '0.8', modelStrength: '1.0', clipStrength: '1.0' },
            ],
          },
        ],
      }
      const patch = computePresetPatch(presetWithSlots, payload)
      expect(patch.param_values.char_lora_count).toBe('2')
      expect(patch.param_values.char_lora_name_1).toBe('char_keep')
      expect(patch.param_values.char_lora_wt_1).toBe('0.95')
      expect(patch.param_values.char_lora_name_2).toBe('char_new')
      expect(patch.param_values.char_lora_wt_2).toBe('0.8')
    })
  })

  describe('batchSize', () => {
    it('updates batch_size when provided in payload', () => {
      const payload: BulkEditPayload = {
        batchSize: 4,
      }
      const patch = computePresetPatch(basePreset, payload)
      expect(patch.batch_size).toBe(4)
    })
  })

  describe('loraOps', () => {
    it('supports append and replace modes for loraOps', () => {
      const asset1 = {
        type: 'lora' as const,
        assetId: 'lora1',
        name: 'Lora 1',
        loraPromptString: '<lora:1:1>',
      }
      const asset2 = {
        type: 'lora' as const,
        assetId: 'lora2',
        name: 'Lora 2',
        loraPromptString: '<lora:2:1>',
      }

      const appendPayload: BulkEditPayload = {
        loraOps: [
          { role: 'main', mode: 'append', asset: asset1 },
        ],
      }
      const patch1 = computePresetPatch(basePreset, appendPayload)
      expect(patch1.applied_assets.main).toEqual([asset1])

      const presetWithExisting: WorkflowPreset = {
        ...basePreset,
        applied_assets: { main: [asset1] },
      }
      const replacePayload: BulkEditPayload = {
        loraOps: [
          { role: 'main', mode: 'replace', asset: asset2 },
        ],
      }
      const patch2 = computePresetPatch(presetWithExisting, replacePayload)
      expect(patch2.applied_assets.main).toEqual([asset2])
    })
  })

  describe('assetOps', () => {
    it('appends unique assets deduplicating identical ones', () => {
      const asset1 = {
        type: 'lora' as const,
        assetId: 'lora1',
        name: 'Lora 1',
        loraPromptString: '<lora:1:1>',
      }
      const asset2 = {
        type: 'lora' as const,
        assetId: 'lora2',
        name: 'Lora 2',
        loraPromptString: '<lora:2:1>',
      }
      const presetWithExisting: WorkflowPreset = {
        ...basePreset,
        applied_assets: { main: [asset1] },
      }
      const payload: BulkEditPayload = {
        assetOps: [
          {
            role: 'main',
            mode: 'append',
            assets: [asset1, asset2],
          },
        ],
      }
      const patch = computePresetPatch(presetWithExisting, payload)
      expect(patch.applied_assets.main).toHaveLength(2)
      expect(patch.applied_assets.main[0]).toEqual(asset1)
      expect(patch.applied_assets.main[1]).toEqual(asset2)
    })
  })
})
