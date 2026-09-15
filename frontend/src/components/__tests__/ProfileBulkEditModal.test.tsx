import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ProfileBulkEditModal, computeCommonTags, computeCommonLoras } from '../ProfileBulkEditModal';
import type { WorkflowPreset, MappingMaster, ParamTypeMaster, Lora } from '../../api/types';
import { lorasApi } from '../../api/client';

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('computeCommonLoras', () => {
  const samplePresets: WorkflowPreset[] = [
    {
      id: 1,
      name: 'Preset 1',
      workflow_id: 1,
      display_order: 1,
      is_default: false,
      param_values: {
        lora_lora_count: '2',
        lora_lora_name_1: 'lora_a.safetensors',
        lora_lora_wt_1: '0.8',
        lora_model_str_1: '0.8',
        lora_clip_str_1: '0.8',
        lora_lora_name_2: 'lora_b.safetensors',
        lora_lora_wt_2: '1.0',
        lora_model_str_2: '1.0',
        lora_clip_str_2: '1.0',
      },
    },
    {
      id: 2,
      name: 'Preset 2',
      workflow_id: 1,
      display_order: 2,
      is_default: false,
      param_values: {
        lora_lora_count: '2',
        lora_lora_name_1: 'lora_b.safetensors',
        lora_lora_wt_1: '0.9',
        lora_model_str_1: '0.9',
        lora_clip_str_1: '0.9',
        lora_lora_name_2: 'lora_c.safetensors',
        lora_lora_wt_2: '0.5',
        lora_model_str_2: '0.5',
        lora_clip_str_2: '0.5',
      },
    },
  ];

  it('correctly extracts common LoRAs across all presets for a role', () => {
    const common = computeCommonLoras(samplePresets, 'lora');
    expect(common).toHaveLength(1);
    expect(common[0].name).toBe('lora_b.safetensors');
    // First preset's values are used as default representation
    expect(common[0].weight).toBe('1.0');
    expect(common[0].modelStrength).toBe('1.0');
    expect(common[0].clipStrength).toBe('1.0');
  });

  it('returns empty array when there is no intersection (Red Teaming)', () => {
    const disjointPresets: WorkflowPreset[] = [
      {
        id: 1,
        name: 'P1',
        workflow_id: 1,
        display_order: 1,
        is_default: false,
        param_values: {
          lora_lora_count: '1',
          lora_lora_name_1: 'lora_x.safetensors',
          lora_lora_wt_1: '1.0',
        },
      },
      {
        id: 2,
        name: 'P2',
        workflow_id: 1,
        display_order: 2,
        is_default: false,
        param_values: {
          lora_lora_count: '1',
          lora_lora_name_1: 'lora_y.safetensors',
          lora_lora_wt_1: '1.0',
        },
      },
    ];
    expect(computeCommonLoras(disjointPresets, 'lora')).toEqual([]);
  });

  it('returns empty array when presets is empty or count is 0', () => {
    expect(computeCommonLoras([], 'lora')).toEqual([]);
    const emptyCountPresets: WorkflowPreset[] = [
      { id: 1, name: 'P1', workflow_id: 1, display_order: 1, is_default: false, param_values: {} },
    ];
    expect(computeCommonLoras(emptyCountPresets, 'lora')).toEqual([]);
  });
});

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
    renderWithClient(
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
    expect(screen.queryByText('LoRA')).not.toBeInTheDocument();
  });

  it('handles remove_tags mode and selects tags for removal', () => {
    const onApply = vi.fn();
    renderWithClient(
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
    renderWithClient(
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
    renderWithClient(
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

  it('falls back to default samplers and schedulers when comfyObjectInfo is not provided', () => {
    const onApply = vi.fn();
    const mappingsWithScheduler: MappingMaster[] = [
      ...mockMappings,
      { id: 5, workflow_id: 1, role: 'scheduler', display_name: 'Scheduler', input_type: 'select_scheduler', is_required: false, is_hidden: false, display_order: 5 },
    ];

    renderWithClient(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={mockPresets}
        mappingMasters={mappingsWithScheduler}
        paramTypeMasters={mockParamTypeMasters}
        loras={[]}
        onApply={onApply}
      />
    );

    // Switch to params tab
    fireEvent.click(screen.getByText('パラメータ'));

    // Enable Sampler parameter
    const samplerCheckbox = screen.getByLabelText('Sampler');
    fireEvent.click(samplerCheckbox);

    // Verify default options are present (e.g., euler, dpmpp_2m_sde_gpu)
    const samplerSelect = screen.getByDisplayValue('サンプラーを選択…');
    expect(samplerSelect).toBeInTheDocument();
    fireEvent.change(samplerSelect, { target: { value: 'euler_ancestral' } });

    // Enable Scheduler parameter
    const schedulerCheckbox = screen.getByLabelText('Scheduler');
    fireEvent.click(schedulerCheckbox);

    // Verify default scheduler options are present (e.g., karras)
    const schedulerSelect = screen.getByDisplayValue('スケジューラーを選択…');
    expect(schedulerSelect).toBeInTheDocument();
    fireEvent.change(schedulerSelect, { target: { value: 'karras' } });

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      paramPatch: {
        sampler_name: 'euler_ancestral',
        scheduler: 'karras',
      },
    });
  });

  it('handles lora_stack parameter in differential mode with remove and add', () => {
    const onApply = vi.fn();
    const loraStackPresets: WorkflowPreset[] = [
      {
        id: 1,
        name: 'P1',
        workflow_id: 1,
        display_order: 1,
        is_default: false,
        param_values: {
          lora_lora_count: '2',
          lora_lora_name_1: 'detail_slider.safetensors',
          lora_lora_wt_1: '0.8',
          lora_model_str_1: '0.8',
          lora_clip_str_1: '0.8',
          lora_lora_name_2: 'anime_v2.safetensors',
          lora_lora_wt_2: '1.0',
          lora_model_str_2: '1.0',
          lora_clip_str_2: '1.0',
        },
      },
      {
        id: 2,
        name: 'P2',
        workflow_id: 1,
        display_order: 2,
        is_default: false,
        param_values: {
          lora_lora_count: '1',
          lora_lora_name_1: 'detail_slider.safetensors',
          lora_lora_wt_1: '0.5',
          lora_model_str_1: '0.5',
          lora_clip_str_1: '0.5',
        },
      },
    ];

    const loraMappings: MappingMaster[] = [
      { id: 10, workflow_id: 1, role: 'lora', display_name: 'LoRA Stack', input_type: 'lora_stack', is_required: false, is_hidden: false, display_order: 1 },
    ];

    renderWithClient(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={loraStackPresets}
        mappingMasters={loraMappings}
        loras={[]}
        onApply={onApply}
      />
    );

    // Switch to params tab
    fireEvent.click(screen.getByText('パラメータ'));

    // Verify checkbox for LoRA Stack exists and is unchecked
    const loraCheckbox = screen.getByLabelText('LoRA Stack');
    expect(loraCheckbox).not.toBeChecked();

    // Check it
    fireEvent.click(loraCheckbox);
    expect(loraCheckbox).toBeChecked();

    // Default mode is differential
    expect(screen.getByText('差分編集（共通確認・追加・削除）')).toBeInTheDocument();
    expect(screen.getByText('detail_slider.safetensors')).toBeInTheDocument();

    // Mark common LoRA detail_slider for removal
    const removeBtn = screen.getByTitle('削除');
    fireEvent.click(removeBtn);

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      loraStackOps: [
        {
          role: 'lora',
          mode: 'differential',
          commonOps: [
            {
              name: 'detail_slider.safetensors',
              action: 'remove',
              weight: '0.8',
              modelStrength: '0.8',
              clipStrength: '0.8',
            },
          ],
          addSlots: [],
        },
      ],
    });
  });

  it('handles lora_stack parameter in overwrite mode', () => {
    const onApply = vi.fn();
    const loraStackPresets: WorkflowPreset[] = [
      {
        id: 1,
        name: 'P1',
        workflow_id: 1,
        display_order: 1,
        is_default: false,
        param_values: {},
      },
    ];

    const loraMappings: MappingMaster[] = [
      { id: 10, workflow_id: 1, role: 'lora', display_name: 'LoRA Stack', input_type: 'lora_stack', is_required: false, is_hidden: false, display_order: 1 },
    ];

    renderWithClient(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={loraStackPresets}
        mappingMasters={loraMappings}
        loras={[]}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByText('パラメータ'));
    fireEvent.click(screen.getByLabelText('LoRA Stack'));

    // Switch to overwrite mode
    fireEvent.click(screen.getByText('完全上書き'));

    // Click "Add LoRA" in LoraStackEditor
    fireEvent.click(screen.getByRole('button', { name: /Add LoRA/i }));

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    expect(onApply).toHaveBeenCalledWith({
      loraStackOps: [
        {
          role: 'lora',
          mode: 'overwrite',
          slots: [
            {
              name: '',
              weight: '0.0',
              modelStrength: '1.0',
              clipStrength: '1.0',
            },
          ],
        },
      ],
    });
  });

  it('supports selecting unregistered and registered ComfyUI LoRA models in differential mode', async () => {
    const mockComfyModels = [
      {
        model_name: 'unregistered_lora.safetensors',
        file_path: 'subfolder/unregistered_lora.safetensors',
        is_registered: false,
        lora_id: null,
      },
      {
        model_name: 'registered_lora.safetensors',
        file_path: 'registered_lora.safetensors',
        is_registered: true,
        lora_id: 101,
      },
    ];

    const mockLoras: Lora[] = [
      {
        id: 101,
        model_name: 'registered_lora.safetensors',
        description: 'Registered LoRA Nice Description',
        recommended_strength_min: 0.5,
        recommended_strength_max: 1.2,
        category_id: null,
        thumbnail_path: null,
        file_path: 'registered_lora.safetensors',
        trigger_word_sets: [],
        sort_order: 1,
        created_at: '2026-01-01',
      },
    ];

    vi.spyOn(lorasApi, 'getComfyModels').mockResolvedValue(mockComfyModels as any);

    const onApply = vi.fn();
    const loraStackPresets: WorkflowPreset[] = [
      {
        id: 1,
        name: 'P1',
        workflow_id: 1,
        display_order: 1,
        is_default: false,
        param_values: {
          lora_lora_count: '0',
        },
      },
    ];

    const loraMappings: MappingMaster[] = [
      { id: 10, workflow_id: 1, role: 'lora', display_name: 'LoRA Stack', input_type: 'lora_stack', is_required: false, is_hidden: false, display_order: 1 },
    ];

    renderWithClient(
      <ProfileBulkEditModal
        isOpen={true}
        onClose={vi.fn()}
        selectedPresets={loraStackPresets}
        mappingMasters={loraMappings}
        loras={mockLoras}
        onApply={onApply}
      />
    );

    // Switch to params tab
    fireEvent.click(screen.getByText('パラメータ'));
    fireEvent.click(screen.getByLabelText('LoRA Stack'));

    // Click "LoRAを追加" in differential mode
    fireEvent.click(screen.getByRole('button', { name: /LoRAを追加/i }));

    // Click select placeholder to open dropdown
    const selectTrigger = await screen.findByText('LoRAを選択...');
    fireEvent.click(selectTrigger);

    // Unregistered badge should appear and unregistered option is displayed
    expect(await screen.findByText('Unregistered')).toBeInTheDocument();
    const unregisteredOptions = screen.getAllByText('subfolder/unregistered_lora.safetensors');
    expect(unregisteredOptions.length).toBeGreaterThan(0);

    // Registered LoRA should display its description primarily
    const registeredDescElements = screen.getAllByText('Registered LoRA Nice Description');
    expect(registeredDescElements.length).toBeGreaterThan(0);

    // Select the unregistered LoRA
    fireEvent.click(unregisteredOptions[0]);

    // Click apply
    fireEvent.click(screen.getByRole('button', { name: /適用/i }));
    fireEvent.click(screen.getByRole('button', { name: '適用する' }));

    // Verify payload receives the file_path of the unregistered LoRA
    expect(onApply).toHaveBeenCalledWith({
      loraStackOps: [
        {
          role: 'lora',
          mode: 'differential',
          commonOps: [],
          addSlots: [
            {
              name: 'subfolder/unregistered_lora.safetensors',
              weight: '1.0',
              modelStrength: '1.0',
              clipStrength: '1.0',
            },
          ],
        },
      ],
    });
  });
});

