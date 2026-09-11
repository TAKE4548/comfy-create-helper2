import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../../useGenerationStore';
import { getEffectiveParamValues, chipsToString, areChipsEqual } from '../../slices/multiSetSlice';
import type { TagChip } from '../../../components/TagChipEditor/useChipParser';

describe('multiSetSlice helper functions', () => {
  describe('areChipsEqual', () => {
    it('returns true for identical references or both undefined', () => {
      const chips: TagChip[] = [{ id: '1', text: 'cat', enabled: true }];
      expect(areChipsEqual(chips, chips)).toBe(true);
      expect(areChipsEqual(undefined, undefined)).toBe(true);
    });

    it('returns false if one is undefined/null and other is not', () => {
      const chips: TagChip[] = [{ id: '1', text: 'cat', enabled: true }];
      expect(areChipsEqual(chips, undefined)).toBe(false);
      expect(areChipsEqual(undefined, chips)).toBe(false);
    });

    it('returns false for different array lengths', () => {
      const a: TagChip[] = [{ id: '1', text: 'cat', enabled: true }];
      const b: TagChip[] = [
        { id: '1', text: 'cat', enabled: true },
        { id: '2', text: 'dog', enabled: true },
      ];
      expect(areChipsEqual(a, b)).toBe(false);
    });

    it('returns true when contents match', () => {
      const a: TagChip[] = [
        { id: '1', text: 'cat', enabled: true },
        { id: '2', text: 'dog', enabled: false },
      ];
      const b: TagChip[] = [
        { id: '1', text: 'cat', enabled: true },
        { id: '2', text: 'dog', enabled: false },
      ];
      expect(areChipsEqual(a, b)).toBe(true);
    });

    it('returns false when id, enabled, or text differs', () => {
      const base: TagChip[] = [{ id: '1', text: 'cat', enabled: true }];
      expect(areChipsEqual(base, [{ id: '2', text: 'cat', enabled: true }])).toBe(false);
      expect(areChipsEqual(base, [{ id: '1', text: 'cat', enabled: false }])).toBe(false);
      expect(areChipsEqual(base, [{ id: '1', text: 'dog', enabled: true }])).toBe(false);
    });
  });

  describe('chipsToString', () => {
    it('converts only enabled chips to comma-separated string', () => {
      const chips: TagChip[] = [
        { id: '1', text: '1girl', enabled: true },
        { id: '2', text: 'solo', enabled: false },
        { id: '3', text: 'smile', enabled: true },
      ];
      expect(chipsToString(chips)).toBe('1girl, smile');
    });

    it('returns empty string when no chips are enabled', () => {
      const chips: TagChip[] = [
        { id: '1', text: '1girl', enabled: false },
        { id: '2', text: 'solo', enabled: false },
      ];
      expect(chipsToString(chips)).toBe('');
    });
  });

  describe('getEffectiveParamValues', () => {
    it('correctly replaces role with enabled chips only', () => {
      const paramValues = {
        positive: 'default positive prompt',
        negative: 'lowres, bad anatomy',
      };
      const promptChips: Record<string, TagChip[]> = {
        positive: [
          { id: '1', text: 'masterpiece', enabled: true },
          { id: '2', text: 'worst quality', enabled: false },
          { id: '3', text: 'best quality', enabled: true },
        ],
      };

      const effective = getEffectiveParamValues(paramValues, promptChips);
      expect(effective.positive).toBe('masterpiece, best quality');
      expect(effective.negative).toBe('lowres, bad anatomy');
    });

    it('preserves paramValues when promptChips is empty or undefined', () => {
      const paramValues = { positive: 'prompt', negative: 'lowres' };
      expect(getEffectiveParamValues(paramValues, {})).toEqual(paramValues);
      expect(getEffectiveParamValues(paramValues, undefined as any)).toEqual(paramValues);
    });
  });
});

describe('useGenerationStore REQ-220 promptChips and effectiveParamValues', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState({
      selectedWorkflowId: 1,
      paramValues: {},
      promptChips: {},
      sets: [],
      activeSetId: null,
      openPresetIds: [],
    });
  });

  it('chipsToString converts only enabled chips to comma-separated string', () => {
    const chips: TagChip[] = [
      { id: '1', text: '1girl', enabled: true },
      { id: '2', text: 'solo', enabled: false },
      { id: '3', text: 'smile', enabled: true },
    ];
    expect(chipsToString(chips)).toBe('1girl, smile');
  });

  it('getEffectiveParamValues correctly replaces role with enabled chips only', () => {
    const paramValues = {
      positive: 'default positive prompt',
      negative: 'lowres, bad anatomy',
    };
    const promptChips: Record<string, TagChip[]> = {
      positive: [
        { id: '1', text: 'masterpiece', enabled: true },
        { id: '2', text: 'worst quality', enabled: false },
        { id: '3', text: 'best quality', enabled: true },
      ],
    };

    const effective = getEffectiveParamValues(paramValues, promptChips);
    expect(effective.positive).toBe('masterpiece, best quality');
    expect(effective.negative).toBe('lowres, bad anatomy');
  });

  it('setPromptChips updates promptChips and active set', () => {
    useGenerationStore.getState().initSets(1);
    const chips: TagChip[] = [
      { id: '1', text: '1girl', enabled: true },
      { id: '2', text: 'cat ears', enabled: false },
    ];

    useGenerationStore.getState().setPromptChips('positive', chips);

    const state = useGenerationStore.getState();
    expect(state.promptChips.positive).toEqual(chips);

    const activeSet = state.sets.find((s) => s.id === state.activeSetId);
    expect(activeSet?.promptChips?.positive).toEqual(chips);
  });

  it('preserves promptChips across set addition and switching', () => {
    useGenerationStore.getState().initSets(1);
    const set1Id = useGenerationStore.getState().activeSetId;

    const chips1: TagChip[] = [
      { id: '1', text: 'prompt1', enabled: true },
      { id: '2', text: 'disabled1', enabled: false },
    ];
    useGenerationStore.getState().setPromptChips('positive', chips1);

    // Add set 2
    useGenerationStore.getState().addSet();
    const set2Id = useGenerationStore.getState().activeSetId;
    expect(set2Id).not.toBe(set1Id);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips1);

    // Modify set 2 promptChips
    const chips2: TagChip[] = [
      { id: '3', text: 'prompt2', enabled: true },
    ];
    useGenerationStore.getState().setPromptChips('positive', chips2);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips2);

    // Switch back to set 1
    useGenerationStore.getState().setActiveSetId(set1Id!);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips1);

    // Switch to set 2
    useGenerationStore.getState().setActiveSetId(set2Id!);
    expect(useGenerationStore.getState().promptChips.positive).toEqual(chips2);
  });

  it('restores promptChips from preset param_values when existing promptChips role array is empty', () => {
    useGenerationStore.getState().initSets(1);
    const presetId = 101;

    // セットに positive: [] が入ってしまっている状態をシミュレート
    useGenerationStore.setState({
      sets: [
        {
          id: presetId,
          name: 'Preset 101',
          paramValues: { positive: '' },
          promptChips: { positive: [] },
          appliedAssets: {},
          batchSize: 1,
          seedMode: 'random',
          seed: 42,
          checked: true,
        },
      ],
      activeSetId: presetId,
      openPresetIds: [presetId],
      promptChips: { positive: [] },
    });

    const mockPreset: any = {
      id: presetId,
      name: 'Preset 101',
      param_values: { positive: 'solo, smile, 1girl' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
    };

    useGenerationStore.getState().loadPresetData(mockPreset, {});

    const state = useGenerationStore.getState();
    const updatedSet = state.sets.find((s) => s.id === presetId);

    // 空配列で上書きされず、param_values.positive から正規チップが復元されていること
    expect(updatedSet?.promptChips?.positive).toBeDefined();
    expect(updatedSet?.promptChips?.positive?.length).toBe(3);
    expect(updatedSet?.promptChips?.positive?.map((c) => c.text)).toEqual(['solo', 'smile', '1girl']);
    expect(state.promptChips.positive.map((c) => c.text)).toEqual(['solo', 'smile', '1girl']);
  });
});
