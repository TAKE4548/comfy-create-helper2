import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Layers } from 'lucide-react'
import { Modal } from './common/Modal'
import { stageMastersApi } from '../api/domains/stageMasters'
import { mappingGroupsApi } from '../api/domains/mappingGroups'
import { bindingRulesApi } from '../api/domains/bindingRules'
import { nodeSelectorsApi } from '../api/domains/nodeSelectors'
import { ScanPreviewPanel } from './mappingMaster/ScanPreviewPanel'
import { VariantRow } from './mappingMaster/VariantRow'
import { RuleSetEditor, SelectorEditor } from './mappingMaster/DefinitionEditors'
import { SharedDefinitionChoice } from './mappingMaster/SharedDefinitionChoice'
import {
  buildAtomicSaveRequest,
  buildMasterDraft,
  buildScanPreviewRequest,
  mapServerValidationErrors,
  pendingSharedChoices,
  sortVariantDrafts,
  validateVariantDrafts,
  type DefinitionKind,
  type MasterDraftState,
  type RuleSetDraft,
  type SelectorDraft,
  type SharedChoice,
  type VariantDraft,
} from './mappingMaster/variantDraft'
import type {
  MappingMasterV2,
  MappingMasterV2Create,
  MappingGroupMaster,
  MasterAtomicSaveRequest,
  StageMaster,
  ParamTypeMaster,
  BindingRuleSet,
  NodeSelector,
} from '../api/types'

export interface MappingMasterEditModalProps {
  isOpen: boolean
  onClose: () => void
  master: MappingMasterV2 | null
  groups?: MappingGroupMaster[]
  stages?: StageMaster[]
  paramTypeMasters?: ParamTypeMaster[]
  bindingRuleSets?: BindingRuleSet[]
  nodeSelectors?: NodeSelector[]
  onSave: (data: MappingMasterV2Create | MasterAtomicSaveRequest) => Promise<void> | void
  isPending?: boolean
}

const DEFAULT_INPUT_TYPES = [
  { id: 'textarea', name: 'textarea' },
  { id: 'int', name: 'int' },
  { id: 'float', name: 'float' },
  { id: 'seed', name: 'Seed (ランダム / 固定)' },
  { id: 'select', name: 'select' },
  { id: 'lora_stack', name: 'lora_stack' },
  { id: 'select_sampler', name: 'select_sampler' },
  { id: 'select_scheduler', name: 'select_scheduler' },
  { id: 'boolean', name: 'boolean' },
]

const EMPTY_GROUPS: MappingGroupMaster[] = []
const EMPTY_STAGES: StageMaster[] = []
const EMPTY_RULE_SETS: BindingRuleSet[] = []
const EMPTY_SELECTORS: NodeSelector[] = []

const FIELD =
  'w-full min-w-0 min-h-[44px] md:min-h-0 touch-manipulation bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none focus:border-[#7C6FDD]'
const SECONDARY_BTN =
  'min-h-[44px] md:min-h-0 touch-manipulation px-3 py-2 text-xs text-zinc-200 rounded-lg border border-zinc-700 hover:text-white'
const SAVE_FAILED_MESSAGE = '保存に失敗しました。変更は保存されていません'

interface EditingTarget {
  kind: DefinitionKind
  defKey: string
  rowKey: string
}

interface ChoicePanelState {
  kind: DefinitionKind
  defKey: string
  otherRoles: string[]
}

function mergeErrors(...sources: Array<Record<string, string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const src of sources) {
    for (const [k, list] of Object.entries(src)) {
      if (list.length === 0) continue
      out[k] = [...(out[k] ?? []), ...list]
    }
  }
  return out
}

// Blank definition content that the shared validator does not cover.
function blankContentErrors(state: MasterDraftState): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const add = (rowKey: string, msg: string) => {
    errors[rowKey] = [...(errors[rowKey] ?? []), msg]
  }
  for (const v of state.variants) {
    const rs = v.ruleSetKey !== null ? state.ruleSets[v.ruleSetKey] : undefined
    if (rs && rs.entries.some((e) => !e.class_type.trim() || !e.param_name.trim())) {
      add(v.rowKey, 'RuleSetのEntryにclass_typeとparam_nameを入力してください')
    }
    const ns = v.selectorKey !== null ? state.selectors[v.selectorKey] : undefined
    if (ns && ns.patterns.some((p) => !p.pattern.trim())) {
      add(v.rowKey, 'NodeSelectorのパターン文字列を入力してください')
    }
  }
  return errors
}

export function MappingMasterEditModal({
  isOpen,
  onClose,
  master,
  groups: propGroups,
  stages: propStages,
  paramTypeMasters = [],
  bindingRuleSets: propRuleSets,
  nodeSelectors: propNodeSelectors,
  onSave,
  isPending = false,
}: MappingMasterEditModalProps) {
  const { data: fetchedGroups } = useQuery({
    queryKey: ['mapping-groups'],
    queryFn: () => mappingGroupsApi.list(true),
    enabled: isOpen && !propGroups,
  })
  const { data: fetchedStages } = useQuery({
    queryKey: ['stage-masters'],
    queryFn: () => stageMastersApi.list(true),
    enabled: isOpen && !propStages,
  })
  const { data: fetchedRuleSets } = useQuery({
    queryKey: ['binding-rules'],
    queryFn: () => bindingRulesApi.list(),
    enabled: isOpen && !!master && !propRuleSets,
  })
  const { data: fetchedNodeSelectors } = useQuery({
    queryKey: ['node-selectors'],
    queryFn: () => nodeSelectorsApi.list(),
    enabled: isOpen && !!master && !propNodeSelectors,
  })

  const groups = propGroups ?? fetchedGroups ?? EMPTY_GROUPS
  const stages = propStages ?? fetchedStages ?? EMPTY_STAGES
  const ruleSetsSource = propRuleSets ?? fetchedRuleSets ?? EMPTY_RULE_SETS
  const selectorsSource = propNodeSelectors ?? fetchedNodeSelectors ?? EMPTY_SELECTORS

  // Master value fields
  const [name, setName] = useState('')
  const [paramName, setParamName] = useState('')
  const [initialClassType, setInitialClassType] = useState('')
  const [inputType, setInputType] = useState('textarea')
  const [defaultEnabled, setDefaultEnabled] = useState(true)
  const [groupId, setGroupId] = useState<number | null>(null)

  // Edit-mode draft
  const [draft, setDraft] = useState<MasterDraftState | null>(null)
  const touchedRef = useRef(false)
  const seqRef = useRef(1)
  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const [choicePanel, setChoicePanel] = useState<ChoicePanelState | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [serverRows, setServerRows] = useState<Record<string, string[]>>({})
  const [generalErrors, setGeneralErrors] = useState<string[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset the form whenever the dialog opens or the target master changes.
  useEffect(() => {
    if (!isOpen) return
    touchedRef.current = false
    setEditing(null)
    setChoicePanel(null)
    setSubmitted(false)
    setServerRows({})
    setGeneralErrors([])
    setSaveError(null)
    if (master) {
      setName(master.name || master.display_name || '')
      setParamName(master.param_name || '')
      setInputType(master.input_type || 'textarea')
      setDefaultEnabled(master.default_enabled ?? true)
      setGroupId(master.group_id ?? null)
    } else {
      setName('')
      setParamName('')
      setInitialClassType('')
      setInputType('textarea')
      setDefaultEnabled(true)
      setGroupId(null)
      setDraft(null)
    }
  }, [isOpen, master])

  useEffect(() => {
    if (isOpen && !master && groupId === null && groups.length > 0) setGroupId(groups[0].id)
  }, [isOpen, master, groupId, groups])

  // (Re)build the draft from server data until the user starts editing it.
  useEffect(() => {
    if (!isOpen || !master || touchedRef.current) return
    setDraft(buildMasterDraft(master, stages, ruleSetsSource, selectorsSource))
  }, [isOpen, master, stages, ruleSetsSource, selectorsSource])

  const stageOptions = useMemo(() => {
    if (stages.length > 0) return stages.map((s) => ({ id: s.id, name: s.name }))
    const seen = new Map<number, string>()
    for (const v of master?.variants ?? []) seen.set(v.stage_id, v.stage_name)
    return [...seen.entries()].map(([id, n]) => ({ id, name: n }))
  }, [stages, master])

  const commit = useCallback((next: MasterDraftState) => {
    touchedRef.current = true
    setServerRows({})
    setDraft(next)
  }, [])

  const existingNames = useMemo(
    () => ({ ruleSet: ruleSetsSource.map((r) => r.name), selector: selectorsSource.map((s) => s.name) }),
    [ruleSetsSource, selectorsSource],
  )

  const computeErrors = useCallback(
    (st: MasterDraftState) =>
      mergeErrors(
        validateVariantDrafts(st, existingNames.ruleSet, existingNames.selector),
        blankContentErrors(st),
      ),
    [existingNames],
  )

  const localErrors = useMemo(() => (draft ? computeErrors(draft) : {}), [draft, computeErrors])
  const hasLocalErrors = Object.keys(localErrors).length > 0
  const rowErrors = useMemo(
    () => mergeErrors(submitted ? localErrors : {}, serverRows),
    [submitted, localErrors, serverRows],
  )

  const sortedVariants = useMemo(() => (draft ? sortVariantDrafts(draft.variants) : []), [draft])

  const updateVariant = (rowKey: string, patch: Partial<VariantDraft>) => {
    if (!draft) return
    commit({ ...draft, variants: draft.variants.map((v) => (v.rowKey === rowKey ? { ...v, ...patch } : v)) })
  }

  const closeEditorFor = (rowKey: string, kind: DefinitionKind) => {
    setEditing((cur) => (cur && cur.rowKey === rowKey && cur.kind === kind ? null : cur))
  }

  const handleSelectRuleSet = (rowKey: string, key: string) => {
    if (key === '') return
    updateVariant(rowKey, { ruleSetKey: key })
    closeEditorFor(rowKey, 'ruleSet')
  }

  const handleSelectSelector = (rowKey: string, key: string | null) => {
    updateVariant(rowKey, { selectorKey: key })
    closeEditorFor(rowKey, 'selector')
  }

  const handleCreateRuleSet = (rowKey: string) => {
    if (!draft) return
    const key = `rs:new:${seqRef.current++}`
    const created: RuleSetDraft = {
      key,
      id: null,
      name: '',
      entries: [{ class_type: '', param_name: '', priority: 1 }],
      saved: null,
      referencedRoles: [],
    }
    commit({
      ...draft,
      ruleSets: { ...draft.ruleSets, [key]: created },
      variants: draft.variants.map((v) => (v.rowKey === rowKey ? { ...v, ruleSetKey: key } : v)),
    })
    setEditing({ kind: 'ruleSet', defKey: key, rowKey })
  }

  const handleCreateSelector = (rowKey: string) => {
    if (!draft) return
    const key = `ns:new:${seqRef.current++}`
    const created: SelectorDraft = {
      key,
      id: null,
      name: '',
      patterns: [{ pattern: '', match_type: 'contains', priority: 1 }],
      saved: null,
      referencedRoles: [],
    }
    commit({
      ...draft,
      selectors: { ...draft.selectors, [key]: created },
      variants: draft.variants.map((v) => (v.rowKey === rowKey ? { ...v, selectorKey: key } : v)),
    })
    setEditing({ kind: 'selector', defKey: key, rowKey })
  }

  const handleEdit = (kind: DefinitionKind, rowKey: string, defKey: string | null) => {
    if (!draft || defKey === null) return
    const def = kind === 'ruleSet' ? draft.ruleSets[defKey] : draft.selectors[defKey]
    if (!def) return
    // Remember which row the edit started from (used for "duplicate for this variant").
    if (draft.editOrigin[defKey] === undefined) {
      touchedRef.current = true
      setDraft({ ...draft, editOrigin: { ...draft.editOrigin, [defKey]: rowKey } })
    }
    setEditing({ kind, defKey, rowKey })
  }

  const handleAddVariant = () => {
    if (!draft || !master || stages.length === 0) return
    const stage = stages[0]
    const n = seqRef.current++
    const firstRuleSet = Object.keys(draft.ruleSets)[0] ?? null
    const row: VariantDraft = {
      rowKey: `new:${n}`,
      id: null,
      stageId: stage.id,
      stageKey: stage.key,
      stageName: stage.name,
      stageSortOrder: stage.sort_order,
      role: `${master.base_key}${stage.suffix}`,
      isEnabled: true,
      ruleSetKey: firstRuleSet,
      selectorKey: null,
      savedRole: null,
    }
    commit({ ...draft, variants: [...draft.variants, row] })
  }

  const handleSelectStage = (rowKey: string, stageId: number) => {
    const stage = stages.find((s) => s.id === stageId)
    if (!stage || !master) return
    updateVariant(rowKey, {
      stageId: stage.id,
      stageKey: stage.key,
      stageName: stage.name,
      stageSortOrder: stage.sort_order,
      role: `${master.base_key}${stage.suffix}`,
    })
  }

  const handleRemoveNewVariant = (rowKey: string) => {
    if (!draft) return
    commit({ ...draft, variants: draft.variants.filter((v) => v.rowKey !== rowKey) })
    setEditing((cur) => (cur && cur.rowKey === rowKey ? null : cur))
  }

  const attemptSave = async (st: MasterDraftState) => {
    setSubmitted(true)
    setSaveError(null)
    setGeneralErrors([])
    if (Object.keys(computeErrors(st)).length > 0) {
      setChoicePanel(null)
      return
    }
    const pending = pendingSharedChoices(st)
    if (pending.length > 0) {
      const p = pending[0]
      setChoicePanel({ kind: p.kind, defKey: p.defKey, otherRoles: p.otherRoles })
      return
    }
    setChoicePanel(null)
    const request = buildAtomicSaveRequest(
      st,
      { name: name.trim(), input_type: inputType, group_id: groupId, default_enabled: defaultEnabled },
      existingNames,
    )
    setSaving(true)
    try {
      await onSave(request)
      touchedRef.current = false
    } catch (err) {
      const mapped = mapServerValidationErrors(err)
      if (mapped) {
        setServerRows(mapped.rows)
        setGeneralErrors(mapped.general)
      } else {
        setSaveError(SAVE_FAILED_MESSAGE)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleChoose = (choice: SharedChoice) => {
    if (!draft || !choicePanel) return
    const next: MasterDraftState = { ...draft, choices: { ...draft.choices, [choicePanel.defKey]: choice } }
    touchedRef.current = true
    setDraft(next)
    void attemptSave(next)
  }

  const handleCancelChoice = useCallback(() => setChoicePanel(null), [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || saving) return
    if (master) {
      if (draft) await attemptSave(draft)
      return
    }
    const trimmedParamName = paramName.trim()
    const trimmedClassType = initialClassType.trim()
    if (!trimmedParamName || !trimmedClassType || trimmedClassType.includes(',')) return
    const payload: MappingMasterV2Create = {
      name: trimmedName,
      display_name: trimmedName,
      param_name: trimmedParamName,
      expected_class_types: [trimmedClassType],
      input_type: inputType,
      default_enabled: defaultEnabled,
      group_id: groupId,
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(payload)
    } catch {
      setSaveError(SAVE_FAILED_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const dialogTitle = master ? `マッピングマスター編集: ${master.name || master.display_name}` : '新規マッピングマスター作成'
  const ruleSetOptions = draft ? Object.values(draft.ruleSets).map((r) => ({ key: r.key, name: r.name })) : []
  const selectorOptions = draft ? Object.values(draft.selectors).map((s) => ({ key: s.key, name: s.name })) : []
  const rowLabels: Record<string, string> = {}
  for (const v of sortedVariants) rowLabels[v.rowKey] = `${v.stageName} / ${v.role}`
  const saveDisabled =
    !name.trim() || (!master && (!paramName.trim() || !initialClassType.trim() || initialClassType.includes(','))) || isPending || saving || (!!master && !draft)

  const renderEditor = (v: VariantDraft): React.ReactNode => {
    if (!draft || !editing || editing.rowKey !== v.rowKey) return null
    const close = () => setEditing(null)
    if (editing.kind === 'ruleSet') {
      const d = draft.ruleSets[editing.defKey]
      if (!d || v.ruleSetKey !== editing.defKey) return null
      return (
        <RuleSetEditor
          draft={d}
          onChange={(next) => commit({ ...draft, ruleSets: { ...draft.ruleSets, [next.key]: next } })}
          onClose={close}
        />
      )
    }
    const d = draft.selectors[editing.defKey]
    if (!d || v.selectorKey !== editing.defKey) return null
    return (
      <SelectorEditor
        draft={d}
        onChange={(next) => commit({ ...draft, selectors: { ...draft.selectors, [next.key]: next } })}
        onClose={close}
      />
    )
  }

  const choiceDefName = choicePanel
    ? (choicePanel.kind === 'ruleSet'
        ? draft?.ruleSets[choicePanel.defKey]?.name
        : draft?.selectors[choicePanel.defKey]?.name) ?? ''
    : ''

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      ariaLabel={dialogTitle}
      sheetMaxHeightClass="max-h-[85dvh]"
      closeOnEsc={!choicePanel}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-zinc-800 shrink-0 text-zinc-100">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="text-[#7C6FDD] shrink-0" size={20} />
          <h2 id="mapping-master-edit-title" className="text-base font-semibold break-words min-w-0">
            {dialogTitle}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation text-zinc-400 hover:text-white rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-6 text-zinc-100"
      >
        {(saveError || generalErrors.length > 0) && (
          <div className="space-y-1">
            {saveError && (
              <div role="alert" className="text-xs text-red-400 break-words">
                {saveError}
              </div>
            )}
            {generalErrors.map((m, i) => (
              <div key={i} role="alert" className="text-xs text-red-400 break-words">
                {m}
              </div>
            ))}
          </div>
        )}

        {/* Master value definition */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-zinc-300 tracking-wider">マスター値定義</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-xs text-zinc-400 mb-1">
                表示名 (Name) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例: Positive Prompt"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
              />
            </div>

            {!master && (
              <div className="min-w-0">
                <label className="block text-xs text-zinc-400 mb-1">
                  初期RuleSetのパラメータ名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: text, steps, cfg"
                  value={paramName}
                  onChange={(e) => setParamName(e.target.value)}
                  className={`${FIELD} font-mono`}
                />
              </div>
            )}

            {!master && (
              <div className="min-w-0">
                <label className="block text-xs text-zinc-400 mb-1">
                  初期RuleSetのクラス名 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: KSampler"
                  value={initialClassType}
                  onChange={(e) => setInitialClassType(e.target.value)}
                  className={`${FIELD} font-mono`}
                />
                {initialClassType.includes(',') && (
                  <p role="alert" className="mt-1 text-[11px] text-red-400 break-words">
                    クラス名は1つだけ入力してください（カンマは使えません）
                  </p>
                )}
                {!initialClassType.trim() && (
                  <p className="mt-1 text-[11px] text-zinc-500 break-words">
                    クラス名を入力してください（判定対象ノードの class_type）
                  </p>
                )}
              </div>
            )}

            <div className="min-w-0">
              <label className="block text-xs text-zinc-400 mb-1">入力型 (Input Type)</label>
              <select value={inputType} onChange={(e) => setInputType(e.target.value)} className={FIELD}>
                <optgroup label="標準型">
                  {DEFAULT_INPUT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
                {paramTypeMasters.length > 0 && (
                  <optgroup label="カスタム型">
                    {paramTypeMasters
                      .filter((pt) => pt.name !== 'seed')
                      .map((pt) => (
                        <option key={pt.id} value={pt.name}>
                          {pt.name} ({pt.widget_type})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="min-w-0">
              <label className="block text-xs text-zinc-400 mb-1">大カテゴリグループ</label>
              <select
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                className={FIELD}
              >
                <option value="">(グループなし)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.key})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-start gap-2 min-h-[44px] md:min-h-0 touch-manipulation text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={defaultEnabled}
              disabled={isPending}
              onChange={(e) => setDefaultEnabled(e.target.checked)}
              aria-label="新規マッピングで基本有効"
              className="mt-0.5 accent-[#7C6FDD]"
            />
            <span>
              新規マッピングで基本有効
              <span className="block text-[11px] text-zinc-500">既存のマッピングには影響しません。</span>
            </span>
          </label>
        </div>

        {!master && (
          <p className="text-xs text-zinc-400">保存後にステージ別Variantを編集できます</p>
        )}

        {master && draft && (
          <>
            <section className="space-y-3 min-w-0" aria-label="ステージ別Variant">
              <h3 className="text-xs font-semibold text-zinc-300 tracking-wider">ステージ別Variant</h3>
              {sortedVariants.map((v) => {
                const isNew = v.id === null
                return (
                  <div key={v.rowKey} className="space-y-1 min-w-0">
                    <VariantRow
                      variant={v}
                      ruleSet={v.ruleSetKey !== null ? (draft.ruleSets[v.ruleSetKey] ?? null) : null}
                      selector={v.selectorKey !== null ? (draft.selectors[v.selectorKey] ?? null) : null}
                      ruleSetOptions={ruleSetOptions}
                      selectorOptions={selectorOptions}
                      stageOptions={isNew ? stageOptions : undefined}
                      errors={rowErrors[v.rowKey] ?? []}
                      onToggleEnabled={() => updateVariant(v.rowKey, { isEnabled: !v.isEnabled })}
                      onSelectRuleSet={(key) => handleSelectRuleSet(v.rowKey, key)}
                      onSelectSelector={(key) => handleSelectSelector(v.rowKey, key)}
                      onCreateRuleSet={() => handleCreateRuleSet(v.rowKey)}
                      onCreateSelector={() => handleCreateSelector(v.rowKey)}
                      onEditRuleSet={() => handleEdit('ruleSet', v.rowKey, v.ruleSetKey)}
                      onEditSelector={() => handleEdit('selector', v.rowKey, v.selectorKey)}
                      onSelectStage={isNew ? (stageId) => handleSelectStage(v.rowKey, stageId) : undefined}
                      editingKind={editing && editing.rowKey === v.rowKey ? editing.kind : null}
                      editor={renderEditor(v)}
                    />
                    {isNew && (
                      <button
                        type="button"
                        onClick={() => handleRemoveNewVariant(v.rowKey)}
                        aria-label={`${v.stageName} の追加行を削除`}
                        className={`${SECONDARY_BTN} text-[11px]`}
                      >
                        追加行を削除
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={handleAddVariant}
                disabled={stages.length === 0}
                className={`${SECONDARY_BTN} disabled:opacity-50`}
              >
                Variantを追加
              </button>
            </section>

            <ScanPreviewPanel
              buildRequest={(wid) => (hasLocalErrors ? null : buildScanPreviewRequest(draft, wid))}
              rowLabels={rowLabels}
              disabledReason={hasLocalErrors ? '入力エラーがあるためプレビューできません' : null}
            />
          </>
        )}

        {choicePanel && (
          <SharedDefinitionChoice
            kind={choicePanel.kind}
            definitionName={choiceDefName}
            otherRoles={choicePanel.otherRoles}
            onChoose={handleChoose}
            onCancel={handleCancelChoice}
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] md:min-h-0 touch-manipulation px-4 py-2 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={saveDisabled}
            className="min-h-[44px] md:min-h-0 touch-manipulation px-5 py-2 text-xs bg-[#7C6FDD] text-white font-medium rounded-lg hover:bg-[#6d62cc] transition-colors disabled:opacity-50"
          >
            {isPending || saving ? '保存中...' : 'マスターを保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
