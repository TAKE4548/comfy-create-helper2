import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/mocks/server'
import { MappingMasterEditModal } from '../MappingMasterEditModal'
import { mappingMastersApi } from '../../api/domains/mappingMasters'
import { bindingRulesApi } from '../../api/domains/bindingRules'
import { nodeSelectorsApi } from '../../api/domains/nodeSelectors'
import type {
  BindingRuleSet,
  MappingMasterV2,
  MasterAtomicSaveRequest,
  NodeSelector,
  ScanPreviewRequest,
  StageMaster,
} from '../../api/types'

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const flush = () => act(async () => {})

const TITLE = '新規マッピングマスター作成'
const SAVE_FAILED = '保存に失敗しました。変更は保存されていません'

// ── In-memory server state (transport is MSW; nothing inside the modal is mocked) ──
interface DbEntry { id: number; rule_set_id: number; class_type: string; param_name: string; priority: number }
interface DbRuleSet { id: number; name: string; entries: DbEntry[] }
interface DbPattern { id: number; selector_id: number; pattern: string; match_type: string; priority: number }
interface DbSelector { id: number; name: string; patterns: DbPattern[] }
interface DbVariant { id: number; master_id: number; stage_id: number; role: string; rs: number; ns: number | null; enabled: boolean }
interface DbMaster { id: number; base_key: string; name: string; input_type: string; group_id: number | null; default_enabled: boolean; variants: DbVariant[] }

const STAGES: StageMaster[] = [
  { id: 1, key: 'main', name: 'Main', suffix: '', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 1 },
  { id: 2, key: 'upscale', name: 'Upscale', suffix: '_upscale', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 2 },
  { id: 3, key: 'rough', name: 'Rough', suffix: '_rough', search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order: 3 },
]

interface Db {
  masters: Record<number, DbMaster>
  ruleSets: DbRuleSet[]
  selectors: DbSelector[]
  nextId: number
}

function makeDb(): Db {
  return {
    nextId: 1000,
    ruleSets: [
      { id: 1, name: 'RS-A', entries: [{ id: 10, rule_set_id: 1, class_type: 'CLIPTextEncode', param_name: 'text', priority: 1 }] },
      { id: 2, name: 'RS-B', entries: [{ id: 11, rule_set_id: 2, class_type: 'KSampler', param_name: 'steps', priority: 1 }] },
    ],
    selectors: [
      { id: 1, name: 'SEL-A', patterns: [{ id: 20, selector_id: 1, pattern: 'positive', match_type: 'contains', priority: 1 }] },
      { id: 2, name: 'SEL-B', patterns: [{ id: 21, selector_id: 2, pattern: 'upscale', match_type: 'exact', priority: 1 }] },
    ],
    masters: {
      100: {
        id: 100, base_key: 'prompt_positive', name: 'Positive Prompt', input_type: 'textarea', group_id: null, default_enabled: true,
        variants: [
          { id: 201, master_id: 100, stage_id: 1, role: 'prompt_positive', rs: 1, ns: 1, enabled: true },
          { id: 202, master_id: 100, stage_id: 2, role: 'prompt_positive_upscale', rs: 2, ns: 2, enabled: true },
        ],
      },
      101: {
        id: 101, base_key: 'other_pos', name: 'Other', input_type: 'textarea', group_id: null, default_enabled: true,
        variants: [{ id: 301, master_id: 101, stage_id: 1, role: 'other_pos', rs: 1, ns: 1, enabled: true }],
      },
    },
  }
}

let db: Db = makeDb()
const calls = { atomicSave: [] as MasterAtomicSaveRequest[], definitionWrites: 0, scanPreview: [] as ScanPreviewRequest[] }

function rolesUsing(kind: 'rs' | 'ns', id: number): string[] {
  const out: string[] = []
  for (const m of Object.values(db.masters)) for (const v of m.variants) if (v[kind] === id) out.push(v.role)
  return out.sort()
}

function masterJson(m: DbMaster) {
  return {
    id: m.id, group_id: m.group_id, base_key: m.base_key, name: m.name, display_name: m.name, param_name: 'text',
    input_type: m.input_type, default_enabled: m.default_enabled, sort_order: 1,
    variants: m.variants.map((v) => {
      const st = STAGES.find((s) => s.id === v.stage_id)!
      return {
        id: v.id, master_id: m.id, stage_id: v.stage_id, stage_key: st.key, stage_name: st.name, stage_suffix: st.suffix,
        role: v.role, computed_role: v.role, binding_rule_set_id: v.rs, node_selector_id: v.ns,
        custom_role_override: null, extra_title_patterns: null, is_enabled: v.enabled,
      }
    }),
  }
}

function applyAtomicSave(masterId: number, req: MasterAtomicSaveRequest) {
  const m = db.masters[masterId]
  const refs: Record<string, number> = {}
  for (const op of req.rule_sets) {
    if (op.op === 'create') {
      const id = db.nextId++
      refs[op.ref] = id
      db.ruleSets.push({ id, name: op.name, entries: (op.entries ?? []).map((e) => ({ id: db.nextId++, rule_set_id: id, ...e })) })
    } else {
      const rs = db.ruleSets.find((r) => r.id === op.id)!
      rs.name = op.name
      rs.entries = (op.entries ?? []).map((e) => ({ id: db.nextId++, rule_set_id: rs.id, ...e }))
    }
  }
  for (const op of req.selectors) {
    if (op.op === 'create') {
      const id = db.nextId++
      refs[op.ref] = id
      db.selectors.push({ id, name: op.name, patterns: (op.patterns ?? []).map((p) => ({ id: db.nextId++, selector_id: id, ...p })) })
    } else {
      const s = db.selectors.find((x) => x.id === op.id)!
      s.name = op.name
      s.patterns = (op.patterns ?? []).map((p) => ({ id: db.nextId++, selector_id: s.id, ...p }))
    }
  }
  const resolve = (r: { id?: number; ref?: string }) => (r.id !== undefined ? r.id : refs[r.ref as string])
  m.name = req.master.name
  m.input_type = req.master.input_type
  m.group_id = req.master.group_id
  m.default_enabled = req.master.default_enabled
  m.variants = req.variants.map((it) => {
    const st = STAGES.find((s) => s.id === it.stage_id)!
    const prev = m.variants.find((v) => v.id === it.id)
    return {
      id: it.id ?? db.nextId++, master_id: m.id, stage_id: it.stage_id,
      role: prev?.role ?? `${m.base_key}${st.suffix}`,
      rs: resolve(it.rule_set), ns: it.selector ? resolve(it.selector) : null, enabled: it.is_enabled,
    }
  })
}

type SaveMode = 'ok' | '409' | 'network'
let saveMode: SaveMode = 'ok'
let saveModes: SaveMode[] = []

function installHandlers() {
  server.use(
    http.get('/api/mapping-masters/:id', ({ params }) => HttpResponse.json(masterJson(db.masters[Number(params.id)]))),
    http.get('/api/binding-rules', () =>
      HttpResponse.json(db.ruleSets.map((r) => ({ ...r, referenced_roles: rolesUsing('rs', r.id) })))),
    http.get('/api/node-selectors', () =>
      HttpResponse.json(db.selectors.map((s) => ({ ...s, referenced_roles: rolesUsing('ns', s.id) })))),
    http.post('/api/mapping-masters/:id/atomic-save', async ({ params, request }) => {
      const body = (await request.json()) as MasterAtomicSaveRequest
      calls.atomicSave.push(body)
      const mode = saveModes.length > 0 ? (saveModes.shift() as SaveMode) : saveMode
      if (mode === '409') return new HttpResponse('conflict', { status: 409 })
      if (mode === 'network') return HttpResponse.error()
      applyAtomicSave(Number(params.id), body)
      return HttpResponse.json(masterJson(db.masters[Number(params.id)]))
    }),
    http.post('/api/binding-rules', () => { calls.definitionWrites += 1; return HttpResponse.json({}) }),
    http.put('/api/binding-rules/:id', () => { calls.definitionWrites += 1; return HttpResponse.json({}) }),
    http.post('/api/node-selectors', () => { calls.definitionWrites += 1; return HttpResponse.json({}) }),
    http.put('/api/node-selectors/:id', () => { calls.definitionWrites += 1; return HttpResponse.json({}) }),
    http.get('/api/workflows', () => HttpResponse.json([{ id: 7, name: 'WF-A', created_at: '' }])),
    http.post('/api/mapping-masters/scan-preview', async ({ request }) => {
      const body = (await request.json()) as ScanPreviewRequest
      calls.scanPreview.push(body)
      return HttpResponse.json({ workflow_id: body.workflow_id, results: [] })
    }),
  )
}

describe('MappingMasterEditModal common bottom-sheet Modal', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    db = makeDb()
    calls.atomicSave = []
    calls.definitionWrites = 0
    calls.scanPreview = []
    saveMode = 'ok'
    saveModes = []
    installHandlers()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  const renderComponent = (props: Partial<Parameters<typeof MappingMasterEditModal>[0]> = {}) => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const utils = render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen={true}
          onClose={onClose}
          master={null}
          groups={[]}
          stages={[]}
          onSave={onSave}
          {...props}
        />
      </QueryClientProvider>
    )
    return { onClose, onSave, ...utils }
  }

  // Edit-mode modal fed with data fetched through the real API layer (MSW transport).
  // onSave goes through mappingMastersApi.atomicSave exactly like MappingMasterSection does.
  async function renderEdit(masterId = 100, onSaveOverride?: (d: unknown) => Promise<void> | void) {
    const master = await mappingMastersApi.get(masterId)
    const ruleSets: BindingRuleSet[] = await bindingRulesApi.list()
    const selectors: NodeSelector[] = await nodeSelectorsApi.list()
    const onClose = vi.fn()
    const onSave = vi.fn(
      onSaveOverride ??
        (async (data: unknown) => {
          await mappingMastersApi.atomicSave(masterId, data as MasterAtomicSaveRequest)
        })
    )
    const utils = render(
      <QueryClientProvider client={queryClient}>
        <MappingMasterEditModal
          isOpen
          onClose={onClose}
          master={master}
          groups={[]}
          stages={STAGES}
          bindingRuleSets={ruleSets}
          nodeSelectors={selectors}
          onSave={onSave as never}
        />
      </QueryClientProvider>
    )
    await flush()
    return { onClose, onSave, ...utils }
  }

  const rowOf = (stage: string) => screen.getByRole('group', { name: `${stage} のVariant` })
  const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement
  const selectedText = (el: HTMLSelectElement) => el.selectedOptions[0]?.textContent
  const saveButton = () => screen.getByRole('button', { name: 'マスターを保存' })

  it('[REQ-365/AC-9] renders in the common bottom-sheet Modal (single handle, max-h-[85dvh], exactly one dialog)', async () => {
    renderComponent()
    await flush()

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(1)
    expect(screen.getAllByTestId('modal-sheet-handle')).toHaveLength(1)

    const dialog = dialogs[0]
    expect(dialog).toHaveAttribute('data-radius-exempt')
    expect(dialog).toHaveAttribute('data-sheet-max-height')
    expect(dialog.style.getPropertyValue('--modal-sheet-max-height')).toBe('85dvh')
    expect(dialog.className).toContain('rounded-t-2xl')
    expect(dialog).toHaveAttribute('aria-label', TITLE)
    expect(screen.getByRole('dialog', { name: new RegExp(TITLE) })).toBe(dialog)
    expect(dialog.closest('.fixed.inset-0.z-50')).toBeNull()
  })

  it('[REQ-365/AC-9] closes via Escape, backdrop click and close/cancel buttons', async () => {
    const { onClose, container } = renderComponent()
    await flush()
    const dialog = screen.getByRole('dialog')

    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = document.querySelector('.modal-backdrop') as HTMLElement
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(within(dialog).getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(within(dialog).getByText('キャンセル'))
    expect(onClose).toHaveBeenCalledTimes(4)
    expect(container).toBeTruthy()
  })

  it('[REQ-365/AC-9] does not close on Escape while the shared definition choice panel is open', async () => {
    const { onClose } = await renderEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
    fireEvent.change(screen.getByLabelText('Entry 1 のclass_type'), { target: { value: 'Changed' } })
    fireEvent.click(saveButton())

    const panel = await screen.findByRole('alertdialog')
    expect(panel).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    // Without the panel the same key closes the modal again.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[REQ-365/AC-9] form submit and validation are unchanged inside the sheet', async () => {
    const { onSave } = renderComponent()
    await flush()
    const save = screen.getByText('マスターを保存')
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Prompt' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'text' } })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('例: KSampler'), { target: { value: 'CLIPTextEncode' } })
    expect(save).not.toBeDisabled()

    fireEvent.submit(save.closest('form') as HTMLFormElement)
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload).toEqual(
      expect.objectContaining({ name: 'Prompt', display_name: 'Prompt', param_name: 'text', input_type: expect.any(String) })
    )
    for (const legacy of ['base_title_patterns', 'title_patterns', 'fallback_param_names', 'variants']) {
      expect(payload).not.toHaveProperty(legacy)
    }
    expect(screen.getByText('保存後にステージ別Variantを編集できます')).toBeInTheDocument()
  })

  it('[REQ-365/AC-9] touch targets: close/cancel/save and variant controls expose min-h-[44px]; icon delete has hit-slop', async () => {
    const { unmount } = renderComponent()
    await flush()
    const createDialog = screen.getByRole('dialog')
    for (const el of [
      within(createDialog).getByLabelText('閉じる'),
      within(createDialog).getByText('キャンセル'),
      within(createDialog).getByText('マスターを保存'),
    ]) {
      expect(el.className).toContain('min-h-[44px]')
      expect(el.className).toContain('touch-manipulation')
    }
    unmount()

    await renderEdit()
    for (const el of [
      screen.getByRole('button', { name: 'Main のRuleSetを編集' }),
      screen.getByRole('button', { name: 'Main のNodeSelectorを新規作成' }),
      screen.getByRole('button', { name: 'Variantを追加' }),
      select('Main のRuleSet'),
    ]) {
      expect(el.className).toContain('min-h-[44px]')
      expect(el.className).toContain('touch-manipulation')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
    const del = screen.getByLabelText('Entry 1 を削除')
    expect(del.className).toContain('before:absolute')
    expect(del.className).toContain('before:-inset-2')
    expect(del.className).toContain('touch-manipulation')
  })

  it('[REQ-365/AC-9] renders nothing when isOpen is false', async () => {
    renderComponent({ isOpen: false })
    await flush()
    expect(screen.queryAllByRole('dialog')).toHaveLength(0)
  })

  describe('[REQ-419] master-centred editing', () => {
    it('[REQ-419/AC-3] create mode requires initial rule set class name and sends it', async () => {
      let posted: unknown = null
      let postCount = 0
      server.use(
        http.post('/api/mapping-masters', async ({ request }) => {
          postCount += 1
          posted = await request.json()
          return HttpResponse.json({})
        })
      )
      renderComponent({
        onSave: (async (data: unknown) => {
          await mappingMastersApi.create(data)
        }) as never,
      })
      await flush()
      fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Prompt' } })
      fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'text' } })

      // Class name empty / whitespace: blocked, nothing is sent, guidance is visible.
      expect(saveButton()).toBeDisabled()
      expect(screen.getByText(/クラス名を入力してください/)).toBeInTheDocument()
      fireEvent.change(screen.getByPlaceholderText('例: KSampler'), { target: { value: '   ' } })
      expect(saveButton()).toBeDisabled()
      fireEvent.submit(saveButton().closest('form') as HTMLFormElement)
      await flush()
      expect(postCount).toBe(0)

      fireEvent.change(screen.getByPlaceholderText('例: KSampler'), { target: { value: ' CLIPTextEncode ' } })
      expect(saveButton()).not.toBeDisabled()
      fireEvent.click(saveButton())
      await waitFor(() => expect(postCount).toBe(1))
      expect(posted).toEqual({
        name: 'Prompt',
        display_name: 'Prompt',
        param_name: 'text',
        expected_class_types: ['CLIPTextEncode'],
        input_type: 'textarea',
        default_enabled: true,
        group_id: null,
      })
    })

    it('[REQ-419/AC-3] create mode rejects comma separated class names', async () => {
      const posted: unknown[] = []
      server.use(
        http.post('/api/mapping-masters', async ({ request }) => {
          posted.push(await request.json())
          return HttpResponse.json({})
        })
      )
      renderComponent({
        onSave: (async (data: unknown) => {
          await mappingMastersApi.create(data)
        }) as never,
      })
      await flush()
      fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Prompt' } })
      fireEvent.change(screen.getByPlaceholderText('例: text, steps, cfg'), { target: { value: 'text' } })
      const cls = screen.getByPlaceholderText('例: KSampler')

      fireEvent.change(cls, { target: { value: 'KSampler, CLIPTextEncode' } })
      const err = screen.getByText('クラス名は1つだけ入力してください（カンマは使えません）')
      expect(err).toHaveAttribute('role', 'alert')
      expect(err.className).not.toContain('truncate')
      expect(saveButton()).toBeDisabled()
      fireEvent.submit(saveButton().closest('form') as HTMLFormElement)
      await flush()
      expect(posted).toHaveLength(0)

      fireEvent.change(cls, { target: { value: 'KSampler' } })
      expect(screen.queryByText('クラス名は1つだけ入力してください（カンマは使えません）')).toBeNull()
      expect(saveButton()).not.toBeDisabled()
      fireEvent.click(saveButton())
      await waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toEqual(expect.objectContaining({ param_name: 'text', expected_class_types: ['KSampler'] }))
    })

    it('[REQ-419/AC-1] edit mode shows only master value fields', async () => {
      await renderEdit()
      expect((screen.getByPlaceholderText('例: Positive Prompt') as HTMLInputElement).value).toBe('Positive Prompt')
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
      expect(screen.getByLabelText('新規マッピングで基本有効')).toBeInTheDocument()
      expect(screen.getByText('大カテゴリグループ')).toBeInTheDocument()

      expect(screen.queryByPlaceholderText('例: text, steps, cfg')).toBeNull()
      expect(screen.queryByPlaceholderText('例: KSampler')).toBeNull()
      expect(screen.queryByText(/Class Types/)).toBeNull()
      expect(screen.queryByText(/fallback/i)).toBeNull()
      expect(screen.queryByText(/Role上書き/)).toBeNull()
      expect(screen.queryAllByRole('tab')).toHaveLength(0)
      expect(screen.queryByRole('tablist')).toBeNull()
      expect(screen.queryByText('ワークフローからノード選択 (逆引き)')).toBeNull()
    })

    it('[REQ-419/AC-2] variant rows show role, enabled, entries and patterns by priority', async () => {
      db.ruleSets[0].entries = [
        { id: 10, rule_set_id: 1, class_type: 'ClassLow', param_name: 'p', priority: 5 },
        { id: 12, rule_set_id: 1, class_type: 'ClassHigh', param_name: 'q', priority: 1 },
      ]
      db.selectors[0].patterns = [
        { id: 20, selector_id: 1, pattern: 'zzz-late', match_type: 'exact', priority: 9 },
        { id: 22, selector_id: 1, pattern: 'aaa-early', match_type: 'contains', priority: 2 },
      ]
      db.masters[100].variants[1].ns = null
      await renderEdit()

      const main = rowOf('Main')
      expect(within(main).getByTestId('variant-role').tagName).toBe('SPAN')
      expect(within(main).getByTestId('variant-role')).toHaveTextContent('prompt_positive')
      expect(within(main).queryAllByRole('textbox')).toHaveLength(0)
      expect(within(main).getByLabelText('Main を有効化')).toBeChecked()

      const entries = within(main).getAllByTestId('variant-entry').map((li) => li.textContent ?? '')
      expect(entries).toHaveLength(2)
      expect(entries[0]).toContain('ClassHigh × q')
      expect(entries[1]).toContain('ClassLow × p')

      const patterns = within(main).getAllByTestId('variant-pattern').map((li) => li.textContent ?? '')
      expect(patterns[0]).toContain('aaa-early')
      expect(patterns[0]).toContain('contains')
      expect(patterns[1]).toContain('zzz-late')
      expect(patterns[1]).toContain('exact')

      const up = rowOf('Upscale')
      expect(within(up).queryAllByTestId('variant-pattern')).toHaveLength(0)
      expect(selectedText(select('Upscale のNodeSelector'))).toBe('セレクタなし')
      const plain = within(up).getAllByText('セレクタなし').filter((el) => el.tagName !== 'OPTION')
      expect(plain).toHaveLength(1)
      expect(within(up).queryAllByRole('textbox')).toHaveLength(0)
    })

    it('[REQ-419/AC-3] switching definitions persists and reopen shows new names', async () => {
      const first = await renderEdit()

      fireEvent.change(select('Main のRuleSet'), { target: { value: 'rs:2' } })
      expect(selectedText(select('Main のRuleSet'))).toBe('RS-B')

      fireEvent.click(screen.getByRole('button', { name: 'Upscale のNodeSelectorを新規作成' }))
      fireEvent.change(screen.getByLabelText('NodeSelector名'), { target: { value: 'NEW-SEL' } })
      fireEvent.change(screen.getByLabelText('パターン 1 の文字列'), { target: { value: 'upscale prompt' } })
      fireEvent.click(saveButton())

      await waitFor(() => expect(calls.atomicSave).toHaveLength(1))
      await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1))
      expect(calls.definitionWrites).toBe(0)
      expect(calls.atomicSave[0].selectors).toEqual([
        expect.objectContaining({ op: 'create', name: 'NEW-SEL', patterns: [expect.objectContaining({ pattern: 'upscale prompt' })] }),
      ])
      first.unmount()

      await renderEdit()
      expect(selectedText(select('Main のRuleSet'))).toBe('RS-B')
      const main = rowOf('Main')
      expect(within(main).getAllByTestId('variant-entry')[0]).toHaveTextContent('KSampler × steps')
      expect(selectedText(select('Upscale のNodeSelector'))).toBe('NEW-SEL')
      expect(within(rowOf('Upscale')).getAllByTestId('variant-pattern')[0]).toHaveTextContent('upscale prompt')

      // The other role that referenced the same definitions is untouched.
      const other = await mappingMastersApi.get(101)
      expect(other.variants[0].binding_rule_set_id).toBe(1)
      expect(other.variants[0].node_selector_id).toBe(1)
      expect(db.ruleSets[0].entries[0].class_type).toBe('CLIPTextEncode')
      expect(calls.atomicSave).toHaveLength(1)
      expect(calls.definitionWrites).toBe(0)
    })

    it('[REQ-419/AC-4] shared edit shows referrer roles and blocks save until chosen', async () => {
      const { onSave } = await renderEdit()
      fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
      fireEvent.change(screen.getByLabelText('Entry 1 のclass_type'), { target: { value: 'EditedClass' } })
      fireEvent.click(saveButton())

      const panel = await screen.findByRole('alertdialog')
      expect(panel).toHaveAccessibleName(/この(RuleSet)は他のroleからも参照されています/)
      expect(within(panel).getByText('other_pos')).toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: '共有定義を更新' })).toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: '複製してこのVariantだけ変更' })).toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: '戻る' })).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
      expect(calls.atomicSave).toHaveLength(0)
      expect(calls.definitionWrites).toBe(0)

      // "戻る" does nothing: still nothing sent.
      fireEvent.click(within(panel).getByRole('button', { name: '戻る' }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(onSave).not.toHaveBeenCalled()

      fireEvent.click(saveButton())
      fireEvent.click(await screen.findByRole('button', { name: '共有定義を更新' }))
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
      expect(calls.atomicSave).toHaveLength(1)
      expect(calls.definitionWrites).toBe(0)
    })

    it('[REQ-419/AC-5] both choices are reflected after reopen for every referrer: duplicate for this variant', async () => {
      const first = await renderEdit()
      fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
      fireEvent.change(screen.getByLabelText('Entry 1 のclass_type'), { target: { value: 'EditedClass' } })
      fireEvent.click(saveButton())
      fireEvent.click(await screen.findByRole('button', { name: '複製してこのVariantだけ変更' }))

      await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(calls.atomicSave).toHaveLength(1))
      expect(calls.definitionWrites).toBe(0)
      first.unmount()

      await renderEdit()
      expect(selectedText(select('Main のRuleSet'))).toBe('RS-A (prompt_positive)')
      expect(within(rowOf('Main')).getAllByTestId('variant-entry')[0]).toHaveTextContent('EditedClass × text')

      // Other referrer keeps the original content.
      const other = await mappingMastersApi.get(101)
      expect(other.variants[0].binding_rule_set_id).toBe(1)
      const rs1 = (await bindingRulesApi.list()).find((r) => r.id === 1)!
      expect(rs1.name).toBe('RS-A')
      expect(rs1.entries[0].class_type).toBe('CLIPTextEncode')
      expect(calls.atomicSave).toHaveLength(1)
    })

    it('[REQ-419/AC-5] both choices are reflected after reopen for every referrer: update shared', async () => {
      const first = await renderEdit()
      fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
      fireEvent.change(screen.getByLabelText('Entry 1 のclass_type'), { target: { value: 'EditedClass' } })
      fireEvent.click(saveButton())
      fireEvent.click(await screen.findByRole('button', { name: '共有定義を更新' }))

      await waitFor(() => expect(first.onSave).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(calls.atomicSave).toHaveLength(1))
      expect(calls.definitionWrites).toBe(0)
      first.unmount()

      await renderEdit()
      expect(selectedText(select('Main のRuleSet'))).toBe('RS-A')
      expect(within(rowOf('Main')).getAllByTestId('variant-entry')[0]).toHaveTextContent('EditedClass × text')

      // Every referrer (including the other role) now sees the new content.
      const other = await mappingMastersApi.get(101)
      const rs = (await bindingRulesApi.list()).find((r) => r.id === other.variants[0].binding_rule_set_id)!
      expect(rs.entries[0].class_type).toBe('EditedClass')
      expect(calls.atomicSave).toHaveLength(1)
    })

    it('[REQ-419/AC-6] uniqueness error is shown on the row and nothing is sent', async () => {
      const { onSave } = await renderEdit()

      // Duplicate stage: the added row defaults to the first stage (Main), which is already used.
      fireEvent.click(screen.getByRole('button', { name: 'Variantを追加' }))
      fireEvent.click(saveButton())
      await waitFor(() => expect(within(rowOf('Upscale')).queryAllByRole('alert')).toHaveLength(0))
      const mainRows = screen.getAllByRole('group', { name: 'Main のVariant' })
      expect(mainRows).toHaveLength(2)
      for (const r of mainRows) {
        expect(within(r).getByRole('alert')).toHaveTextContent('ステージ「Main」が重複しています')
      }
      expect(onSave).not.toHaveBeenCalled()
      expect(calls.atomicSave).toHaveLength(0)

      // Move the added row to Rough; now the same selector used twice is rejected.
      const addedRow = mainRows.find((r) => within(r).queryByLabelText('Variantのステージ')) as HTMLElement
      fireEvent.change(within(addedRow).getByLabelText('Variantのステージ'), { target: { value: '3' } })
      fireEvent.change(select('Rough のNodeSelector'), { target: { value: 'ns:1' } })
      fireEvent.click(saveButton())
      const rough = rowOf('Rough')
      expect(within(rough).getByRole('alert')).toHaveTextContent('同じノードセレクタが複数の行で使われています')
      expect(within(rowOf('Main')).getByRole('alert')).toHaveTextContent('同じノードセレクタが複数の行で使われています')
      expect(onSave).not.toHaveBeenCalled()
      expect(calls.atomicSave).toHaveLength(0)
      expect(calls.definitionWrites).toBe(0)

      // Several rows without a selector are allowed.
      fireEvent.change(select('Rough のNodeSelector'), { target: { value: '' } })
      fireEvent.change(select('Main のNodeSelector'), { target: { value: '' } })
      fireEvent.change(select('Upscale のNodeSelector'), { target: { value: '' } })
      fireEvent.click(saveButton())
      await waitFor(() => expect(calls.atomicSave).toHaveLength(1))
      expect(calls.atomicSave[0].variants.map((v) => v.selector)).toEqual([null, null, null])
    })

    it('[REQ-419/AC-6] server 422 is mapped to the variant row', async () => {
      server.use(
        http.post('/api/mapping-masters/:id/atomic-save', () =>
          HttpResponse.json(
            {
              detail: {
                code: 'MASTER_SAVE_VALIDATION_FAILED',
                errors: [
                  { scope: 'variant', index: 0, ref: null, row_key: 'v:201', field: 'selector', message: 'ROW-LEVEL-ERROR' },
                  { scope: 'master', index: 0, ref: null, row_key: null, field: 'name', message: 'GENERAL-ERROR' },
                ],
              },
            },
            { status: 422 }
          )
        )
      )
      const { onClose } = await renderEdit()
      fireEvent.click(saveButton())

      await waitFor(() => expect(within(rowOf('Main')).getByRole('alert')).toHaveTextContent('ROW-LEVEL-ERROR'))
      expect(within(rowOf('Upscale')).queryAllByRole('alert')).toHaveLength(0)
      const general = screen.getByText('GENERAL-ERROR')
      expect(general).toHaveAttribute('role', 'alert')
      expect(rowOf('Main').contains(general)).toBe(false)
      expect(screen.queryByText(SAVE_FAILED)).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('[REQ-419/AC-12] save failure keeps the draft and shows an error', async () => {
      const { onSave, onClose } = await renderEdit()

      fireEvent.change(screen.getByPlaceholderText('例: Positive Prompt'), { target: { value: 'Renamed Prompt' } })
      // Row 1: edit the shared selector (needs a choice) and choose "duplicate".
      fireEvent.click(screen.getByRole('button', { name: 'Main のNodeSelectorを編集' }))
      fireEvent.change(screen.getByLabelText('パターン 1 の文字列'), { target: { value: 'edited-pattern' } })
      // Row 2: switch the RuleSet to the shared RS-A.
      fireEvent.change(select('Upscale のRuleSet'), { target: { value: 'rs:1' } })

      saveModes = ['409', 'network', 'ok']
      fireEvent.click(saveButton())
      fireEvent.click(await screen.findByRole('button', { name: '複製してこのVariantだけ変更' }))

      const expectDraftKept = () => {
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect((screen.getByPlaceholderText('例: Positive Prompt') as HTMLInputElement).value).toBe('Renamed Prompt')
        expect(select('Upscale のRuleSet').value).toBe('rs:1')
        expect(select('Main のNodeSelector').value).toBe('ns:1')
        expect(within(rowOf('Main')).getAllByTestId('variant-pattern')[0]).toHaveTextContent('edited-pattern')
        expect(screen.queryByRole('alertdialog')).toBeNull()
      }

      // 409 conflict
      await waitFor(() => expect(calls.atomicSave).toHaveLength(1))
      expect(await screen.findByText(SAVE_FAILED)).toHaveAttribute('role', 'alert')
      expectDraftKept()
      expect(saveButton()).not.toBeDisabled()

      // network failure on retry: the choice is kept, no panel, same request
      fireEvent.click(saveButton())
      await waitFor(() => expect(calls.atomicSave).toHaveLength(2))
      expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
      expectDraftKept()

      // success on the third attempt sends the very same request
      fireEvent.click(saveButton())
      await waitFor(() => expect(calls.atomicSave).toHaveLength(3))
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3))
      expect(calls.atomicSave[1]).toEqual(calls.atomicSave[0])
      expect(calls.atomicSave[2]).toEqual(calls.atomicSave[0])
      expect(calls.atomicSave[0].master.name).toBe('Renamed Prompt')
      expect(calls.atomicSave[0].selectors).toEqual([
        expect.objectContaining({ op: 'create', name: 'SEL-A (prompt_positive)' }),
      ])
      expect(calls.definitionWrites).toBe(0)
    })

    it('[REQ-419/AC-8] title conditions are editable only in the selector editor', async () => {
      await renderEdit()
      expect(screen.queryAllByLabelText(/パターン \d+ の文字列/)).toHaveLength(0)
      expect(screen.queryAllByPlaceholderText('タイトル条件（パターン）')).toHaveLength(0)

      fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
      expect(screen.queryAllByLabelText(/パターン \d+ の文字列/)).toHaveLength(0)
      fireEvent.click(screen.getByRole('button', { name: '編集を閉じる' }))

      fireEvent.click(screen.getByRole('button', { name: 'Main のNodeSelectorを編集' }))
      const inputs = screen.getAllByLabelText(/パターン \d+ の文字列/)
      expect(inputs).toHaveLength(1)
      for (const input of inputs) {
        expect(input.closest('[data-testid="selector-pattern-editor"]')).not.toBeNull()
        expect(rowOf('Main').contains(input)).toBe(true)
      }
      expect(within(rowOf('Upscale')).queryAllByLabelText(/パターン \d+ の文字列/)).toHaveLength(0)
    })

    it('[REQ-419/AC-9] preview panel receives the unsaved draft', async () => {
      await renderEdit()
      fireEvent.click(screen.getByRole('button', { name: 'Main のRuleSetを編集' }))
      fireEvent.change(screen.getByLabelText('Entry 1 のclass_type'), { target: { value: 'UnsavedClass' } })

      const sel = await screen.findByLabelText('プレビュー対象ワークフロー')
      await waitFor(() => expect(sel.querySelectorAll('option')).toHaveLength(1))
      fireEvent.click(screen.getByRole('button', { name: 'プレビュー実行' }))

      await waitFor(() => expect(calls.scanPreview).toHaveLength(1))
      const body = calls.scanPreview[0]
      expect(body.workflow_id).toBe(7)
      const main = body.variants.find((v) => v.client_key === 'v:201')!
      expect(main.entries[0].class_type).toBe('UnsavedClass')
      expect(main.patterns).not.toBeNull()
      const up = body.variants.find((v) => v.client_key === 'v:202')!
      expect(up.entries[0].class_type).toBe('KSampler')
      // Nothing is persisted by a preview.
      expect(calls.atomicSave).toHaveLength(0)
      expect(db.ruleSets[0].entries[0].class_type).toBe('CLIPTextEncode')
    })
  })
})
