import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UploadWorkflowModal } from '../UploadWorkflowModal'
import { RescanModal } from '../RescanModal'
import { MappingNodeSelector } from '../MappingNodeSelector'
import { WorkflowMappingEditor, type EditableSlot } from '../WorkflowMappingEditor'
import { mappingMastersApi, workflowsApi } from '../../api/client'
import * as nodeUtils from '../../utils/workflowNodeUtils'
import type { MappingMasterV2, ScanResult } from '../../api/types'

vi.mock('../../api/client', () => ({
  mappingMastersApi: {
    list: vi.fn(),
  },
  workflowsApi: {
    get: vi.fn(),
    scan: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mockMultiStageMasters: MappingMasterV2[] = [
  {
    id: 1,
    base_key: 'steps',
    name: 'Steps Master',
    role: 'steps',
    display_name: 'Steps',
    param_name: 'steps',
    input_type: 'int',
    expected_class_types: ['KSampler'],
    base_title_patterns: ['steps'],
    sort_order: 1,
    group_id: null,
    variants: [
      {
        id: 101,
        master_id: 1,
        stage_id: 1,
        stage_name: 'Main',
        stage_key: 'main',
        stage_suffix: '',
        custom_role_override: null,
        computed_role: 'steps',
        extra_title_patterns: ['main'],
        is_enabled: true,
      },
      {
        id: 102,
        master_id: 1,
        stage_id: 2,
        stage_name: 'Rough',
        stage_key: 'rough',
        stage_suffix: '_rough',
        custom_role_override: null,
        computed_role: 'steps_rough',
        extra_title_patterns: ['rough'],
        is_enabled: true,
      },
    ],
  },
]

const mockScanResult: ScanResult = {
  matched: [
    {
      master_id: 1,
      variant_id: 101,
      stage_id: 1,
      stage_key: 'main',
      node_id: '10',
      node_title: 'KSampler Main',
    },
    {
      master_id: 1,
      variant_id: 102,
      stage_id: 2,
      stage_key: 'rough',
      node_id: '20',
      node_title: 'KSampler Rough',
    },
  ],
  warnings: [],
}

const mockWorkflowJson = {
  '10': {
    class_type: 'KSampler',
    _meta: { title: 'KSampler Main' },
    inputs: { steps: 20 },
  },
  '20': {
    class_type: 'KSampler',
    _meta: { title: 'KSampler Rough' },
    inputs: { steps: 10 },
  },
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('WorkflowModalMultiStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mappingMastersApi.list).mockResolvedValue(mockMultiStageMasters)
    vi.mocked(workflowsApi.scan).mockResolvedValue(mockScanResult)
    vi.mocked(workflowsApi.get).mockResolvedValue({
      id: 1, name: 'Workflow', json_body: mockWorkflowJson, mappings: [], mapping_slot_states: {}, created_at: '',
    })
  })

  it('REQ-358/T35 caches ranks during edits and locks one deferred save', async () => {
    const rank = vi.spyOn(nodeUtils, 'rankWorkflowNodeCandidates')
    const actual = await vi.importActual<typeof import('../../api/domains/workflows')>('../../api/domains/workflows')
    let finish!: (value: Response) => void
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    vi.mocked(workflowsApi.update).mockImplementation(actual.workflowsApi.update)
    renderWithClient(<RescanModal workflowId={1} workflowJson={mockWorkflowJson} onClose={vi.fn()} onSaved={vi.fn()} />)
    await screen.findByRole('button', { name: '適用・保存' })
    const calls = rank.mock.calls.length
    const requestCounts = [vi.mocked(workflowsApi.scan).mock.calls.length, vi.mocked(workflowsApi.get).mock.calls.length, vi.mocked(mappingMastersApi.list).mock.calls.length]
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
    fireEvent.change(screen.getAllByRole('textbox', { name: 'ノードID' })[0], { target: { value: '19' } })
    expect(rank).toHaveBeenCalledTimes(calls)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect([vi.mocked(workflowsApi.scan).mock.calls.length, vi.mocked(workflowsApi.get).mock.calls.length, vi.mocked(mappingMastersApi.list).mock.calls.length]).toEqual(requestCounts)
    const save = screen.getByRole('button', { name: '適用・保存' })
    fireEvent.click(save)
    await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledTimes(1))
    expect(save).toBeDisabled()
    expect(screen.getAllByRole('checkbox').every(input => (input as HTMLInputElement).disabled)).toBe(true)
    fireEvent.click(save)
    expect(workflowsApi.update).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/workflows/1')
    expect(options?.method).toBe('PUT')
    expect(JSON.parse(options?.body as string)).toMatchObject({ mappings: [{ master_id: 1, variant_id: 101, node_id: '19' }, { master_id: 1, variant_id: 102, node_id: '20' }], mapping_slot_states: { 'v:101': true, 'v:102': true } })
    await act(async () => { finish(new Response(JSON.stringify({ id: 1 }), { status: 200 })) })
    fetchSpy.mockRestore()
    rank.mockRestore()
  })

  it('REQ-358/T35 upload edits reuse candidates and keep create locked until completion', async () => {
    const rank = vi.spyOn(nodeUtils, 'rankWorkflowNodeCandidates')
    let finish!: (value: any) => void
    vi.mocked(workflowsApi.create).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    renderWithClient(<UploadWorkflowModal initialName="Cached" workflowJson={mockWorkflowJson} onClose={vi.fn()} onSaved={vi.fn()} />)
    const save = await screen.findByRole('button', { name: '登録・保存' })
    const calls = rank.mock.calls.length
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
    fireEvent.change(screen.getByPlaceholderText('ワークフロー名を入力してください'), { target: { value: 'New Name' } })
    expect(rank).toHaveBeenCalledTimes(calls)
    expect(workflowsApi.create).not.toHaveBeenCalled()
    fireEvent.click(save)
    await waitFor(() => expect(workflowsApi.create).toHaveBeenCalledTimes(1))
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(workflowsApi.create).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ id: 1, name: 'New Name' }) })
    rank.mockRestore()
  })

  describe('REQ-358/EDITOR', () => {
    const candidates = [
      { id: '11', title: 'Main Sampler', classType: 'KSampler', tier: 0 as const, stageRank: 0 as const, recommended: true, reasons: ['タイトル完全一致'] },
      { id: '12', title: 'MainSampler', classType: 'KSampler', tier: 1 as const, stageRank: 1 as const, recommended: true, reasons: ['表記ゆれ'] },
      { id: '13', title: 'Other', classType: 'KSampler', tier: 2 as const, stageRank: 1 as const, recommended: false, reasons: ['クラス一致'] },
      { id: '14', title: 'Else', classType: 'Other', tier: 3 as const, stageRank: 1 as const, recommended: false, reasons: ['パラメータ一致'] },
      { id: '15', title: 'Unrelated', classType: 'Other', tier: 4 as const, stageRank: 1 as const, recommended: false, reasons: ['その他'] },
    ]

    it('REQ-358/EDITOR [REQ-358/AC-8] keeps the editable node ID input mounted and shows ranked reasons', () => {
      const onChange = vi.fn()
      const { rerender } = render(<MappingNodeSelector value="" candidates={candidates} readOnly={false} onChange={onChange} />)
      const input = screen.getByRole('textbox', { name: 'ノードID' })
      fireEvent.focus(input)
      expect(screen.getAllByRole('option')).toHaveLength(5)
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('80%')).toBeInTheDocument()
      expect(screen.getByText('55%')).toBeInTheDocument()
      expect(screen.getByText('26%')).toBeInTheDocument()
      expect(screen.getByText('4%')).toBeInTheDocument()
      expect(screen.getAllByText('クラス一致')).toHaveLength(1)
      expect(screen.getByText('パラメータ一致')).toBeInTheDocument()
      fireEvent.change(input, { target: { value: '1' } })
      rerender(<MappingNodeSelector value="1" candidates={candidates} readOnly={false} onChange={onChange} />)
      expect(screen.getByRole('textbox', { name: 'ノードID' })).toBe(input)
      expect(onChange).toHaveBeenCalledWith('1')
      fireEvent.focus(input)
      fireEvent.click(screen.getByRole('option', { name: /Main Sampler · KSampler · ID 11/ }))
      expect(onChange).toHaveBeenLastCalledWith('11')
    })

    it('REQ-358/EDITOR [REQ-358/AC-14] displays selected node metadata and stage confidence in distinct text', () => {
      render(<MappingNodeSelector value="11" candidates={candidates} readOnly={false} onChange={vi.fn()} />)
      expect(screen.getByLabelText('選択中のノード')).toHaveTextContent('100%')
      expect(screen.getByLabelText('選択中のノード')).toHaveTextContent('Main Sampler · KSampler')
      expect(screen.getByLabelText('選択中のノード').parentElement).toContainElement(screen.getByRole('textbox', { name: 'ノードID' }))
    })

    it('REQ-358/EDITOR [REQ-358/AC-13] renders ordered slot rows and keeps empty slots selectable', () => {
      const rows: EditableSlot[] = [
        { slotKey: 'v:101', masterId: 1, variantId: 101, stageId: 1, stageName: 'Main', roleLabel: 'Steps', nodeId: '', enabled: true, missingReference: false, candidates },
        { slotKey: 'v:102', masterId: 1, variantId: 102, stageId: 2, stageName: 'Rough', roleLabel: 'Rough Steps', nodeId: '20', enabled: false, missingReference: true, candidates },
      ]
      render(<WorkflowMappingEditor rows={rows} onChangeSlot={vi.fn()} onToggleSlot={vi.fn()} onToggleStage={vi.fn()} />)
      const input = screen.getAllByRole('textbox', { name: 'ノードID' })[0]
      expect(input).toHaveValue('')
      expect(screen.getByText('未割当')).toBeInTheDocument()
      expect(screen.getByTestId('mapping-slot-v:101')).not.toHaveClass('opacity-50')
      expect(screen.getByRole('checkbox', { name: 'Steps有効' })).toBeChecked()
      expect(screen.getByText('Rough · 参照先なし')).toBeInTheDocument()
      expect(screen.getAllByRole('checkbox')).toHaveLength(4)
      expect(screen.getAllByRole('textbox')[1]).toHaveAttribute('readonly')
    })

    it('REQ-358/EDITOR [REQ-358/AC-22] marks a partly enabled stage as mixed and labels the disabled role', () => {
      const rows: EditableSlot[] = [
        { slotKey: 'v:101', masterId: 1, variantId: 101, stageId: 1, stageName: 'Main', roleLabel: 'Steps', nodeId: '10', enabled: true, missingReference: false, candidates },
        { slotKey: 'v:102', masterId: 1, variantId: 102, stageId: 1, stageName: 'Main', roleLabel: 'Seed', nodeId: '20', enabled: false, missingReference: false, candidates },
      ]
      render(<WorkflowMappingEditor rows={rows} onChangeSlot={vi.fn()} onToggleSlot={vi.fn()} onToggleStage={vi.fn()} />)
      expect(screen.getByRole('checkbox', { name: 'Mainステージ有効' })).toHaveAttribute('aria-checked', 'mixed')
      expect(screen.getByText('一部無効')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Seed有効' })).not.toBeChecked()
      expect(screen.getAllByRole('textbox')[1]).toHaveAttribute('readonly')
    })
  })

  describe('UploadWorkflowModal multi-stage slots', () => {
    it('REQ-358/UPLOAD_CLEAN REQ-358/AC-13 renders ordered slots and saves mappings with explicit slot states', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 99, name: 'New MultiStage Workflow' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="New MultiStage Workflow"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByText('Steps')).not.toHaveLength(0)
      })

      expect(screen.getAllByText('Main')).not.toHaveLength(0)
      expect(screen.getAllByText('Rough')).not.toHaveLength(0)
      const inputs = screen.getAllByRole('textbox', { name: 'ノードID' }) as HTMLInputElement[]
      expect(inputs.map((input) => input.value)).toEqual(['10', '20'])
      expect(screen.getAllByRole('checkbox')).toHaveLength(4)

      // Submit modal
      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'New MultiStage Workflow',
          json_body: mockWorkflowJson,
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ],
          mapping_slot_states: { 'v:101': true, 'v:102': true },
        })
        expect(onSaved).toHaveBeenCalledWith(99)
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('REQ-358/UPLOAD_CLEAN REQ-358/AC-14 preserves an explicitly empty slot and its enabled state', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 100, name: 'Single Stage Mapped' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="Single Stage Mapped"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByText('Steps')).not.toHaveLength(0)
      })

      const roughInput = screen.getAllByRole('textbox', { name: 'ノードID' })[1] as HTMLInputElement
      expect(roughInput.value).toBe('20')
      fireEvent.change(roughInput, { target: { value: '' } })
      expect(roughInput).toHaveValue('')

      // Submit modal
      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'Single Stage Mapped',
          json_body: mockWorkflowJson,
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
          ],
          mapping_slot_states: { 'v:101': true, 'v:102': true },
        })
        expect(onSaved).toHaveBeenCalledWith(100)
      })
    })

    it('REQ-358/UPLOAD_CLEAN REQ-358/AC-15 saves all slot states when mappings are empty', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 101, name: 'Empty Mappings' })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <UploadWorkflowModal
          initialName="Empty Mappings"
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByText('Steps')).not.toHaveLength(0)
      })

      for (const input of screen.getAllByRole('textbox', { name: 'ノードID' })) {
        fireEvent.change(input, { target: { value: '' } })
      }

      const confirmBtn = screen.getByRole('button', { name: /登録/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'Empty Mappings',
          json_body: mockWorkflowJson,
          mappings: [],
          mapping_slot_states: { 'v:101': true, 'v:102': true },
        })
        expect(onSaved).toHaveBeenCalledWith(101)
      })
    })

    it('REQ-358/UPLOAD_CLEAN REQ-358/AC-21 keeps disabled slot mappings and persists the opt-out state', async () => {
      vi.mocked(workflowsApi.create).mockResolvedValue({ id: 102, name: 'Disabled Rough' })
      renderWithClient(
        <UploadWorkflowModal
          initialName="Disabled Rough"
          workflowJson={mockWorkflowJson}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      await screen.findAllByRole('textbox', { name: 'ノードID' })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Roughステージ有効' }))
      fireEvent.click(screen.getByRole('button', { name: /登録/i }))

      await waitFor(() => {
        expect(workflowsApi.create).toHaveBeenCalledWith({
          name: 'Disabled Rough',
          json_body: mockWorkflowJson,
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '10' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ],
          mapping_slot_states: { 'v:101': true, 'v:102': false },
        })
      })
    })
  })

  describe('RescanModal multi-stage slots', () => {
    it('[REQ-358/AC-19][REQ-358/AC-34] waits for refetch before restoring disabled assignments and preserves them across save and reopen', async () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const mappings = [{ master_id: 1, variant_id: 101, node_id: '10' }, { master_id: 1, variant_id: 102, node_id: '20' }]
      const stale = { id: 1, name: 'Workflow', json_body: mockWorkflowJson, mappings, mapping_slot_states: { 'v:101': true, 'v:102': true }, created_at: '' }
      queryClient.setQueryData(['workflow', 1], stale)
      let resolveWorkflow!: (value: any) => void
      vi.mocked(workflowsApi.get).mockImplementationOnce(() => new Promise((resolve) => { resolveWorkflow = resolve }))
      const ui = <QueryClientProvider client={queryClient}><RescanModal workflowId={1} workflowJson={mockWorkflowJson} onClose={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>
      const first = render(ui)
      await waitFor(() => expect(workflowsApi.scan).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /適用・保存/ })).not.toBeInTheDocument()
      resolveWorkflow({ ...stale, mapping_slot_states: { 'v:101': false, 'v:102': false, 'v:999': false } })
      const inputs = await screen.findAllByRole('textbox', { name: 'ノードID' })
      expect(inputs[0]).toHaveValue('10')
      expect(inputs[1]).toHaveValue('20')
      expect(screen.getByRole('checkbox', { name: 'Mainステージ有効' })).not.toBeChecked()
      expect(inputs[0]).toHaveAttribute('readonly')
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
      expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toHaveValue('10')
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
      fireEvent.change(inputs[0], { target: { value: 'should-not-overwrite' } })
      expect(inputs[0]).toHaveValue('10')
      let saved: any
      vi.mocked(workflowsApi.update).mockImplementation(async (_id, payload) => { saved = { ...stale, ...payload }; return saved })
      fireEvent.click(screen.getByRole('button', { name: /適用・保存/ }))
      await waitFor(() => expect(saved).toBeDefined())
      expect(saved.mappings).toEqual(mappings)
      expect(saved.mapping_slot_states).toMatchObject({ 'v:101': false, 'v:102': false, 'v:999': false })
      first.unmount()
      vi.mocked(workflowsApi.get).mockResolvedValue(saved)
      render(ui)
      await screen.findAllByRole('textbox', { name: 'ノードID' })
      expect(screen.getByRole('checkbox', { name: 'Mainステージ有効' })).not.toBeChecked()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mainステージ有効' }))
      expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toHaveValue('10')
    })
    it('REQ-358/RESCAN_CLEAN REQ-358/AC-16 shows unresolved roles in the same mapping list', async () => {
      vi.mocked(workflowsApi.scan).mockResolvedValue({ matched: [], warnings: [] })

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={{}}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      expect(await screen.findByText('マッピング設定')).toBeInTheDocument()
      expect(screen.queryByText('未検出の役割')).not.toBeInTheDocument()
      expect(screen.getAllByText('Steps', { exact: true })).toHaveLength(2)
      expect(screen.getAllByRole('textbox', { name: 'ノードID' })).toHaveLength(2)
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-17 keeps direct input mounted while typing', async () => {
      vi.mocked(workflowsApi.scan).mockResolvedValue({ matched: [], warnings: [] })

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={{}}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      const input = (await screen.findAllByRole('textbox', { name: 'ノードID' }))[0] as HTMLInputElement
      input.focus()
      fireEvent.change(input, { target: { value: '42' } })

      expect(screen.getAllByRole('textbox', { name: 'ノードID' })[0]).toBe(input)
      expect(input.value).toBe('42')
      expect(input).toHaveFocus()
      expect(screen.queryByText('未検出の役割')).not.toBeInTheDocument()
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-18 keeps master order across matched and unresolved rows', async () => {
      const otherMaster: MappingMasterV2 = {
        ...mockMultiStageMasters[0],
        id: 2,
        base_key: 'other',
        name: 'Other Master',
        role: 'other',
        display_name: 'Other',
        param_name: 'other',
        sort_order: 2,
        variants: mockMultiStageMasters[0].variants.map((variant) => ({
          ...variant,
          id: variant.id + 200,
          master_id: 2,
          computed_role: variant.computed_role.replace('steps', 'other'),
        })),
      }
      vi.mocked(mappingMastersApi.list).mockResolvedValue([otherMaster, mockMultiStageMasters[0]])

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      const otherRole = (await screen.findAllByText('Other', { exact: true }))[0]
      const stepsRole = screen.getAllByText('Steps', { exact: true })[0]
      expect(otherRole.compareDocumentPosition(stepsRole) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-29 keeps mappings for masters absent from current settings', async () => {
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 1, name: 'Workflow', json_body: mockWorkflowJson,
        mappings: [{ master_id: 999, node_id: 'legacy-node' }], mapping_slot_states: {}, created_at: '',
      })
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)
      renderWithClient(<RescanModal workflowId={1} workflowJson={mockWorkflowJson} onClose={vi.fn()} onSaved={vi.fn()} />)
      await screen.findAllByRole('textbox', { name: 'ノードID' })
      fireEvent.click(screen.getByRole('button', { name: /適用・保存/i }))
      await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
        mappings: expect.arrayContaining([{ master_id: 999, node_id: 'legacy-node' }]),
      })))
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-33 retains a saved non-default node present in the graph', async () => {
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 1, name: 'Workflow', json_body: mockWorkflowJson,
        mappings: [{ master_id: 1, variant_id: 101, node_id: '30' }], mapping_slot_states: {}, created_at: '',
      })
      renderWithClient(<RescanModal workflowId={1} workflowJson={{
        ...mockWorkflowJson,
        '30': { class_type: 'KSampler', _meta: { title: 'Custom Sampler' }, inputs: { steps: 20 } },
      }} onClose={vi.fn()} onSaved={vi.fn()} />)
      const inputs = await screen.findAllByRole('textbox', { name: 'ノードID' })
      expect((inputs[0] as HTMLInputElement).value).toBe('30')
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-35 preserves a saved mapping whose node is missing from the workflow graph', async () => {
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 1, name: 'Workflow', json_body: mockWorkflowJson,
        mappings: [{ master_id: 1, variant_id: 101, node_id: '99' }], mapping_slot_states: {}, created_at: '',
      })
      vi.mocked(workflowsApi.scan).mockResolvedValue({
        matched: [{
          master_id: 1, variant_id: 101, stage_id: 1, stage_key: 'main', node_id: '10', node_title: 'KSampler Main',
        }],
        warnings: [],
      })
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      )

      const inputs = await screen.findAllByRole('textbox', { name: 'ノードID' })
      expect((inputs[0] as HTMLInputElement).value).toBe('99')
      expect(screen.getByText('Main · 参照先なし')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /適用・保存/i }))
      await waitFor(() => expect(workflowsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
        mappings: expect.arrayContaining([{ master_id: 1, variant_id: 101, node_id: '99' }]),
      })))
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-19 saves remapped nodes and persisted slot states', async () => {
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 1, name: 'Workflow', json_body: mockWorkflowJson,
        mappings: [
          { master_id: 1, variant_id: 101, node_id: '10' },
          { master_id: 1, variant_id: 102, node_id: '20' },
        ], mapping_slot_states: { 'v:101': true, 'v:102': false }, created_at: '',
      })
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      const inputs = await screen.findAllByRole('textbox', { name: 'ノードID' })
      expect(inputs).toHaveLength(2)
      expect((inputs[0] as HTMLInputElement).value).toBe('10')
      expect((inputs[1] as HTMLInputElement).value).toBe('20')
      expect(screen.getAllByRole('checkbox', { name: 'Steps有効' })[0]).toBeChecked()
      expect(screen.getAllByRole('checkbox', { name: 'Steps有効' })[1]).not.toBeChecked()
      fireEvent.change(inputs[0], { target: { value: '11' } })

      // Submit rescan modal
      const confirmBtn = screen.getByRole('button', { name: /適用・保存/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.update).toHaveBeenCalledWith(1, {
          mappings: [
            { master_id: 1, variant_id: 101, node_id: '11' },
            { master_id: 1, variant_id: 102, node_id: '20' },
          ],
          mapping_slot_states: expect.objectContaining({ 'v:101': true, 'v:102': false }),
        })
        expect(onSaved).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('REQ-358/RESCAN_CLEAN REQ-358/AC-20 preserves explicit empty slot values and identifiers', async () => {
      vi.mocked(workflowsApi.update).mockResolvedValue({ id: 1 } as any)
      const onSaved = vi.fn()
      const onClose = vi.fn()

      renderWithClient(
        <RescanModal
          workflowId={1}
          workflowJson={mockWorkflowJson}
          onClose={onClose}
          onSaved={onSaved}
        />
      )

      const inputs = await screen.findAllByRole('textbox', { name: 'ノードID' })
      fireEvent.change(inputs[0], { target: { value: '' } })

      const confirmBtn = screen.getByRole('button', { name: /適用・保存/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(workflowsApi.update).toHaveBeenCalledWith(1, {
          mappings: [{ master_id: 1, variant_id: 102, node_id: '20' }],
          mapping_slot_states: expect.any(Object),
        })
        expect(onSaved).toHaveBeenCalled()
      })
    })
  })
})
