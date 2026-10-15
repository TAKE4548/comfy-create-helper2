import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MappingMasterSection } from '../MappingMasterSection'
import { MappingMasterEditModal } from '../../../../components/MappingMasterEditModal'
import { StageManagerModal } from '../../../../components/StageManagerModal'
import { mappingMastersApi } from '../../../../api/domains/mappingMasters'
import { mappingGroupsApi } from '../../../../api/domains/mappingGroups'
import { stageMastersApi } from '../../../../api/domains/stageMasters'
import { paramTypeMastersApi } from '../../../../api/domains/workflows'
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

vi.mock('../../../../api/domains/workflows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/domains/workflows')>()
  return {
    ...actual,
    paramTypeMastersApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
})

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

describe('MappingMasterSection & Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mappingGroupsApi.list).mockResolvedValue(mockGroups)
    vi.mocked(stageMastersApi.list).mockResolvedValue(mockStages)
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMasters)
    vi.mocked(paramTypeMastersApi.list).mockResolvedValue([
      { id: 1, name: 'SamplerType', widget_type: 'select' },
    ] as never)
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

    it('[REQ-365/AC-3] renders each master as a settings-mobile-card with pinned actions, hidden target node and contextual aria-label', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('Positive Prompt')

      const card = screen.getByText('Positive Prompt').closest('.settings-mobile-card') as HTMLElement
      expect(card).not.toBeNull()
      expect(card.querySelector('.settings-mobile-card__actions')).not.toBeNull()
      expect(card.querySelector('.settings-mobile-card__badges')).not.toBeNull()
      expect(card.querySelector('.settings-mobile-card__target-node')).toHaveTextContent('(text)')
      expect(screen.getByText('Positive Prompt')).toHaveAttribute('title', 'Positive Prompt')

      const edit = screen.getByRole('button', {
        name: 'Positive Prompt のマッピング設定を編集（対象ノード: text / CLIPTextEncode）',
      })
      expect(edit).toHaveClass('min-h-11', 'min-w-11', 'touch-manipulation')
      expect(screen.getByRole('button', { name: 'Positive Prompt を削除' })).toHaveClass('min-h-11', 'min-w-11')
    })

    it('[REQ-365/AC-3] shows +N classes and +N stages compact badges without duplicating variant names', async () => {
      const mk = (id: number, classes: string[] | null, nVariants: number): MappingMasterV2 => ({
        ...mockMasters[1],
        id,
        name: `M${id}`,
        expected_class_types: classes,
        variants: Array.from({ length: nVariants }, (_, i) => ({
          ...mockMasters[0].variants[0],
          id: id * 100 + i,
          stage_id: id * 100 + i,
          stage_name: `S${id}_${i}`,
        })),
      })
      vi.mocked(mappingMastersApi.list).mockResolvedValue([
        mk(1, null, 0),
        mk(2, ['A'], 1),
        mk(3, Array.from({ length: 10 }, (_, i) => `C${i}`), 20),
      ])
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('M3')

      expect(screen.getAllByText(/^\+\d+ classes$/)).toHaveLength(1)
      expect(screen.getByText('+9 classes')).toBeInTheDocument()
      expect(screen.getAllByText(/^\+\d+ stages$/)).toHaveLength(1)
      expect(screen.getByText('+19 stages')).toBeInTheDocument()
      expect(screen.getAllByText('S3_0')).toHaveLength(1)
      expect(screen.getAllByText('S3_19')).toHaveLength(1)
      expect(screen.getByText('S3_19')).toHaveClass('hidden', 'md:inline-flex')
      expect(screen.getByText('S3_0')).not.toHaveClass('hidden')
      expect(screen.getAllByText('S2_0')).toHaveLength(1)
    })

    it('[REQ-365/AC-4] opens ParamTypeMaster manager as a dialog from the カスタム型マスタ button and no longer renders the always-on bar', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('Positive Prompt')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(/カスタム型マスター \(/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /新規型を作成/ })).not.toBeInTheDocument()

      const trigger = screen.getByRole('button', { name: 'カスタム型マスタ' })
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      fireEvent.click(trigger)

      expect(await screen.findByRole('dialog', { name: 'カスタム型マスタ管理' })).toBeInTheDocument()
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })

    it('[REQ-365/AC-4] transitions list -> create form -> back to list with exactly one dialog at a time', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('Positive Prompt')

      fireEvent.click(screen.getByRole('button', { name: 'カスタム型マスタ' }))
      await screen.findByRole('dialog', { name: 'カスタム型マスタ管理' })

      fireEvent.click(screen.getByRole('button', { name: /新規型を作成/ }))
      expect(await screen.findByRole('dialog', { name: 'カスタム型マスター作成' })).toBeInTheDocument()
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      expect(screen.queryByRole('dialog', { name: 'カスタム型マスタ管理' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
      expect(await screen.findByRole('dialog', { name: 'カスタム型マスタ管理' })).toBeInTheDocument()
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })

    it('[REQ-365/AC-9] param type dialogs use the bottom-sheet Modal', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('Positive Prompt')

      fireEvent.click(screen.getByRole('button', { name: 'カスタム型マスタ' }))
      const manager = await screen.findByRole('dialog', { name: 'カスタム型マスタ管理' })
      expect(manager).toHaveAttribute('aria-modal', 'true')
      expect(manager.className).toMatch(/max-h-\[85dvh\]/)

      fireEvent.click(await screen.findByRole('button', { name: 'SamplerType を編集' }))
      const form = await screen.findByRole('dialog', { name: 'カスタム型マスター編集' })
      expect(form).toHaveAttribute('aria-modal', 'true')
      expect(form.className).toMatch(/max-h-\[85dvh\]/)
    })
  })

  describe('MappingMasterEditModal', () => {
    it('[REQ-358/AC-26] saves the new mapping default-enabled choice', () => {
      const onSave = vi.fn()
      renderWithClient(
        <MappingMasterEditModal
          isOpen={true}
          onClose={vi.fn()}
          master={null}
          groups={mockGroups}
          stages={mockStages}
          onSave={onSave}
        />
      )

      const defaultEnabled = screen.getByRole('checkbox', { name: '新規マッピングで基本有効' })
      expect(defaultEnabled).toBeChecked()
      expect(screen.getByText('既存のマッピングには影響しません。')).toBeInTheDocument()
      fireEvent.click(defaultEnabled)
      fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Denoise' } })
      fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'denoise' } })
      fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ default_enabled: false }))
    })

    it('[REQ-358/AC-27] treats legacy defaults as enabled and locks the control while saving', () => {
      const onSave = vi.fn()
      renderWithClient(
        <MappingMasterEditModal
          isOpen={true}
          onClose={vi.fn()}
          master={mockMasters[0]}
          groups={mockGroups}
          stages={mockStages}
          onSave={onSave}
          isPending={true}
        />
      )

      const defaultEnabled = screen.getByRole('checkbox', { name: '新規マッピングで基本有効' })
      expect(defaultEnabled).toBeChecked()
      expect(defaultEnabled).toBeDisabled()
    })

    it('[REQ-358/AC-30] preserves an existing disabled default on save', () => {
      const onSave = vi.fn()
      renderWithClient(
        <MappingMasterEditModal
          isOpen={true}
          onClose={vi.fn()}
          master={{ ...mockMasters[0], default_enabled: false }}
          groups={mockGroups}
          stages={mockStages}
          onSave={onSave}
        />
      )

      expect(screen.getByRole('checkbox', { name: '新規マッピングで基本有効' })).not.toBeChecked()
      fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ default_enabled: false }))
    })

    it('[REQ-358/AC-28][REQ-365/AC-3] keeps disabled masters visible and editable', async () => {
      vi.mocked(mappingMastersApi.list).mockResolvedValue([
        { ...mockMasters[0], default_enabled: false },
        mockMasters[1],
      ])
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      expect(await screen.findByText('新規マッピングで基本無効')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /^Positive Prompt のマッピング設定を編集/ }))
      expect(await screen.findByRole('checkbox', { name: '新規マッピングで基本有効' })).not.toBeChecked()
    })

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
