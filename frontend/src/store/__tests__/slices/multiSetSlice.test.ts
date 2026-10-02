import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../../useGenerationStore';
import { getEffectiveParamValues, chipsToString, areChipsEqual } from '../../slices/multiSetSlice';
import type { TagChip } from '../../../components/TagChipEditor/useChipParser';
import type { WorkflowPreset } from '../../../api/types';

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

    it('joins chips with space if previous chip ends with dot in anima mode', () => {
      const chips: TagChip[] = [
        { id: '1', text: 'a photo of a cat.', enabled: true },
        { id: '2', text: 'highly detailed', enabled: true },
        { id: '3', text: '4k', enabled: true },
      ];
      expect(chipsToString(chips, true)).toBe('a photo of a cat. highly detailed, 4k');
      expect(chipsToString(chips, false)).toBe('a photo of a cat., highly detailed, 4k');
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

    it('passes isAnimaMode flag to chipsToString correctly', () => {
      const paramValues = { positive: 'default prompt' };
      const promptChips: Record<string, TagChip[]> = {
        positive: [
          { id: '1', text: 'subject.', enabled: true },
          { id: '2', text: 'lighting', enabled: true },
        ],
      };

      const effectiveAnima = getEffectiveParamValues(paramValues, promptChips, true);
      expect(effectiveAnima.positive).toBe('subject. lighting');

      const effectiveStandard = getEffectiveParamValues(paramValues, promptChips, false);
      expect(effectiveStandard.positive).toBe('subject., lighting');
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

  it('setAllPromptChips updates promptChips and active set', () => {
    useGenerationStore.getState().initSets(1);
    const chips: Record<string, TagChip[]> = {
      positive: [
        { id: '1', text: 'masterpiece', enabled: true },
        { id: '2', text: '1girl', enabled: true },
      ],
      negative: [
        { id: '3', text: 'worst quality', enabled: true },
      ],
    };

    useGenerationStore.getState().setAllPromptChips(chips);

    const state = useGenerationStore.getState();
    expect(state.promptChips).toEqual(chips);
    const activeSet = state.sets.find((s) => s.id === state.activeSetId);
    expect(activeSet?.promptChips).toEqual(chips);
  });

  it('reflects isAnimaMode when calling store getEffectiveParamValues', () => {
    useGenerationStore.setState({
      paramValues: { positive: 'fallback' },
      promptChips: {
        positive: [
          { id: '1', text: '1girl.', enabled: true },
          { id: '2', text: 'smile', enabled: true },
        ],
      },
      isAnimaMode: false,
    });

    expect(useGenerationStore.getState().getEffectiveParamValues().positive).toBe('1girl., smile');

    useGenerationStore.getState().setIsAnimaMode?.(true);
    expect(useGenerationStore.getState().isAnimaMode).toBe(true);
    expect(useGenerationStore.getState().getEffectiveParamValues().positive).toBe('1girl. smile');

    useGenerationStore.getState().setIsAnimaMode?.(false);
    expect(useGenerationStore.getState().isAnimaMode).toBe(false);
    expect(useGenerationStore.getState().getEffectiveParamValues().positive).toBe('1girl., smile');
  });

  describe('loadPresetData in Anima mode', () => {
    const mockPreset: WorkflowPreset = {
      id: 99,
      workflow_id: 1,
      name: 'Anima Test Preset',
      param_values: { positive: '1girl., solo.' },
      applied_assets: {},
      batch_size: 1,
      seed_mode: 'random',
      seed: 42,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    it('parses period-delimited tags (1girl., solo.) into distinct chips in Anima mode', () => {
      useGenerationStore.setState({ isAnimaMode: true, sets: [], openPresetIds: [] });
      useGenerationStore.getState().loadPresetData(mockPreset, {});

      const state = useGenerationStore.getState();
      const chips = state.promptChips.positive;
      expect(chips).toBeDefined();
      expect(chips).toHaveLength(2);
      expect(chips[0].text).toBe('1girl.');
      expect(chips[1].text).toBe('solo.');
    });

    it('preserves existing promptChips non-destructively without recreating chip IDs when text matches', () => {
      useGenerationStore.setState({ isAnimaMode: true, sets: [], openPresetIds: [] });
      useGenerationStore.getState().loadPresetData(mockPreset, {});

      const initialChips = useGenerationStore.getState().promptChips.positive;
      const initialIds = initialChips.map((c) => c.id);

      // Subsequent call where preset param_values matches chipsToString of existing chips
      const matchingPreset: WorkflowPreset = {
        ...mockPreset,
        param_values: { positive: chipsToString(initialChips, true) },
      };

      useGenerationStore.getState().loadPresetData(matchingPreset, {});

      const preservedChips = useGenerationStore.getState().promptChips.positive;
      expect(preservedChips.map((c) => c.id)).toEqual(initialIds);
      expect(preservedChips[0]).toBe(initialChips[0]);
    });

    it('AC-1: maintains period-delimited chips without merging when switching between presets and back in Anima mode', () => {
      useGenerationStore.setState({ isAnimaMode: true, sets: [], openPresetIds: [] });
      const presetA: WorkflowPreset = {
        ...mockPreset,
        id: 101,
        name: 'Preset A',
        param_values: { positive: '1girl. solo. red dress.' },
      };
      const presetB: WorkflowPreset = {
        ...mockPreset,
        id: 102,
        name: 'Preset B',
        param_values: { positive: '2boys. outdoors.' },
      };

      // 1. Load preset A
      useGenerationStore.getState().loadPresetData(presetA, {});
      const chipsA1 = useGenerationStore.getState().promptChips.positive;
      expect(chipsA1).toHaveLength(3);
      expect(chipsA1.map((c) => c.text)).toEqual(['1girl.', 'solo.', 'red dress.']);

      // 2. Load preset B
      useGenerationStore.getState().loadPresetData(presetB, {});
      const chipsB = useGenerationStore.getState().promptChips.positive;
      expect(chipsB).toHaveLength(2);
      expect(chipsB.map((c) => c.text)).toEqual(['2boys.', 'outdoors.']);

      // 3. Re-load preset A
      useGenerationStore.getState().loadPresetData(presetA, {});
      const chipsA2 = useGenerationStore.getState().promptChips.positive;
      expect(chipsA2).toHaveLength(3);
      expect(chipsA2.map((c) => c.text)).toEqual(['1girl.', 'solo.', 'red dress.']);
      expect(chipsA2[0].id).toBe(chipsA1[0].id);
    });

    it('AC-5: parses comma-separated tags and maintains backwards compatibility in non-Anima mode', () => {
      useGenerationStore.setState({ isAnimaMode: false, sets: [], openPresetIds: [] });
      const legacyPreset: WorkflowPreset = {
        ...mockPreset,
        id: 201,
        name: 'Legacy Preset',
        param_values: { positive: '1girl, solo, red dress' },
      };

      useGenerationStore.getState().loadPresetData(legacyPreset, {});
      const chips = useGenerationStore.getState().promptChips.positive;
      expect(chips).toHaveLength(3);
      expect(chips.map((c) => c.text)).toEqual(['1girl', 'solo', 'red dress']);
    });

    it('Red Teaming: protects decimal numbers (e.g. weight: 1.5, girl.) from accidental splitting', () => {
      useGenerationStore.setState({ isAnimaMode: true, sets: [], openPresetIds: [] });
      const decimalPreset: WorkflowPreset = {
        ...mockPreset,
        id: 301,
        name: 'Decimal Preset',
        param_values: { positive: 'weight: 1.5, girl.' },
      };

      useGenerationStore.getState().loadPresetData(decimalPreset, {});
      const chips = useGenerationStore.getState().promptChips.positive;
      expect(chips).toHaveLength(2);
      expect(chips[0].text).toBe('weight: 1.5');
      expect(chips[1].text).toBe('girl.');
    });

    it('Red Teaming: safely handles invalid consecutive periods (e.g. "...  ..") without errors', () => {
      useGenerationStore.setState({ isAnimaMode: true, sets: [], openPresetIds: [] });
      const invalidDotsPreset: WorkflowPreset = {
        ...mockPreset,
        id: 302,
        name: 'Invalid Dots Preset',
        param_values: { positive: '...  ..' },
      };

      expect(() => {
        useGenerationStore.getState().loadPresetData(invalidDotsPreset, {});
      }).not.toThrow();
      const chips = useGenerationStore.getState().promptChips.positive;
      expect(chips ?? []).toHaveLength(0);
    });
  });

  describe('roleTextModes', () => {
    it('initializes roleTextModes to empty object and updates mode per role via setRoleTextMode', () => {
      useGenerationStore.setState({ roleTextModes: {} });
      expect(useGenerationStore.getState().roleTextModes).toEqual({});

      useGenerationStore.getState().setRoleTextMode?.('Main_Positive_Prompt', true);
      expect(useGenerationStore.getState().roleTextModes).toEqual({
        Main_Positive_Prompt: true,
      });

      useGenerationStore.getState().setRoleTextMode?.('Main_Negative_Prompt', false);
      expect(useGenerationStore.getState().roleTextModes).toEqual({
        Main_Positive_Prompt: true,
        Main_Negative_Prompt: false,
      });

      useGenerationStore.getState().setRoleTextMode?.('Main_Positive_Prompt', false);
      expect(useGenerationStore.getState().roleTextModes).toEqual({
        Main_Positive_Prompt: false,
        Main_Negative_Prompt: false,
      });
    });
  });
});
