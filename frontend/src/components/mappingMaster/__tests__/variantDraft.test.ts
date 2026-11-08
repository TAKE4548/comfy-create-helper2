import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/mocks/server'
import { mappingMastersApi } from '../../../api/domains/mappingMasters'
import type {
  BindingRuleSet,
  MappingMasterV2,
  MasterAtomicSaveRequest,
  NodeSelector,
  StageMaster,
} from '../../../api/types'
import {
  buildAtomicSaveRequest,
  buildMasterDraft,
  buildScanPreviewRequest,
  findOtherReferrers,
  generateCopyName,
  isDefinitionDirty,
  mapServerValidationErrors,
  pendingSharedChoices,
  validateVariantDrafts,
  type MasterDraftState,
  type RuleSetDraft,
  type SelectorDraft,
  type VariantDraft,
} from '../variantDraft'

const MASTER_INFO = { name: 'M', input_type: 'image', group_id: null, default_enabled: true }

function stage(id: number, key: string, sort_order: number): StageMaster {
  return { id, key, name: key.toUpperCase(), suffix: `_${key}`, search_keywords: null, previous_suffixes: null, is_builtin: true, is_active: true, sort_order }
}

function row(over: Partial<VariantDraft> & { rowKey: string }): VariantDraft {
  return {
    id: null, stageId: 1, stageKey: 's1', stageName: 'S1', stageSortOrder: 0, role: 'r',
    isEnabled: true, ruleSetKey: null, selectorKey: null, savedRole: null, ...over,
  }
}

function emptyState(over: Partial<MasterDraftState> = {}): MasterDraftState {
  return { variants: [], ruleSets: {}, selectors: {}, editOrigin: {}, choices: {}, ...over }
}

function persistedRuleSet(id: number, name: string, roles: string[]): RuleSetDraft {
  const entries = [{ class_type: 'A', param_name: 'p', priority: 0 }]
  return { key: `rs:${id}`, id, name, entries, saved: { name, entries: entries.map(e => ({ ...e })) }, referencedRoles: roles }
}

function persistedSelector(id: number, name: string, roles: string[]): SelectorDraft {
  const patterns = [{ pattern: 'x', match_type: 'exact' as const, priority: 0 }]
  return { key: `ns:${id}`, id, name, patterns, saved: { name, patterns: patterns.map(p => ({ ...p })) }, referencedRoles: roles }
}

describe('variantDraft', () => {
  it('[REQ-419/AC-2] buildMasterDraft orders variants by stage sort_order', () => {
    const master = {
      id: 1, base_key: 'b', name: 'M', input_type: 'image', group_id: null, param_name: 'p', expected_class_types: null,
      base_title_patterns: null, sort_order: 0,
      variants: [
        { id: 11, master_id: 1, stage_id: 3, stage_key: 'c', stage_name: 'C', stage_suffix: '_c', role: 'rc', binding_rule_set_id: 5, node_selector_id: null, custom_role_override: null, computed_role: 'cc', extra_title_patterns: null, is_enabled: true },
        { id: 12, master_id: 1, stage_id: 2, stage_key: 'b', stage_name: 'B', stage_suffix: '_b', custom_role_override: null, computed_role: 'cb', extra_title_patterns: null, is_enabled: false, binding_rule_set_id: 5, node_selector_id: 7 },
        { id: 13, master_id: 1, stage_id: 1, stage_key: 'a', stage_name: 'A', stage_suffix: '_a', role: 'ra', custom_role_override: null, computed_role: 'ca', extra_title_patterns: null, is_enabled: true, binding_rule_set_id: 5 },
      ],
    } as MappingMasterV2
    const stages = [stage(1, 'a', 30), stage(2, 'b', 10), stage(3, 'c', 20)]
    const rs: BindingRuleSet[] = [{ id: 5, name: 'RS', entries: [{ id: 1, rule_set_id: 5, class_type: 'X', param_name: 'q', priority: 2 }], referenced_roles: ['rc'] }]
    const ns: NodeSelector[] = [{ id: 7, name: 'NS', patterns: [{ id: 1, selector_id: 7, pattern: 'zz', match_type: 'contains', priority: 1 }], referenced_roles: ['cb'] }]
    const draft = buildMasterDraft(master, stages, rs, ns)
    expect(draft.variants.map(v => v.rowKey)).toEqual(['v:12', 'v:11', 'v:13'])
    const v12 = draft.variants[0]
    expect(v12.role).toBe('cb')
    expect(v12.savedRole).toBe('cb')
    expect(v12.stageSortOrder).toBe(10)
    expect(v12.ruleSetKey).toBe('rs:5')
    expect(v12.selectorKey).toBe('ns:7')
    expect(draft.variants[1].role).toBe('rc')
    expect(draft.variants[1].selectorKey).toBeNull()
    expect(draft.ruleSets['rs:5'].entries).toEqual([{ class_type: 'X', param_name: 'q', priority: 2 }])
    expect(draft.selectors['ns:7'].patterns).toEqual([{ pattern: 'zz', match_type: 'contains', priority: 1 }])
    expect(draft.ruleSets['rs:5'].saved?.name).toBe('RS')
    expect(isDefinitionDirty(draft.ruleSets['rs:5'])).toBe(false)
  })

  it('[REQ-419/AC-3] buildAtomicSaveRequest assigns new definitions only to the edited row', () => {
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, stageId: 1, stageSortOrder: 1, role: 'a', savedRole: 'a', ruleSetKey: 'rs:5', selectorKey: null }),
        row({ rowKey: 'new:1', id: null, stageId: 2, stageSortOrder: 2, role: 'b', ruleSetKey: 'rs:5', selectorKey: 'ns:new:1' }),
      ],
      ruleSets: { 'rs:5': persistedRuleSet(5, 'RS', ['a']) },
      selectors: { 'ns:new:1': { key: 'ns:new:1', id: null, name: 'New Sel', patterns: [{ pattern: 'q', match_type: 'contains', priority: 0 }], saved: null, referencedRoles: [] } },
      editOrigin: { 'ns:new:1': 'new:1' },
    })
    const req = buildAtomicSaveRequest(state, MASTER_INFO, { ruleSet: ['RS'], selector: [] })
    expect(req.master).toEqual(MASTER_INFO)
    expect(req.rule_sets).toEqual([])
    expect(req.selectors).toEqual([
      { ref: 'ns:new:1', op: 'create', id: null, name: 'New Sel', patterns: [{ pattern: 'q', match_type: 'contains', priority: 0 }] },
    ])
    expect(req.variants).toEqual([
      { row_key: 'v:1', id: 1, stage_id: 1, is_enabled: true, rule_set: { id: 5 }, selector: null },
      { row_key: 'new:1', id: null, stage_id: 2, is_enabled: true, rule_set: { id: 5 }, selector: { ref: 'ns:new:1' } },
    ])
    expect('selector' in req.variants[0]).toBe(true)
  })

  it('[REQ-419/AC-4] findOtherReferrers combines server and draft references', () => {
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5' }),
        row({ rowKey: 'v:2', id: 2, stageId: 2, role: 'sibling-renamed', savedRole: 'sibling', ruleSetKey: 'rs:5' }),
        row({ rowKey: 'new:1', stageId: 3, role: 'fresh', ruleSetKey: 'rs:5' }),
        row({ rowKey: 'v:3', id: 3, stageId: 4, role: 'unrelated', savedRole: 'unrelated', ruleSetKey: 'rs:9' }),
      ],
      // server roles: this master's saved roles plus another master's role
      ruleSets: { 'rs:5': persistedRuleSet(5, 'RS', ['edit', 'sibling', 'other-master']) },
      editOrigin: { 'rs:5': 'v:1' },
    })
    expect(findOtherReferrers(state, 'ruleSet', 'rs:5')).toEqual(['fresh', 'other-master', 'sibling-renamed'])
    // selector kind uses selectorKey, not ruleSetKey
    expect(findOtherReferrers(emptyState({ ...state, selectors: { 'ns:1': persistedSelector(1, 'N', []) } }), 'selector', 'ns:1')).toEqual([])
  })

  it('[REQ-419/AC-4] pendingSharedChoices lists only dirty persisted shared definitions', () => {
    const dirtyShared = { ...persistedRuleSet(5, 'RS', ['edit', 'other']), name: 'RS renamed' }
    const cleanShared = persistedRuleSet(6, 'Clean', ['edit', 'other'])
    const dirtyAlone = { ...persistedRuleSet(7, 'Alone', ['edit']), name: 'Alone2' }
    const newDef: RuleSetDraft = { key: 'rs:new:1', id: null, name: 'N', entries: [], saved: null, referencedRoles: [] }
    const decided = { ...persistedRuleSet(8, 'Decided', ['edit', 'other']), name: 'Decided2' }
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5' }),
      ],
      ruleSets: { 'rs:5': dirtyShared, 'rs:6': cleanShared, 'rs:7': dirtyAlone, 'rs:new:1': newDef, 'rs:8': decided },
      editOrigin: { 'rs:5': 'v:1', 'rs:6': 'v:1', 'rs:7': 'v:1', 'rs:8': 'v:1' },
      choices: { 'rs:8': 'update_shared' },
    })
    expect(pendingSharedChoices(state)).toEqual([
      { kind: 'ruleSet', defKey: 'rs:5', originRowKey: 'v:1', otherRoles: ['other'] },
    ])
    expect(isDefinitionDirty(newDef)).toBe(false)
    expect(isDefinitionDirty(dirtyShared)).toBe(true)
    expect(isDefinitionDirty(cleanShared)).toBe(false)
    // content order matters
    const reordered = {
      ...persistedRuleSet(9, 'R', []),
      saved: { name: 'R', entries: [{ class_type: 'A', param_name: 'p', priority: 0 }, { class_type: 'B', param_name: 'q', priority: 1 }] },
      entries: [{ class_type: 'B', param_name: 'q', priority: 1 }, { class_type: 'A', param_name: 'p', priority: 0 }],
    }
    expect(isDefinitionDirty(reordered)).toBe(true)
  })

  it('[REQ-419/AC-5] duplicate choice builds a copy op and keeps the original', () => {
    const edited = { ...persistedRuleSet(5, 'RS', ['edit', 'other']), entries: [{ class_type: 'B', param_name: 'z', priority: 0 }] }
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, stageId: 1, stageSortOrder: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5' }),
        row({ rowKey: 'v:2', id: 2, stageId: 2, stageSortOrder: 2, role: 'other', savedRole: 'other', ruleSetKey: 'rs:5' }),
      ],
      ruleSets: { 'rs:5': edited },
      editOrigin: { 'rs:5': 'v:1' },
      choices: { 'rs:5': 'duplicate_for_variant' },
    })
    const req = buildAtomicSaveRequest(state, MASTER_INFO, { ruleSet: ['RS', 'RS (edit)'], selector: [] })
    expect(req.rule_sets).toEqual([
      { ref: 'rs:5:copy', op: 'create', id: null, name: 'RS (edit) 2', entries: [{ class_type: 'B', param_name: 'z', priority: 0 }] },
    ])
    expect(req.rule_sets.some(o => o.op === 'update')).toBe(false)
    expect(req.variants.map(v => v.rule_set)).toEqual([{ ref: 'rs:5:copy' }, { id: 5 }])
    expect(generateCopyName('RS', 'edit', ['RS (edit)', 'RS (edit) 2'])).toBe('RS (edit) 3')
    expect(generateCopyName('RS', 'edit', [])).toBe('RS (edit)')
  })

  it('[REQ-419/AC-5] update-shared choice builds an update op', () => {
    const edited = { ...persistedRuleSet(5, 'RS', ['edit', 'other']), name: 'RS2' }
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, stageId: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5' }),
        row({ rowKey: 'v:2', id: 2, stageId: 2, stageSortOrder: 1, role: 'other', savedRole: 'other', ruleSetKey: 'rs:5' }),
      ],
      ruleSets: { 'rs:5': edited, 'rs:99': persistedRuleSet(99, 'Unused', []) },
      editOrigin: { 'rs:5': 'v:1' },
      choices: { 'rs:5': 'update_shared' },
    })
    const req = buildAtomicSaveRequest(state, MASTER_INFO, { ruleSet: ['RS'], selector: [] })
    expect(req.rule_sets).toEqual([
      { ref: 'rs:5', op: 'update', id: 5, name: 'RS2', entries: [{ class_type: 'A', param_name: 'p', priority: 0 }] },
    ])
    expect(req.variants.map(v => v.rule_set)).toEqual([{ id: 5 }, { id: 5 }])
    // dirty but not shared: update without a choice
    const solo = emptyState({
      variants: [row({ rowKey: 'v:1', id: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5' })],
      ruleSets: { 'rs:5': { ...persistedRuleSet(5, 'RS', ['edit']), name: 'RS3' } },
      editOrigin: { 'rs:5': 'v:1' },
    })
    expect(buildAtomicSaveRequest(solo, MASTER_INFO, { ruleSet: ['RS'], selector: [] }).rule_sets[0]).toMatchObject({ op: 'update', id: 5, name: 'RS3' })
  })

  it('[REQ-419/AC-6] validateVariantDrafts flags duplicate stage and selector', () => {
    const base = {
      ruleSets: { 'rs:1': persistedRuleSet(1, 'RS', []) },
      selectors: { 'ns:1': persistedSelector(1, 'N', []) },
    }
    // duplicate stage + duplicate non-null selector; multiple null selectors are fine
    const dup = emptyState({
      ...base,
      variants: [
        row({ rowKey: 'a', stageId: 1, ruleSetKey: 'rs:1', selectorKey: 'ns:1' }),
        row({ rowKey: 'b', stageId: 1, ruleSetKey: 'rs:1', selectorKey: null }),
        row({ rowKey: 'c', stageId: 2, ruleSetKey: 'rs:1', selectorKey: 'ns:1' }),
        row({ rowKey: 'd', stageId: 3, ruleSetKey: 'rs:1', selectorKey: null }),
        row({ rowKey: 'e', stageId: 4, ruleSetKey: 'rs:1', selectorKey: null }),
      ],
    })
    const r1 = validateVariantDrafts(dup, ['RS'], ['N'])
    expect(Object.keys(r1).sort()).toEqual(['a', 'b', 'c'])
    expect(r1.a.length).toBe(2)
    expect(r1.b.length).toBe(1)
    expect(r1.c.length).toBe(1)
    // rule set not chosen
    const noRs = emptyState({ ...base, variants: [row({ rowKey: 'a', stageId: 1, ruleSetKey: null })] })
    expect(validateVariantDrafts(noRs, ['RS'], ['N']).a.length).toBe(1)
    // empty and duplicate names
    const names = emptyState({
      ruleSets: {
        'rs:new:1': { key: 'rs:new:1', id: null, name: '  ', entries: [], saved: null, referencedRoles: [] },
        'rs:new:2': { key: 'rs:new:2', id: null, name: 'RS', entries: [], saved: null, referencedRoles: [] },
        'rs:new:3': { key: 'rs:new:3', id: null, name: 'Same', entries: [], saved: null, referencedRoles: [] },
        'rs:new:4': { key: 'rs:new:4', id: null, name: 'Same', entries: [], saved: null, referencedRoles: [] },
        'rs:1': persistedRuleSet(1, 'RS', []),
      },
      variants: [
        row({ rowKey: 'a', stageId: 1, ruleSetKey: 'rs:new:1' }),
        row({ rowKey: 'b', stageId: 2, ruleSetKey: 'rs:new:2' }),
        row({ rowKey: 'c', stageId: 3, ruleSetKey: 'rs:new:3' }),
        row({ rowKey: 'd', stageId: 4, ruleSetKey: 'rs:new:4' }),
        row({ rowKey: 'e', stageId: 5, ruleSetKey: 'rs:1' }),
      ],
    })
    const r2 = validateVariantDrafts(names, ['RS'], [])
    expect(Object.keys(r2).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('[REQ-419/AC-6] mapServerValidationErrors maps 422 rows', () => {
    const body = {
      detail: {
        code: 'MASTER_SAVE_VALIDATION_FAILED',
        errors: [
          { scope: 'variant', index: 0, ref: null, row_key: 'new:1', field: 'stage_id', message: 'dup stage' },
          { scope: 'variant', index: 1, ref: null, row_key: 'new:1', field: 'selector', message: 'dup selector' },
          { scope: 'rule_set', index: 0, ref: 'rs:new:1', row_key: null, field: 'name', message: 'name taken' },
        ],
      },
    }
    const mapped = mapServerValidationErrors(new Error(`API error 422: ${JSON.stringify(body)}`))
    expect(mapped).toEqual({ rows: { 'new:1': ['dup stage', 'dup selector'] }, general: ['name taken'] })
    expect(mapServerValidationErrors(new Error('API error 500: boom'))).toBeNull()
    expect(mapServerValidationErrors(new Error('API error 422: not json'))).toBeNull()
    expect(mapServerValidationErrors(new Error(`API error 422: ${JSON.stringify({ detail: { code: 'OTHER', errors: [] } })}`))).toBeNull()
    expect(mapServerValidationErrors(new Error(`API error 422: ${JSON.stringify({ detail: 'x' })}`))).toBeNull()
    expect(mapServerValidationErrors('string')).toBeNull()
    expect(mapServerValidationErrors(undefined)).toBeNull()
  })

  it('[REQ-419/AC-9] buildScanPreviewRequest serializes unsaved draft', () => {
    const state = emptyState({
      variants: [
        row({ rowKey: 'new:1', id: null, stageId: 2, stageSortOrder: 2, role: 'draft-role', ruleSetKey: 'rs:new:1', selectorKey: 'ns:1' }),
        row({ rowKey: 'v:1', id: 1, stageId: 1, stageSortOrder: 1, role: 'r1', savedRole: 'r1', isEnabled: false, ruleSetKey: 'rs:1', selectorKey: null }),
      ],
      ruleSets: {
        'rs:new:1': { key: 'rs:new:1', id: null, name: 'N', entries: [{ class_type: 'B', param_name: 'b', priority: 2 }, { class_type: 'A', param_name: 'a', priority: 1 }], saved: null, referencedRoles: [] },
        'rs:1': persistedRuleSet(1, 'RS', ['r1']),
      },
      selectors: {
        'ns:1': { ...persistedSelector(1, 'N', []), patterns: [{ pattern: 'p2', match_type: 'contains', priority: 5 }, { pattern: 'p1', match_type: 'exact', priority: 3 }] },
      },
    })
    expect(buildScanPreviewRequest(state, 42)).toEqual({
      workflow_id: 42,
      variants: [
        { client_key: 'v:1', variant_id: 1, stage_id: 1, role: 'r1', is_enabled: false, entries: [{ class_type: 'A', param_name: 'p', priority: 0 }], patterns: null },
        {
          client_key: 'new:1', variant_id: null, stage_id: 2, role: 'draft-role', is_enabled: true,
          entries: [{ class_type: 'A', param_name: 'a', priority: 1 }, { class_type: 'B', param_name: 'b', priority: 2 }],
          patterns: [{ pattern: 'p1', match_type: 'exact', priority: 3 }, { pattern: 'p2', match_type: 'contains', priority: 5 }],
        },
      ],
    })
  })
})

describe('mappingMastersApi atomic save / scan preview', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('[REQ-419/AC-12] [REQ-419/AC-5] api client posts atomic-save and scan-preview bodies', async () => {
    const edited = { ...persistedRuleSet(5, 'RS', ['edit', 'other']), name: 'RS2' }
    const sel: SelectorDraft = { key: 'ns:new:2', id: null, name: 'Sel', patterns: [], saved: null, referencedRoles: [] }
    const state = emptyState({
      variants: [
        row({ rowKey: 'v:1', id: 1, stageId: 1, role: 'edit', savedRole: 'edit', ruleSetKey: 'rs:5', selectorKey: 'ns:new:2' }),
        row({ rowKey: 'v:2', id: 2, stageId: 2, stageSortOrder: 1, role: 'other', savedRole: 'other', ruleSetKey: 'rs:5' }),
      ],
      ruleSets: { 'rs:5': edited },
      selectors: { 'ns:new:2': sel },
      editOrigin: { 'rs:5': 'v:1' },
      choices: { 'rs:5': 'duplicate_for_variant' },
    })
    const saveReq = buildAtomicSaveRequest(state, MASTER_INFO, { ruleSet: ['RS'], selector: [] })
    const previewReq = buildScanPreviewRequest(state, 7)

    const seen: { path: string; method: string; body: unknown }[] = []
    server.use(
      http.post('/api/mapping-masters/:id/atomic-save', async ({ request, params }) => {
        seen.push({ path: `/mapping-masters/${params.id}/atomic-save`, method: request.method, body: await request.json() })
        return HttpResponse.json({ id: 3 })
      }),
      http.post('/api/mapping-masters/scan-preview', async ({ request }) => {
        seen.push({ path: '/mapping-masters/scan-preview', method: request.method, body: await request.json() })
        return HttpResponse.json({ workflow_id: 7, results: [] })
      }),
    )
    const saved = await mappingMastersApi.atomicSave(3, saveReq)
    const preview = await mappingMastersApi.scanPreview(previewReq)
    expect(saved.id).toBe(3)
    expect(preview.workflow_id).toBe(7)
    expect(seen).toHaveLength(2)
    expect(seen[0].path).toBe('/mapping-masters/3/atomic-save')
    expect(seen[0].method).toBe('POST')
    const body = seen[0].body as MasterAtomicSaveRequest
    expect(body.master).toEqual(MASTER_INFO)
    expect(body.variants.map(v => v.row_key)).toEqual(['v:1', 'v:2'])
    expect(body.variants.map(v => v.rule_set)).toEqual([{ ref: 'rs:5:copy' }, { id: 5 }])
    expect(body.variants.map(v => v.selector)).toEqual([{ ref: 'ns:new:2' }, null])
    expect(body.rule_sets).toHaveLength(1)
    expect(body.rule_sets[0]).toMatchObject({ ref: 'rs:5:copy', op: 'create', id: null, name: 'RS2 (edit)' })
    expect(body.selectors).toHaveLength(1)
    expect(seen[1].path).toBe('/mapping-masters/scan-preview')
    expect(seen[1].body).toEqual(previewReq)
  })
})
