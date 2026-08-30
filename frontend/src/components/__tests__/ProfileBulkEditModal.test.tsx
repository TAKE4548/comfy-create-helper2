import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProfileBulkEditModal, computeCommonTags } from '../ProfileBulkEditModal';
import type { WorkflowPreset, MappingMaster, ParamTypeMaster } from '../../api/types';

describe('computeCommonTags', () => {
  const samplePresets: WorkflowPreset[] = [
    {
      id: 1,
      name: 'Preset 1',
      workflow_id: 1,
      display_order: 1,
      is_default: false,
      param_values: {
        positive: '1girl, solo, black hair, smile, high quality',
        negative: 'bad hands, blurry',
      },
    },
    {
      id: 2,
      name: 'Preset 2',
      workflow_id: 1,
      display_order: 2,
      is_default: false,
      param_values: {
        positive: '1girl, solo, Black Hair, jacket, smile',
        negative: 'bad hands, lowres',
      },
    },
    {
      id: 3,
      name: 'Preset 3',
      workflow_id: 1,
      display_order: 3,
      is_default: false,
      param_values: {
        positive: '1GIRL, solo, black hair, smile, standing',
        negative: 'bad hands, cropped',
      },
    },
  ];

  it('correctly extracts common tags across all presets ignoring case', () => {
    const common = computeCommonTags(samplePresets, ['positive']);
    expect(common).toContain('1girl');
    expect(common).toContain('solo');
    expect(common).toContain('black hair');
    expect(common).toContain('smile');
    expect(common).not.toContain('high quality');
    expect(common).not.toContain('jacket');
    expect(common).not.toContain('standing');
  });

  it('extracts common tags across multiple roles', () => {
    const common = computeCommonTags(samplePresets, ['positive', 'negative']);
    expect(common).toContain('1girl');
    expect(common).toContain('bad hands');
    expect(common).not.toContain('blurry');
    expect(common).not.toContain('lowres');
  });

  it('returns empty array when presets or roles are empty', () => {
    expect(computeCommonTags([], ['positive'])).toEqual([]);
    expect(computeCommonTags(samplePresets, [])).toEqual([]);
  });

  it('returns empty array when there are no common tags (Red Teaming)', () => {
    const distinctPresets: WorkflowPreset[] = [
      { id: 1, name: 'P1', workflow_id: 1, display_order: 1, is_default: false, param_values: { positive: 'cat, white' } },
      { id: 2, name: 'P2', workflow_id: 1, display_order: 2, is_default: false, param_values: { positive: 'dog, black' } },
    ];
    expect(computeCommonTags(distinctPresets, ['positive'])).toEqual([]);
  });
});

describe('ProfileBulkEditModal Component', () => {
  const mockPresets: WorkflowPreset[] = [
    {
      id: 1,
      name: 'P1',
      workflow_id: 1,
      display_order: 1,
      is_default: false,
      param_values: {
        positive: '1girl, masterpiece, smile',
        sampler_name: 'euler',
        steps: '20',
      },
    },
    {
      id: 2,
      name: 'P2',
      workflow_id: 1,
      display_order: 2,
      is_default: false,
      param_values: {
        positive: '1girl, masterpiece, sitting',
        sampler_name: 'dpmpp_2m',
        steps: '25',
      },
    },
  ];

  const mockMappings: MappingMaster[] = [
    { id: 1, workflow_id: 1, role: 'positive', display_name: 'Prompt', input_type: 'textarea', is_required: false, is_hidden: false, display_order: 1 },
    { id: 2, workflow_id: 1, role: 'sampler_name', display_name: 'Sampler', input_type: 'select_sampler', is_required: false, is_hidden: false, display_order: 2 },
    { id: 3, workflow_id: 1, role: 'steps', display_name: 'Steps', input_type: 'int', is_required: false, is_hidden: false, display_order: 3 },
    { id: 4, workflow_id: 1, role: 'custom_select', display_name: 'Custom Select', input_type: 'custom_type_1', is_required: false, is_hidden: false, display_order: 4 },
  ];

  const mockParamTypeMasters: ParamTypeMaster[] = [
    {
      id: 1,
      name: 'custom_type_1',
      display_name: 'Custom Type',
      widget_type: 'select',
      combo_options: ['opt_a', 'opt_b'],
      is_system: false,
    },
  ];

  const mockComfyObjectInfo = {
    KSampler: {
      input: {
        required: {
          sampler_name: [['euler', 'euler_ancestral', 'dpmpp_2m']],
          scheduler: [['normal', 'karras', 'exponential']],
        },
      },
    },
  };

  it('renders modal with correct preset count and tabs', () => {
    render(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={mockPresets}
        mappingMasters={mockMappings}
        paramTypeMasters={mockParamTypeMasters}
        loras={[]}
        onApply={vi.fn()}
      />
    );

    expect(screen.getByText('プロファイル一括編集')).toBeInTheDocument();
    expect(screen.getByText('2 件')).toBeInTheDocument();
    expect(screen.getByText('プロンプト')).toBeInTheDocument();
    expect(screen.getByText('パラメータ')).toBeInTheDocument();
    expect(screen.getByText('LoRA')).toBeInTheDocument();
  });

  it('handles remove_tags mode and selects tags for removal', () => {
    const onApply = vi.fn();
    render(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={mockPresets}
        mappingMasters={mockMappings}
        paramTypeMasters={mockParamTypeMasters}
        loras={[]}
        onApply={onApply}
      />
    );

    // Switch to remove_tags op
    fireEvent.click(screen.getByText('共通タグ編集・削除'));

    // Common tags should be rendered: '1girl', 'masterpiece'
    expect(screen.getByText('1girl')).toBeInTheDocument();
    expect(screen.getByText('masterpiece')).toBeInTheDocument();

    // Click on '1girl' to mark for removal
    fireEvent.click(screen.getByText('1girl'));
    expect(screen.getByText('※ 1 個のタグが対象プリセットから削除されます。')).toBeInTheDocument();

    // Click apply in footer
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));

    // Confirm dialog should appear
    expect(screen.getByText('一括編集の確認')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      promptOps: [
        {
          op: 'remove_tags',
          fields: null,
          tags: ['1girl'],
          commonTagOps: [
            { originalBase: '1girl', newFormattedTag: '1girl', action: 'remove' },
            { originalBase: 'masterpiece', newFormattedTag: 'masterpiece', action: 'update' },
          ],
        },
      ],
    });
  });

  it('handles tag strength adjustments (+/-) in remove_tags mode', () => {
    const onApply = vi.fn();
    render(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={mockPresets}
        mappingMasters={mockMappings}
        paramTypeMasters={mockParamTypeMasters}
        loras={[]}
        onApply={onApply}
      />
    );

    // Switch to remove_tags op
    fireEvent.click(screen.getByText('共通タグ編集・削除'));

    // Find '+' button for first tag and click
    const plusButtons = screen.getAllByTitle('強度変更 (+0.1)');
    fireEvent.click(plusButtons[0]); // '1girl' -> '(1girl:1.1)'

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      promptOps: [
        {
          op: 'remove_tags',
          fields: null,
          tags: [],
          commonTagOps: [
            { originalBase: '1girl', newFormattedTag: '(1girl:1.1)', action: 'update' },
            { originalBase: 'masterpiece', newFormattedTag: 'masterpiece', action: 'update' },
          ],
        },
      ],
    });
  });

  it('handles typed parameter changes with opt-in checkboxes', () => {
    const onApply = vi.fn();
    render(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={mockPresets}
        mappingMasters={mockMappings}
        paramTypeMasters={mockParamTypeMasters}
        comfyObjectInfo={mockComfyObjectInfo}
        loras={[]}
        onApply={onApply}
      />
    );

    // Switch to params tab
    fireEvent.click(screen.getByText('パラメータ'));

    // Enable Sampler parameter
    const samplerCheckbox = screen.getByLabelText('Sampler');
    fireEvent.click(samplerCheckbox);

    // Select sampler option
    const samplerSelect = screen.getByDisplayValue('サンプラーを選択…');
    fireEvent.change(samplerSelect, { target: { value: 'euler' } });

    // Enable Batch Size
    const batchCheckbox = screen.getByLabelText('バッチ数（Batch Size）');
    fireEvent.click(batchCheckbox);
    const batchInput = screen.getByPlaceholderText('バッチ数を入力');
    fireEvent.change(batchInput, { target: { value: '4' } });

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      paramPatch: {
        sampler_name: 'euler',
      },
      batchSize: 4,
    });
  });
});
