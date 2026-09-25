import { describe, it, expect } from 'vitest';
import {
  parseTagWeight,
  formatTagWithWeight,
  computeCommonTags,
  computeCommonLoras,
  getSamplerOptions,
  getSchedulerOptions,
} from '../utils';
import type { WorkflowPreset } from '../../../api/types';
import { DEFAULT_SAMPLERS, DEFAULT_SCHEDULERS } from '../../../pages/GeneratePage/components/ParamPanel';

describe('ProfileBulkEditModal/utils', () => {
  describe('parseTagWeight', () => {
    it('parses weighted tags correctly', () => {
      const result = parseTagWeight('(masterpiece:1.2)');
      expect(result).toEqual({
        base: 'masterpiece',
        weight: 1.2,
        isParenthesized: true,
      });
    });

    it('parses parenthesized tags without weight', () => {
      const result = parseTagWeight('(1girl)');
      expect(result).toEqual({
        base: '1girl',
        weight: null,
        isParenthesized: true,
      });
    });

    it('parses normal tags without parentheses', () => {
      const result = parseTagWeight('solo');
      expect(result).toEqual({
        base: 'solo',
        weight: null,
        isParenthesized: false,
      });
    });

    it('handles tags with spaces correctly', () => {
      const result = parseTagWeight('  ( blue eyes : 0.8 )  ');
      expect(result).toEqual({
        base: 'blue eyes',
        weight: 0.8,
        isParenthesized: true,
      });
    });
  });

  describe('formatTagWithWeight', () => {
    it('returns base if weight is null', () => {
      expect(formatTagWithWeight('masterpiece', null)).toBe('masterpiece');
    });

    it('returns base if weight is 1.0', () => {
      expect(formatTagWithWeight('masterpiece', 1.0)).toBe('masterpiece');
    });

    it('formats with weight if weight is not 1.0 and not null', () => {
      expect(formatTagWithWeight('masterpiece', 1.3)).toBe('(masterpiece:1.3)');
    });

    it('returns base if weight is NaN', () => {
      expect(formatTagWithWeight('masterpiece', NaN)).toBe('masterpiece');
    });
  });

  describe('computeCommonTags', () => {
    it('returns empty array when presets or targetRoles are empty', () => {
      expect(computeCommonTags([], ['prompt'])).toEqual([]);
      expect(computeCommonTags([{ id: 1, name: 'P1' } as WorkflowPreset], [])).toEqual([]);
    });

    it('computes intersection of tags across all presets case-insensitively', () => {
      const presets: WorkflowPreset[] = [
        {
          id: 1,
          name: 'Preset 1',
          workflow_id: 1,
          param_values: {
            prompt: '1girl, Masterpiece, (blue eyes:1.2)',
          },
        } as unknown as WorkflowPreset,
        {
          id: 2,
          name: 'Preset 2',
          workflow_id: 1,
          param_values: {
            prompt: 'masterpiece, 1girl, solo',
          },
        } as unknown as WorkflowPreset,
      ];

      const common = computeCommonTags(presets, ['prompt']);
      // 1girl and Masterpiece are present in both
      expect(common).toContain('1girl');
      expect(common).toContain('Masterpiece');
      expect(common).not.toContain('solo');
      expect(common).not.toContain('(blue eyes:1.2)');
    });

    it('handles multiple roles per preset', () => {
      const presets: WorkflowPreset[] = [
        {
          id: 1,
          name: 'Preset 1',
          workflow_id: 1,
          param_values: {
            pos1: 'tagA, tagB',
            pos2: 'tagC',
          },
        } as unknown as WorkflowPreset,
        {
          id: 2,
          name: 'Preset 2',
          workflow_id: 1,
          param_values: {
            pos1: 'tagA',
            pos2: 'tagC, tagD',
          },
        } as unknown as WorkflowPreset,
      ];

      const common = computeCommonTags(presets, ['pos1', 'pos2']);
      expect(common).toEqual(['tagA', 'tagC']);
    });
  });

  describe('computeCommonLoras', () => {
    it('returns empty array if presets is empty', () => {
      expect(computeCommonLoras([], 'role1')).toEqual([]);
    });

    it('computes common loras across presets case-insensitively', () => {
      const presets: WorkflowPreset[] = [
        {
          id: 1,
          name: 'Preset 1',
          workflow_id: 1,
          param_values: {
            main_lora_count: '2',
            main_lora_name_1: 'detail_tweaker.safetensors',
            main_lora_wt_1: '0.8',
            main_model_str_1: '0.8',
            main_clip_str_1: '0.8',
            main_lora_name_2: 'anime_style.safetensors',
            main_lora_wt_2: '1.0',
            main_model_str_2: '1.0',
            main_clip_str_2: '1.0',
          },
        } as unknown as WorkflowPreset,
        {
          id: 2,
          name: 'Preset 2',
          workflow_id: 1,
          param_values: {
            main_lora_count: '1',
            main_lora_name_1: 'DETAIL_TWEAKER.safetensors',
            main_lora_wt_1: '0.5',
            main_model_str_1: '0.5',
            main_clip_str_1: '0.5',
          },
        } as unknown as WorkflowPreset,
      ];

      const common = computeCommonLoras(presets, 'main');
      expect(common.length).toBe(1);
      expect(common[0].name).toBe('detail_tweaker.safetensors');
      expect(common[0].weight).toBe('0.8');
    });

    it('returns empty if no common loras exist', () => {
      const presets: WorkflowPreset[] = [
        {
          id: 1,
          name: 'P1',
          workflow_id: 1,
          param_values: {
            main_lora_count: '1',
            main_lora_name_1: 'loraA',
          },
        } as unknown as WorkflowPreset,
        {
          id: 2,
          name: 'P2',
          workflow_id: 1,
          param_values: {
            main_lora_count: '1',
            main_lora_name_1: 'loraB',
          },
        } as unknown as WorkflowPreset,
      ];
      expect(computeCommonLoras(presets, 'main')).toEqual([]);
    });
  });

  describe('getSamplerOptions & getSchedulerOptions', () => {
    it('returns comfyObjectInfo sampler/scheduler options when available', () => {
      const fakeComfy = {
        KSampler: {
          input: {
            required: {
              sampler_name: [['euler', 'dpmpp_2m']],
              scheduler: [['normal', 'karras']],
            },
          },
        },
      };

      expect(getSamplerOptions(fakeComfy)).toEqual(['euler', 'dpmpp_2m']);
      expect(getSchedulerOptions(fakeComfy)).toEqual(['normal', 'karras']);
    });

    it('falls back to KSamplerAdvanced when KSampler is missing', () => {
      const fakeComfy = {
        KSamplerAdvanced: {
          input: {
            required: {
              sampler_name: [['heun']],
              scheduler: [['exponential']],
            },
          },
        },
      };

      expect(getSamplerOptions(fakeComfy)).toEqual(['heun']);
      expect(getSchedulerOptions(fakeComfy)).toEqual(['exponential']);
    });

    it('falls back to defaults when comfyObjectInfo has no sampler/scheduler', () => {
      expect(getSamplerOptions(undefined)).toEqual(DEFAULT_SAMPLERS);
      expect(getSchedulerOptions(undefined)).toEqual(DEFAULT_SCHEDULERS);
      expect(getSamplerOptions({})).toEqual(DEFAULT_SAMPLERS);
      expect(getSchedulerOptions({})).toEqual(DEFAULT_SCHEDULERS);
    });
  });
});
