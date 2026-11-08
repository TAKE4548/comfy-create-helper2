import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../test/mocks/server'
import { MappingMasterSection } from '../MappingMasterSection'
import { MappingMasterEditModal } from '../../../../components/MappingMasterEditModal'
import { StageManagerModal } from '../../../../components/StageManagerModal'
import { mappingMastersApi } from '../../../../api/domains/mappingMasters'
import { mappingGroupsApi } from '../../../../api/domains/mappingGroups'
import { stageMastersApi } from '../../../../api/domains/stageMasters'
import { paramTypeMastersApi } from '../../../../api/domains/workflows'
import type {
  MappingMasterV2,
  MappingGroupMaster,
  StageMaster,
  MasterAtomicSaveRequest,
} from '../../../../api/types'

// Mock APIs
// atomicSave stays real so that REQ-419 cases exercise the HTTP layer through MSW.
vi.mock('../../../../api/domains/mappingMasters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../api/domains/mappingMasters')>()
  return {
    mappingMastersApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getUsages: vi.fn(),
      reorder: vi.fn(),
      atomicSave: actual.mappingMastersApi.atomicSave,
    },
  }
})

// Capture the props the section passes to the edit modal (real modal still renders).
const modalProbe = vi.hoisted(() => ({
  props: null as null | {
    onSave: (data: unknown) => Promise<void> | void
    isOpen?: boolean
  },
}))
vi.mock('../../../../components/MappingMasterEditModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../components/MappingMasterEditModal')>()
  const Actual = actual.MappingMasterEditModal
  return {
    ...actual,
    MappingMasterEditModal: (props: React.ComponentProps<typeof Actual>) => {
      modalProbe.props = props as never
      return <Actual {...props} />
    },
  }
})

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
      expect(screen.queryByText('(text)')).not.toBeInTheDocument()
      expect(screen.getByText('Sampler Steps')).toBeInTheDocument()
      expect(screen.queryByText('(steps)')).not.toBeInTheDocument()

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
      expect(card.querySelector('.settings-mobile-card__target-node')).toBeEmptyDOMElement()
      expect(screen.getByText('Positive Prompt')).toHaveAttribute('title', 'Positive Prompt')

      const edit = screen.getByRole('button', {
        name: 'Positive Prompt のマッピング設定を編集（Variant 3件）',
      })
      expect(edit).toHaveClass('min-h-11', 'min-w-11', 'touch-manipulation')
      expect(screen.getByRole('button', { name: 'Positive Prompt を削除' })).toHaveClass('min-h-11', 'min-w-11')
    })

    it('[REQ-365/AC-3] shows +N stages compact badge without duplicating variant names', async () => {
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

      expect(screen.getAllByText(/^\+\d+ stages$/)).toHaveLength(1)
      expect(screen.getByText('+19 stages')).toBeInTheDocument()
      expect(screen.getAllByText('S3_0')).toHaveLength(1)
      expect(screen.getAllByText('S3_19')).toHaveLength(1)
      expect(screen.getByText('S3_19')).toHaveClass('hidden', 'md:inline-flex')
      expect(screen.getByText('S3_0')).not.toHaveClass('hidden')
      expect(screen.getAllByText('S2_0')).toHaveLength(1)
    })

    it('[REQ-419/AC-7] master card shows variant count badge without +N classes', async () => {
      const mk = (id: number, nClasses: number, nVariants: number): MappingMasterV2 => ({
        ...mockMasters[1],
        id,
        name: `M${id}`,
        expected_class_types: Array.from({ length: nClasses }, (_, i) => `C${i}`),
        variants: Array.from({ length: nVariants }, (_, i) => ({
          ...mockMasters[0].variants[0],
          id: id * 100 + i,
          stage_id: id * 100 + i,
          stage_name: `S${id}_${i}`,
        })),
      })
      vi.mocked(mappingMastersApi.list).mockResolvedValue([mk(1, 10, 20), mk(2, 3, 0)])
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('M1')

      expect(screen.queryAllByText(/classes$/)).toHaveLength(0)
      const badges = screen.getAllByTestId('master-variant-count')
      expect(badges.map((b) => b.textContent)).toEqual(['Variant 20', 'Variant 0'])
      expect(badges[0]).toHaveAttribute('aria-label', 'Variant数 20')
      expect(badges[1]).toHaveAttribute('aria-label', 'Variant数 0')
      expect(screen.getByRole('button', { name: 'M1 のマッピング設定を編集（Variant 20件）' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'M2 のマッピング設定を編集（Variant 0件）' })).toBeInTheDocument()
    })

    it('[REQ-419/AC-7] master card row does not show legacy param_name', async () => {
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await screen.findByText('Positive Prompt')

      for (const [name, param] of [['Positive Prompt', 'text'], ['Sampler Steps', 'steps']]) {
        const card = screen.getByText(name).closest('.settings-mobile-card') as HTMLElement
        expect(card).not.toBeNull()
        expect(card.textContent).not.toContain(`(${param})`)
        expect(card.textContent).not.toContain(param === 'text' ? '(text' : '(steps')
        expect(card.querySelector('.settings-mobile-card__target-node')).not.toBeNull()
      }
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
      fireEvent.change(screen.getByPlaceholderText('例: KSampler'), { target: { value: 'KSampler' } })
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
  })

  describe('MappingMasterSection atomic save (MSW)', () => {
    const atomicReq: MasterAtomicSaveRequest = {
      master: { name: 'Positive Prompt', input_type: 'textarea', group_id: 1, default_enabled: true },
      rule_sets: [],
      selectors: [],
      variants: [],
    }
    let atomicCalls: unknown[] = []
    let definitionWrites: string[] = []
    let ruleGets = 0
    let selectorGets = 0

    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
    afterEach(() => server.resetHandlers())
    afterAll(() => server.close())

    beforeEach(() => {
      modalProbe.props = null
      atomicCalls = []
      definitionWrites = []
      ruleGets = 0
      selectorGets = 0
    })

    function useDefinitionHandlers(atomicStatus: number) {
      server.use(
        http.post('/api/mapping-masters/:id/atomic-save', async ({ request }) => {
          atomicCalls.push(await request.json())
          if (atomicStatus !== 200) {
            return HttpResponse.json({ detail: 'invalid' }, { status: atomicStatus })
          }
          return HttpResponse.json(mockMasters[0])
        }),
        http.get('/api/binding-rules', () => {
          ruleGets += 1
          return HttpResponse.json([])
        }),
        http.get('/api/node-selectors', () => {
          selectorGets += 1
          return HttpResponse.json([])
        }),
        http.all('/api/binding-rules/*', ({ request }) => {
          definitionWrites.push(`${request.method} binding-rules`)
          return HttpResponse.json({})
        }),
        http.all('/api/node-selectors/*', ({ request }) => {
          definitionWrites.push(`${request.method} node-selectors`)
          return HttpResponse.json({})
        }),
      )
    }

    function Probe() {
      useQuery({ queryKey: ['binding-rules'], queryFn: () => fetch('/api/binding-rules').then((r) => r.json()) })
      useQuery({ queryKey: ['node-selectors'], queryFn: () => fetch('/api/node-selectors').then((r) => r.json()) })
      return null
    }

    async function openEditModal() {
      fireEvent.click(await screen.findByRole('button', { name: /Positive Prompt のマッピング設定を編集/ }))
      await screen.findByRole('dialog', { name: /マッピング/ })
      await waitFor(() => expect(modalProbe.props?.isOpen).toBe(true))
    }

    it('[REQ-419/AC-6] save failure is propagated to the modal', async () => {
      useDefinitionHandlers(422)
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)
      await openEditModal()

      let caught: unknown = null
      await act(async () => {
        try {
          await modalProbe.props!.onSave(atomicReq)
        } catch (e) {
          caught = e
        }
      })

      expect(caught).toBeInstanceOf(Error)
      expect(atomicCalls).toHaveLength(1)
      // modal stays open after the failed save
      expect(screen.getByRole('dialog', { name: /マッピング/ })).toBeInTheDocument()
      expect(modalProbe.props?.isOpen).toBe(true)
    })

    it('[REQ-419/AC-12] [REQ-419/AC-5] section sends one atomic-save request and refreshes definitions', async () => {
      useDefinitionHandlers(200)
      renderWithClient(
        <>
          <Probe />
          <MappingMasterSection isExpanded={true} onToggle={vi.fn()} />
        </>,
      )
      await waitFor(() => {
        expect(ruleGets).toBe(1)
        expect(selectorGets).toBe(1)
      })
      await openEditModal()
      await new Promise((resolve) => setTimeout(resolve, 50))
      const listCallsBefore = vi.mocked(mappingMastersApi.list).mock.calls.length
      const rulesBefore = ruleGets
      const selectorsBefore = selectorGets

      await act(async () => {
        await modalProbe.props!.onSave(atomicReq)
      })

      expect(atomicCalls).toEqual([atomicReq])
      expect(definitionWrites).toEqual([])
      expect(vi.mocked(mappingMastersApi.update)).not.toHaveBeenCalled()
      await waitFor(() => {
        expect(vi.mocked(mappingMastersApi.list).mock.calls.length).toBeGreaterThan(listCallsBefore)
        expect(ruleGets).toBeGreaterThan(rulesBefore)
        expect(selectorGets).toBeGreaterThan(selectorsBefore)
      })
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /マッピング/ })).not.toBeInTheDocument())
    })

    const boundMaster = (overrides: Partial<MappingMasterV2> = {}): MappingMasterV2 => ({
      ...mockMasters[0],
      variants: mockMasters[0].variants.map((v) => ({ ...v, binding_rule_set_id: 7, node_selector_id: null })),
      ...overrides,
    })

    function useBoundDefinitionHandlers() {
      server.use(
        http.get('/api/binding-rules', () =>
          HttpResponse.json([
            {
              id: 7,
              name: 'text rules',
              entries: [{ id: 1, rule_set_id: 7, class_type: 'CLIPTextEncode', param_name: 'text', priority: 0 }],
              referenced_roles: ['text'],
            },
          ]),
        ),
        http.get('/api/node-selectors', () => HttpResponse.json([])),
      )
    }

    it('[REQ-358/AC-30] preserves an existing disabled default on save', async () => {
      vi.mocked(mappingMastersApi.list).mockResolvedValue([boundMaster({ default_enabled: false })])
      useDefinitionHandlers(200)
      useBoundDefinitionHandlers()
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      fireEvent.click(await screen.findByRole('button', { name: /^Positive Prompt のマッピング設定を編集/ }))
      expect(await screen.findByRole('checkbox', { name: '新規マッピングで基本有効' })).not.toBeChecked()
      await screen.findByRole('group', { name: '通常 のVariant' })
      await waitFor(() => expect(screen.getByRole('button', { name: 'マスターを保存' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))

      await waitFor(() => expect(atomicCalls).toHaveLength(1))
      expect((atomicCalls[0] as MasterAtomicSaveRequest).master.default_enabled).toBe(false)
      // the saved state stays disabled: the control is still unchecked and the card still shows the disabled badge
      expect(screen.queryByRole('checkbox', { name: '新規マッピングで基本有効' })).toBeNull()
      expect(await screen.findByText('新規マッピングで基本無効')).toBeInTheDocument()
    })

    it('[REQ-419/AC-3] variant enable toggle and submit send one atomic-save with the toggled is_enabled', async () => {
      vi.mocked(mappingMastersApi.list).mockResolvedValue([boundMaster()])
      useDefinitionHandlers(200)
      useBoundDefinitionHandlers()
      renderWithClient(<MappingMasterSection isExpanded={true} onToggle={vi.fn()} />)

      fireEvent.click(await screen.findByRole('button', { name: /^Positive Prompt のマッピング設定を編集/ }))
      // all stage variants are rendered as rows; no chip input / candidate palette in the new UI
      for (const stage of ['通常', 'Rough', 'Detail']) {
        expect(await screen.findByRole('group', { name: `${stage} のVariant` })).toBeInTheDocument()
      }
      expect(screen.queryByPlaceholderText('クラス名を入力してEnter...')).toBeNull()

      const rough = screen.getByRole('checkbox', { name: 'Rough を有効化' })
      expect(rough).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: '通常 を有効化' })).toBeChecked()
      fireEvent.click(rough)
      expect(rough).toBeChecked()
      await waitFor(() => expect(screen.getByRole('button', { name: 'マスターを保存' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: 'マスターを保存' }))

      await waitFor(() => expect(atomicCalls).toHaveLength(1))
      const req = atomicCalls[0] as MasterAtomicSaveRequest
      expect(definitionWrites).toEqual([])
      expect(vi.mocked(mappingMastersApi.update)).not.toHaveBeenCalled()
      expect(req.master).toEqual(expect.objectContaining({ name: 'Positive Prompt', input_type: 'textarea' }))
      expect(req.variants.map((v) => [v.stage_id, v.is_enabled])).toEqual([
        [10, true],
        [20, true],
        [30, true],
      ])
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
