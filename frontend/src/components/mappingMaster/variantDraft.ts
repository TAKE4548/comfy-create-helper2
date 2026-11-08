import type {
  AtomicVariantItem,
  BindingRuleSet,
  DefinitionOp,
  DefinitionRef,
  MappingMasterV2,
  MasterAtomicSaveRequest,
  MasterSaveErrorItem,
  NodeSelector,
  ScanPreviewRequest,
  StageMaster,
} from '../../api/types'

export type DefinitionKind = 'ruleSet' | 'selector'
export interface EntryDraft { class_type: string; param_name: string; priority: number }
export interface PatternDraft { pattern: string; match_type: 'exact' | 'contains'; priority: number }
export interface RuleSetDraft { key: string; id: number | null; name: string; entries: EntryDraft[]; saved: { name: string; entries: EntryDraft[] } | null; referencedRoles: string[] }
export interface SelectorDraft { key: string; id: number | null; name: string; patterns: PatternDraft[]; saved: { name: string; patterns: PatternDraft[] } | null; referencedRoles: string[] }
export interface VariantDraft { rowKey: string; id: number | null; stageId: number; stageKey: string; stageName: string; stageSortOrder: number; role: string; isEnabled: boolean; ruleSetKey: string | null; selectorKey: string | null; savedRole: string | null }
export type SharedChoice = 'update_shared' | 'duplicate_for_variant'
export interface MasterDraftState { variants: VariantDraft[]; ruleSets: Record<string, RuleSetDraft>; selectors: Record<string, SelectorDraft>; editOrigin: Record<string, string>; choices: Record<string, SharedChoice> }

export const STAGE_LABELS: Record<'exact' | 'contains' | 'no_selector', string> = {
  exact: '完全一致',
  contains: '部分一致',
  no_selector: 'セレクタなし',
}

function stableSortByPriority<T extends { priority: number }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.priority - b.item.priority || a.index - b.index)
    .map(x => x.item)
}

export function sortedEntries(e: EntryDraft[]): EntryDraft[] {
  return stableSortByPriority(e)
}

export function sortedPatterns(p: PatternDraft[]): PatternDraft[] {
  return stableSortByPriority(p)
}

export function sortVariantDrafts(v: VariantDraft[]): VariantDraft[] {
  return [...v].sort((a, b) =>
    a.stageSortOrder - b.stageSortOrder
    || a.stageId - b.stageId
    || (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0))
}

export function buildMasterDraft(
  master: MappingMasterV2,
  stages: StageMaster[],
  ruleSets: BindingRuleSet[],
  selectors: NodeSelector[],
): MasterDraftState {
  const stageMap = new Map(stages.map(st => [st.id, st]))
  const variants: VariantDraft[] = master.variants.map(v => {
    const role = v.role ?? v.computed_role
    const st = stageMap.get(v.stage_id)
    return {
      rowKey: `v:${v.id}`,
      id: v.id,
      stageId: v.stage_id,
      stageKey: st?.key ?? v.stage_key,
      stageName: st?.name ?? v.stage_name,
      stageSortOrder: st?.sort_order ?? 0,
      role,
      isEnabled: v.is_enabled,
      ruleSetKey: v.binding_rule_set_id != null ? `rs:${v.binding_rule_set_id}` : null,
      selectorKey: v.node_selector_id != null ? `ns:${v.node_selector_id}` : null,
      savedRole: role,
    }
  })
  const rsMap: Record<string, RuleSetDraft> = {}
  for (const r of ruleSets) {
    const entries = r.entries.map(e => ({ class_type: e.class_type, param_name: e.param_name, priority: e.priority }))
    rsMap[`rs:${r.id}`] = {
      key: `rs:${r.id}`,
      id: r.id,
      name: r.name,
      entries,
      saved: { name: r.name, entries: entries.map(e => ({ ...e })) },
      referencedRoles: [...(r.referenced_roles ?? [])],
    }
  }
  const nsMap: Record<string, SelectorDraft> = {}
  for (const n of selectors) {
    const patterns = n.patterns.map(p => ({
      pattern: p.pattern,
      match_type: (p.match_type === 'contains' ? 'contains' : 'exact') as 'exact' | 'contains',
      priority: p.priority,
    }))
    nsMap[`ns:${n.id}`] = {
      key: `ns:${n.id}`,
      id: n.id,
      name: n.name,
      patterns,
      saved: { name: n.name, patterns: patterns.map(p => ({ ...p })) },
      referencedRoles: [...(n.referenced_roles ?? [])],
    }
  }
  return { variants: sortVariantDrafts(variants), ruleSets: rsMap, selectors: nsMap, editOrigin: {}, choices: {} }
}

function sameList<T extends object>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]))
}

function isRuleSetDraft(d: RuleSetDraft | SelectorDraft): d is RuleSetDraft {
  return 'entries' in d
}

export function isDefinitionDirty(d: RuleSetDraft | SelectorDraft): boolean {
  if (d.saved === null) return false
  if (d.name !== d.saved.name) return true
  if (isRuleSetDraft(d)) {
    return !sameList(d.entries, (d.saved as { entries: EntryDraft[] }).entries)
  }
  return !sameList(d.patterns, (d.saved as { patterns: PatternDraft[] }).patterns)
}

function refKeyOf(v: VariantDraft, kind: DefinitionKind): string | null {
  return kind === 'ruleSet' ? v.ruleSetKey : v.selectorKey
}

function getDef(state: MasterDraftState, kind: DefinitionKind, defKey: string): RuleSetDraft | SelectorDraft | undefined {
  return kind === 'ruleSet' ? state.ruleSets[defKey] : state.selectors[defKey]
}

export function findOtherReferrers(state: MasterDraftState, kind: DefinitionKind, defKey: string): string[] {
  const def = getDef(state, kind, defKey)
  const out = new Set<string>()
  if (def) {
    const savedRoles = new Set(
      state.variants.filter(v => v.id !== null && v.savedRole !== null).map(v => v.savedRole as string),
    )
    for (const r of def.referencedRoles) {
      if (!savedRoles.has(r)) out.add(r)
    }
  }
  const origin = state.editOrigin[defKey]
  for (const v of state.variants) {
    if (v.rowKey !== origin && refKeyOf(v, kind) === defKey) out.add(v.role)
  }
  return [...out].sort()
}

export function pendingSharedChoices(
  state: MasterDraftState,
): Array<{ kind: DefinitionKind; defKey: string; originRowKey: string; otherRoles: string[] }> {
  const out: Array<{ kind: DefinitionKind; defKey: string; originRowKey: string; otherRoles: string[] }> = []
  const scan = (kind: DefinitionKind, defs: Record<string, RuleSetDraft | SelectorDraft>) => {
    for (const [defKey, d] of Object.entries(defs)) {
      if (d.id === null || !isDefinitionDirty(d) || state.choices[defKey] !== undefined) continue
      const others = findOtherReferrers(state, kind, defKey)
      if (others.length === 0) continue
      out.push({ kind, defKey, originRowKey: state.editOrigin[defKey] ?? '', otherRoles: others })
    }
  }
  scan('ruleSet', state.ruleSets)
  scan('selector', state.selectors)
  return out
}

export function validateVariantDrafts(
  state: MasterDraftState,
  knownRuleSetNames: string[],
  knownSelectorNames: string[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const add = (rowKey: string, msg: string) => {
    if (!errors[rowKey]) errors[rowKey] = []
    errors[rowKey].push(msg)
  }

  const stageCount = new Map<number, number>()
  const selCount = new Map<string, number>()
  for (const v of state.variants) {
    stageCount.set(v.stageId, (stageCount.get(v.stageId) ?? 0) + 1)
    if (v.selectorKey !== null) selCount.set(v.selectorKey, (selCount.get(v.selectorKey) ?? 0) + 1)
  }
  for (const v of state.variants) {
    if ((stageCount.get(v.stageId) ?? 0) > 1) add(v.rowKey, `ステージ「${v.stageName}」が重複しています`)
    if (v.selectorKey !== null && (selCount.get(v.selectorKey) ?? 0) > 1) {
      add(v.rowKey, '同じノードセレクタが複数の行で使われています')
    }
    if (v.ruleSetKey === null) add(v.rowKey, '紐付けルールセットを選択してください')
  }

  const checkNames = (
    kind: DefinitionKind,
    defs: Record<string, RuleSetDraft | SelectorDraft>,
    known: string[],
    label: string,
  ) => {
    const cache = new Map<string, string | null>()
    const problem = (d: RuleSetDraft | SelectorDraft): string | null => {
      const name = d.name.trim()
      if (name === '') return `${label}の名前を入力してください`
      // Unchanged persisted definitions are exempt; only new or renamed ones can collide.
      const renamedOrNew = d.saved === null || d.name !== d.saved.name
      if (renamedOrNew) {
        if (known.some(k => k.trim() === name)) return `${label}名「${name}」は既に使われています`
        const clash = Object.values(defs).some(o => o.key !== d.key && o.name.trim() === name)
        if (clash) return `${label}名「${name}」が重複しています`
      }
      return null
    }
    for (const v of state.variants) {
      const key = refKeyOf(v, kind)
      if (key === null) continue
      const d = defs[key]
      if (!d) continue
      if (!cache.has(key)) cache.set(key, problem(d))
      const msg = cache.get(key)
      if (msg) add(v.rowKey, msg)
    }
  }
  checkNames('ruleSet', state.ruleSets, knownRuleSetNames, 'ルールセット')
  checkNames('selector', state.selectors, knownSelectorNames, 'ノードセレクタ')
  return errors
}

export function generateCopyName(baseName: string, role: string, existingNames: string[]): string {
  const base = `${baseName} (${role})`
  const used = new Set(existingNames)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export function buildAtomicSaveRequest(
  state: MasterDraftState,
  master: { name: string; input_type: string; group_id: number | null; default_enabled: boolean },
  existingNames: { ruleSet: string[]; selector: string[] },
): MasterAtomicSaveRequest {
  const variants = sortVariantDrafts(state.variants)
  const ruleSetOps: DefinitionOp[] = []
  const selectorOps: DefinitionOp[] = []
  const usedNames = { ruleSet: [...existingNames.ruleSet], selector: [...existingNames.selector] }
  // "<defKey>|<rowKey>" -> ref for rows that must point at a new or copied definition
  const rowRefs: Record<DefinitionKind, Map<string, DefinitionRef>> = { ruleSet: new Map(), selector: new Map() }
  const processed = { ruleSet: new Set<string>(), selector: new Set<string>() }

  const content = (x: RuleSetDraft | SelectorDraft): Pick<DefinitionOp, 'entries' | 'patterns'> =>
    isRuleSetDraft(x)
      ? { entries: sortedEntries(x.entries).map(e => ({ ...e })) }
      : { patterns: sortedPatterns(x.patterns).map(p => ({ ...p })) }

  const process = (kind: DefinitionKind, defKey: string) => {
    if (processed[kind].has(defKey)) return
    processed[kind].add(defKey)
    const d = getDef(state, kind, defKey)
    if (!d) return
    const ops = kind === 'ruleSet' ? ruleSetOps : selectorOps

    if (d.id === null) {
      ops.push({ ref: defKey, op: 'create', id: null, name: d.name, ...content(d) })
      for (const v of variants) {
        if (refKeyOf(v, kind) === defKey) rowRefs[kind].set(`${defKey}|${v.rowKey}`, { ref: defKey })
      }
      return
    }
    if (!isDefinitionDirty(d)) return
    const others = findOtherReferrers(state, kind, defKey)
    if (others.length === 0 || state.choices[defKey] === 'update_shared') {
      ops.push({ ref: defKey, op: 'update', id: d.id, name: d.name, ...content(d) })
      return
    }
    if (state.choices[defKey] === 'duplicate_for_variant') {
      const originKey = state.editOrigin[defKey]
      const origin = variants.find(v => v.rowKey === originKey && refKeyOf(v, kind) === defKey)
      if (!origin) return
      const copyName = generateCopyName(d.name, origin.role, usedNames[kind])
      usedNames[kind].push(copyName)
      const copyRef = `${defKey}:copy`
      ops.push({ ref: copyRef, op: 'create', id: null, name: copyName, ...content(d) })
      rowRefs[kind].set(`${defKey}|${origin.rowKey}`, { ref: copyRef })
    }
  }

  for (const v of variants) {
    if (v.ruleSetKey !== null) process('ruleSet', v.ruleSetKey)
    if (v.selectorKey !== null) process('selector', v.selectorKey)
  }

  const resolveRef = (kind: DefinitionKind, v: VariantDraft, defKey: string): DefinitionRef => {
    const override = rowRefs[kind].get(`${defKey}|${v.rowKey}`)
    if (override) return override
    const d = getDef(state, kind, defKey)
    if (d && d.id !== null) return { id: d.id }
    return { ref: defKey }
  }

  const items: AtomicVariantItem[] = variants.map(v => {
    if (v.ruleSetKey === null) throw new Error(`rule set is not selected for ${v.rowKey}`)
    return {
      row_key: v.rowKey,
      id: v.id,
      stage_id: v.stageId,
      is_enabled: v.isEnabled,
      rule_set: resolveRef('ruleSet', v, v.ruleSetKey),
      selector: v.selectorKey === null ? null : resolveRef('selector', v, v.selectorKey),
    }
  })

  return { master: { ...master }, rule_sets: ruleSetOps, selectors: selectorOps, variants: items }
}

export function buildScanPreviewRequest(state: MasterDraftState, workflowId: number): ScanPreviewRequest {
  return {
    workflow_id: workflowId,
    variants: sortVariantDrafts(state.variants).map(v => {
      const rs = v.ruleSetKey !== null ? state.ruleSets[v.ruleSetKey] : undefined
      const ns = v.selectorKey !== null ? state.selectors[v.selectorKey] : undefined
      return {
        client_key: v.rowKey,
        variant_id: v.id,
        stage_id: v.stageId,
        role: v.role,
        is_enabled: v.isEnabled,
        entries: rs ? sortedEntries(rs.entries).map(e => ({ ...e })) : [],
        patterns: v.selectorKey === null ? null : ns ? sortedPatterns(ns.patterns).map(p => ({ ...p })) : [],
      }
    }),
  }
}

export function mapServerValidationErrors(err: unknown): { rows: Record<string, string[]>; general: string[] } | null {
  if (!(err instanceof Error)) return null
  const m = /^API error 422: ([\s\S]*)$/.exec(err.message)
  if (!m) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return null
  }
  const detail = (parsed as { detail?: { code?: unknown; errors?: unknown } } | null)?.detail
  if (!detail || typeof detail !== 'object' || detail.code !== 'MASTER_SAVE_VALIDATION_FAILED' || !Array.isArray(detail.errors)) {
    return null
  }
  const rows: Record<string, string[]> = {}
  const general: string[] = []
  for (const item of detail.errors as MasterSaveErrorItem[]) {
    const message = String(item?.message ?? '')
    if (item?.row_key) {
      if (!rows[item.row_key]) rows[item.row_key] = []
      rows[item.row_key].push(message)
    } else {
      general.push(message)
    }
  }
  return { rows, general }
}
