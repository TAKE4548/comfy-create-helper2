import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MappingMasterSection } from '../MappingMasterSection'
import { MappingMasterEditModal } from '../../../../components/MappingMasterEditModal'
import { StageManagerModal } from '../../../../components/StageManagerModal'
import { mappingMastersApi } from '../../../../api/domains/mappingMasters'
import { mappingGroupsApi } from '../../../../api/domains/mappingGroups'
import { stageMastersApi } from '../../../../api/domains/stageMasters'
import type { MappingMasterV2, MappingGroupMaster, StageMaster } from '../../../../api/types'

// Mock APIs
vi.mock('../../../../api/domains/mappingMasters', () => ({
  mappingMastersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUsages: vi.fn(),
    reorder: vi.fn(),
  },
}))

vi.mock('../../../../api/domains/mappingGroups', () => ({
  mappingGroupsApi: {
    list: vi.fn(),
  },
}))

vi.mock('../../../../api/domains/stageMasters', () => ({
  stageMastersApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUsages: vi.fn(),
    cascadePreview: vi.fn(),
    cascadeRename: vi.fn(),
  },
}))

const mockGroups: MappingGroupMaster[] = [
  { id: 1, key: 'prompt', name: 'プロンプト系', sort_order: 1, is_builtin: true, is_active: true },
  { id: 2, key: 'sampler', name: 'サンプラー系', sort_order: 2, is_builtin: true, is_active: true },
]

const mockStages: StageMaster[] = [
  { id: 10, key: 'normal', name: '通常', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
  { id: 20, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: ['rough'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 2 },
  { id: 30, key: 'detail', name: 'Detail', suffix: '_detail', search_keywords: ['detail'], previous_suffixes: null, is_builtin: false, is_active: true, sort_order: 3 },
]

const mockMasters: MappingMasterV2[] = [
  {
    id: 100,
    group_id: 1,
    base_key: 'positive_prompt',
    name: 'Positive Prompt',
    param_name: 'text',
    input_type: 'textarea',
    expected_class_types: ['CLIPTextEncode'],
    base_title_patterns: ['positive'],
    sort_order: 1,
    variants: [
      { id: 101, master_id: 100, stage_id: 10, stage_key: 'normal', stage_name: '通常', stage_suffix: '', custom_role_override: null, computed_role: 'text', extra_title_patterns: null, is_enabled: true },
      { id: 102, master_id: 100, stage_id: 20, stage_key: 'rough', stage_name: 'Rough', stage_suffix: '_rough', custom_role_override: null, computed_role: 'text_rough', extra_title_patterns: null, is_enabled: false },
      { id: 103, master_id: 100, stage_id: 30, stage_key: 'detail', stage_name: 'Detail', stage_suffix: '_detail', custom_role_override: null, computed_role: 'text_detail', extra_title_patterns: null, is_enabled: true },
    ],
  },
  {
    id: 200,
    group_id: 2,
    base_key: 'steps',
    name: 'Sampler Steps',
    param_name: 'steps',
    input_type: 'int',
    expected_class_types: ['KSampler'],
    base_title_patterns: ['sampler'],
    sort_order: 2,
    variants: [
      { id: 201, master_id: 200, stage_id: 10, stage_key: 'normal', stage_name: '通常', stage_suffix: '', custom_role_override: null, computed_role: 'steps', extra_title_patterns: null, is_enabled: true },
    ],
  },
]

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('REQ-336-T5: MappingMasterSection & Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mappingGroupsApi.list).mockResolvedValue(mockGroups)
    vi.mocked(stageMastersApi.list).mockResolvedValue(mockStages)
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMasters)
  })

  describe('MappingMasterSection UI', () => {
    it('renders master rows with aggregated stage variants and respects group tab filtering', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      // Both masters displayed initially under "すべて"
      expect(await screen.findByText('Positive Prompt')).toBeInTheDocument()
      expect(screen.getByText('(text)')).toBeInTheDocument()
      expect(screen.getByText('Sampler Steps')).toBeInTheDocument()
      expect(screen.getByText('(steps)')).toBeInTheDocument()

      // Variants co-displayed in the same row
      expect(screen.getAllByText('通常').length).toBeGreaterThan(0)
      expect(screen.getByText('Rough')).toBeInTheDocument()
      expect(screen.getByText('Detail')).toBeInTheDocument()

      // Category tab filtering: switch to "サンプラー系"
      const samplerTab = screen.getByRole('tab', { name: /サンプラー系/ })
      fireEvent.click(samplerTab)

      // Only Sampler Steps should be visible
      expect(screen.getByText('Sampler Steps')).toBeInTheDocument()
      expect(screen.queryByText('Positive Prompt')).not.toBeInTheDocument()

      // Switch back to "すべて"
      const allTab = screen.getByRole('tab', { name: /すべて/ })
      fireEvent.click(allTab)
      expect(screen.getByText('Positive Prompt')).toBeInTheDocument()
      expect(screen.getByText('Sampler Steps')).toBeInTheDocument()
    })

    it('opens StageManagerModal when ステージ管理 button is clicked', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      const stageBtn = await screen.findByRole('button', { name: /ステージ管理/ })
      fireEvent.click(stageBtn)

      expect(await screen.findByRole('dialog', { name: /ステージ管理/ })).toBeInTheDocument()
    })

    it('opens MappingMasterEditModal in create mode when Add Master is clicked', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      const addBtn = await screen.findByRole('button', { name: /Add Master/ })
      fireEvent.click(addBtn)

      expect(await screen.findByRole('dialog', { name: /新規マッピングマスター作成/ })).toBeInTheDocument()
    })
  })

  describe('MappingMasterEditModal', () => {
    it('supports chip input, candidate palette click, variant toggles, and submit', async () => {
      const onSave = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <MappingMasterEditModal
          isOpen={true}
          onClose={onClose}
          master={null}
          groups={mockGroups}
          stages={mockStages}
          onSave={onSave}
        />
      )

      expect(screen.getByRole('dialog', { name: /新規マッピングマスター作成/ })).toBeInTheDocument()

      // Fill basic inputs
      const nameInput = screen.getByPlaceholderText('例: Positive Prompt')
      const paramInput = screen.getByPlaceholderText('例: text, steps, cfg')
      fireEvent.change(nameInput, { target: { value: 'Denoise Master' } })
      fireEvent.change(paramInput, { target: { value: 'denoise' } })

      // Chip input for Expected Class Types via Enter
      const classInput = screen.getByPlaceholderText('クラス名を入力してEnter...')
      fireEvent.change(classInput, { target: { value: 'CustomSamplerNode' } })
      fireEvent.keyDown(classInput, { key: 'Enter', code: 'Enter' })
      expect(screen.getAllByText('CustomSamplerNode').length).toBeGreaterThanOrEqual(1)

      // Candidate palette click
      const ksamplerBtn = screen.getByRole('button', { name: '+ KSampler' })
      fireEvent.click(ksamplerBtn)
      expect(screen.getByText('KSampler')).toBeInTheDocument()

      // Remove a chip via X button
      const removeKSamplerBtn = screen.getByRole('button', { name: 'KSampler を削除' })
      fireEvent.click(removeKSamplerBtn)
      expect(screen.queryByText('KSampler')).not.toBeInTheDocument()

      // Variant controls: all stages rendered
      expect(screen.getByText('通常')).toBeInTheDocument()
      expect(screen.getByText('Rough')).toBeInTheDocument()
      expect(screen.getByText('Detail')).toBeInTheDocument()

      // Submit form
      const submitBtn = screen.getByRole('button', { name: 'マスターを保存' })
      fireEvent.click(submitBtn)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Denoise Master',
          param_name: 'denoise',
          expected_class_types: ['CustomSamplerNode'],
          variants: expect.arrayContaining([
            expect.objectContaining({ stage_id: 10, is_enabled: true }),
            expect.objectContaining({ stage_id: 20, is_enabled: true }),
            expect.objectContaining({ stage_id: 30, is_enabled: true }),
          ]),
        })
      )
    })
  })

  describe('StageManagerModal 3-Fold Deletion Guard & Cascade Rename', () => {
    it('blocks built-in stage deletion (Guard 1)', async () => {
      renderWithClient(<StageManagerModal isOpen={true} onClose={vi.fn()} />)

      // Stage 10 is built-in
      const deleteBuiltinBtn = await screen.findByRole('button', { name: '通常 を削除' })
      expect(deleteBuiltinBtn).toHaveAttribute('title', '組み込みステージは削除できません')

      fireEvent.click(deleteBuiltinBtn)
      expect(await screen.findByText('組み込みステージ (Built-in) は削除できません。')).toBeInTheDocument()
    })

    it('blocks deletion when stage has usages > 0 and suggests deactivation (Guard 2 & 3)', async () => {
      vi.mocked(stageMastersApi.getUsages).mockResolvedValue([
        { mapping_id: 1, workflow_id: 10, workflow_name: 'Test WF', node_id: '5', variant_id: 102 },
      ])

      renderWithClient(<StageManagerModal isOpen={true} onClose={vi.fn()} />)

      // Stage 20 is custom (Rough)
      const deleteRoughBtn = await screen.findByRole('button', { name: 'Rough を削除' })
      fireEvent.click(deleteRoughBtn)

      // Usage warning displayed
      expect(
        await screen.findByText(/1 件のワークフローまたはバリアントで使用されているため削除できません/)
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'このステージを無効化する' })).toBeInTheDocument()
    })

    it('shows cascade rename preview when suffix is changed', async () => {
      vi.mocked(stageMastersApi.cascadePreview).mockResolvedValue({
        stage_id: 20,
        old_suffix: '_rough',
        new_suffix: '_draft',
        affected_variants_count: 3,
        affected_presets_count: 1,
        affected_snapshots_count: 0,
        preview_items: [
          { target_type: 'variant', id: 1, name: 'Pos Prompt', old_role: 'text_rough', new_role: 'text_draft' },
        ],
      })

      renderWithClient(<StageManagerModal isOpen={true} onClose={vi.fn()} />)

      // Click edit on Rough
      const editRoughBtn = await screen.findByRole('button', { name: 'Rough を編集' })
      fireEvent.click(editRoughBtn)

      // Change suffix
      const suffixInput = screen.getByDisplayValue('_rough')
      fireEvent.change(suffixInput, { target: { value: '_draft' } })

      // Click save
      const saveBtn = screen.getByRole('button', { name: '保存' })
      fireEvent.click(saveBtn)

      // Cascade preview should be triggered and displayed
      expect(await screen.findByText('接尾辞変更のカスケード置換プレビュー')).toBeInTheDocument()
      expect(screen.getByText('3 件')).toBeInTheDocument()
      expect(screen.getByText('text_rough')).toBeInTheDocument()
      expect(screen.getByText('text_draft')).toBeInTheDocument()

      // Confirm cascade rename
      const executeBtn = screen.getByRole('button', { name: '一括置換を実行' })
      fireEvent.click(executeBtn)

      await waitFor(() => {
        expect(stageMastersApi.cascadeRename).toHaveBeenCalledWith(20, { new_suffix: '_draft' })
      })
    })
  })
})
