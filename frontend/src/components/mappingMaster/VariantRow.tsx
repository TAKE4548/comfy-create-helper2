import React from 'react'
import {
  sortedEntries,
  sortedPatterns,
  type DefinitionKind,
  type RuleSetDraft,
  type SelectorDraft,
  type VariantDraft,
} from './variantDraft'

export interface VariantRowProps {
  variant: VariantDraft
  ruleSet: RuleSetDraft | null
  selector: SelectorDraft | null
  ruleSetOptions: Array<{ key: string; name: string }>
  selectorOptions: Array<{ key: string; name: string }>
  stageOptions?: Array<{ id: number; name: string }>
  errors: string[]
  onToggleEnabled(): void
  onSelectRuleSet(key: string): void
  onSelectSelector(key: string | null): void
  onCreateRuleSet(): void
  onCreateSelector(): void
  onEditRuleSet(): void
  onEditSelector(): void
  onSelectStage?(stageId: number): void
  editingKind: DefinitionKind | null
  editor: React.ReactNode
}

const BTN = 'min-h-[44px] md:min-h-0 touch-manipulation'
const SELECT =
  'w-full min-w-0 min-h-[44px] md:min-h-0 touch-manipulation bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-[#7C6FDD]'
const SMALL_BTN = `${BTN} shrink-0 whitespace-nowrap px-3 text-[11px] text-zinc-200 rounded border border-zinc-700 hover:text-white`
const BADGE = 'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px]'

export function VariantRow(props: VariantRowProps) {
  const { variant: v, ruleSet, selector } = props
  const stage = v.stageName
  return (
    <div
      role="group"
      aria-label={`${stage} のVariant`}
      data-testid={`variant-row-${v.rowKey}`}
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-3 min-w-0"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        {props.stageOptions && props.onSelectStage ? (
          <select
            aria-label="Variantのステージ"
            value={v.stageId}
            onChange={(e) => props.onSelectStage?.(Number(e.target.value))}
            className={`${SELECT} basis-40 flex-1`}
          >
            {props.stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-semibold text-zinc-100 min-w-0 break-words">{stage}</span>
        )}
        <span
          data-testid="variant-role"
          className="text-[11px] font-mono text-zinc-300 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 break-all min-w-0"
        >
          {v.role}
        </span>
        <input
          type="checkbox"
          checked={v.isEnabled}
          onChange={props.onToggleEnabled}
          aria-label={`${stage} を有効化`}
          className="shrink-0 min-h-[24px] min-w-[24px] md:min-h-0 md:min-w-0 touch-manipulation accent-[#7C6FDD]"
        />
      </div>

      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <select
            aria-label={`${stage} のRuleSet`}
            value={v.ruleSetKey ?? ''}
            onChange={(e) => props.onSelectRuleSet(e.target.value)}
            className={`${SELECT} basis-48 flex-1`}
          >
            {v.ruleSetKey === null && <option value="">(RuleSetを選択)</option>}
            {props.ruleSetOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name || '(名称未入力)'}
              </option>
            ))}
          </select>
          {ruleSet && (
            <button
              type="button"
              aria-label={`${stage} のRuleSetを編集`}
              onClick={props.onEditRuleSet}
              disabled={props.editingKind === 'ruleSet'}
              className={`${SMALL_BTN} disabled:opacity-50`}
            >
              RuleSetを編集
            </button>
          )}
          <button
            type="button"
            aria-label={`${stage} のRuleSetを新規作成`}
            onClick={props.onCreateRuleSet}
            className={SMALL_BTN}
          >
            RuleSetを新規作成
          </button>
        </div>
        {ruleSet && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 min-w-0 list-none p-0" aria-label={`${stage} のEntry一覧`}>
            {sortedEntries(ruleSet.entries).map((e, i) => (
              <li
                key={i}
                data-testid="variant-entry"
                className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-200 min-w-0"
              >
                <span className="break-all min-w-0">
                  {e.class_type} × {e.param_name}
                </span>
                <span className={`${BADGE} bg-zinc-800 text-zinc-400`}>優先度 {e.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <select
            aria-label={`${stage} のNodeSelector`}
            value={v.selectorKey ?? ''}
            onChange={(e) => props.onSelectSelector(e.target.value === '' ? null : e.target.value)}
            className={`${SELECT} basis-48 flex-1`}
          >
            <option value="">セレクタなし</option>
            {props.selectorOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name || '(名称未入力)'}
              </option>
            ))}
          </select>
          {selector && (
            <button
              type="button"
              aria-label={`${stage} のNodeSelectorを編集`}
              onClick={props.onEditSelector}
              disabled={props.editingKind === 'selector'}
              className={`${SMALL_BTN} disabled:opacity-50`}
            >
              NodeSelectorを編集
            </button>
          )}
          <button
            type="button"
            aria-label={`${stage} のNodeSelectorを新規作成`}
            onClick={props.onCreateSelector}
            className={SMALL_BTN}
          >
            NodeSelectorを新規作成
          </button>
        </div>
        {selector ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5 min-w-0 list-none p-0" aria-label={`${stage} のパターン一覧`}>
            {sortedPatterns(selector.patterns).map((p, i) => (
              <li
                key={i}
                data-testid="variant-pattern"
                className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-200 min-w-0"
              >
                <span className="break-all min-w-0">{p.pattern}</span>
                <span className={`${BADGE} border border-zinc-600 text-zinc-300`}>{p.match_type}</span>
                <span className={`${BADGE} bg-zinc-800 text-zinc-400`}>優先度 {p.priority}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[11px] text-zinc-400">セレクタなし</div>
        )}
      </div>

      {props.editor}

      {props.errors.map((m, i) => (
        <div key={i} role="alert" className="text-[11px] text-red-400 break-words">
          {m}
        </div>
      ))}
    </div>
  )
}
