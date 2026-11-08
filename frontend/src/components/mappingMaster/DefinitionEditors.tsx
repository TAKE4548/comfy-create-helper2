import React from 'react'
import { X } from 'lucide-react'
import type { EntryDraft, PatternDraft, RuleSetDraft, SelectorDraft } from './variantDraft'

const BTN = 'min-h-[44px] md:min-h-0 touch-manipulation'
const INPUT =
  'w-full min-w-0 min-h-[44px] md:min-h-0 touch-manipulation bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-[#7C6FDD]'
const ICON_BTN = 'relative before:absolute before:-inset-2 touch-manipulation shrink-0 text-zinc-400 hover:text-white'

// Enter inside a definition input must not submit the surrounding master form.
const blockEnterSubmit = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
}

function num(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function EditorFrame(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-[#7C6FDD]/40 bg-zinc-900/60 p-3 space-y-3 min-w-0"
      onKeyDown={blockEnterSubmit}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-medium text-zinc-200 min-w-0 break-words">{props.title}</span>
        <button
          type="button"
          onClick={props.onClose}
          className={`${BTN} shrink-0 whitespace-nowrap px-3 text-[11px] text-zinc-300 hover:text-white rounded border border-zinc-700`}
        >
          編集を閉じる
        </button>
      </div>
      {props.children}
    </div>
  )
}

export function RuleSetEditor(props: {
  draft: RuleSetDraft
  onChange(next: RuleSetDraft): void
  onClose(): void
}) {
  const { draft, onChange, onClose } = props
  const setEntry = (i: number, patch: Partial<EntryDraft>) =>
    onChange({ ...draft, entries: draft.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  return (
    <EditorFrame title="RuleSetを編集" onClose={onClose}>
      <label className="block text-[11px] text-zinc-400">
        RuleSet名
        <input
          type="text"
          aria-label="RuleSet名"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className={`${INPUT} mt-1`}
        />
      </label>
      <div className="space-y-2">
        {draft.entries.map((en, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 min-w-0" data-testid="ruleset-entry-editor">
            <input
              type="text"
              aria-label={`Entry ${i + 1} のclass_type`}
              placeholder="class_type"
              value={en.class_type}
              onChange={(e) => setEntry(i, { class_type: e.target.value })}
              className={`${INPUT} flex-1 basis-32`}
            />
            <input
              type="text"
              aria-label={`Entry ${i + 1} のparam_name`}
              placeholder="param_name"
              value={en.param_name}
              onChange={(e) => setEntry(i, { param_name: e.target.value })}
              className={`${INPUT} flex-1 basis-32`}
            />
            <input
              type="number"
              aria-label={`Entry ${i + 1} のpriority`}
              value={en.priority}
              onChange={(e) => setEntry(i, { priority: num(e.target.value) })}
              className={`${INPUT} basis-20 max-w-[6rem]`}
            />
            <button
              type="button"
              aria-label={`Entry ${i + 1} を削除`}
              onClick={() => onChange({ ...draft, entries: draft.entries.filter((_, j) => j !== i) })}
              className={ICON_BTN}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...draft,
            entries: [...draft.entries, { class_type: '', param_name: '', priority: draft.entries.length + 1 }],
          })
        }
        className={`${BTN} px-3 text-[11px] text-zinc-200 rounded border border-zinc-700`}
      >
        Entryを追加
      </button>
    </EditorFrame>
  )
}

export function SelectorEditor(props: {
  draft: SelectorDraft
  onChange(next: SelectorDraft): void
  onClose(): void
}) {
  const { draft, onChange, onClose } = props
  const setPattern = (i: number, patch: Partial<PatternDraft>) =>
    onChange({ ...draft, patterns: draft.patterns.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  return (
    <EditorFrame title="NodeSelectorを編集" onClose={onClose}>
      <label className="block text-[11px] text-zinc-400">
        NodeSelector名
        <input
          type="text"
          aria-label="NodeSelector名"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className={`${INPUT} mt-1`}
        />
      </label>
      <div className="space-y-2">
        {draft.patterns.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 min-w-0" data-testid="selector-pattern-editor">
            <input
              type="text"
              aria-label={`パターン ${i + 1} の文字列`}
              placeholder="タイトル条件（パターン）"
              value={p.pattern}
              onChange={(e) => setPattern(i, { pattern: e.target.value })}
              className={`${INPUT} flex-1 basis-40`}
            />
            <select
              aria-label={`パターン ${i + 1} の一致方式`}
              value={p.match_type}
              onChange={(e) => setPattern(i, { match_type: e.target.value === 'contains' ? 'contains' : 'exact' })}
              className={`${INPUT} basis-28 max-w-[8rem]`}
            >
              <option value="exact">exact</option>
              <option value="contains">contains</option>
            </select>
            <input
              type="number"
              aria-label={`パターン ${i + 1} のpriority`}
              value={p.priority}
              onChange={(e) => setPattern(i, { priority: num(e.target.value) })}
              className={`${INPUT} basis-20 max-w-[6rem]`}
            />
            <button
              type="button"
              aria-label={`パターン ${i + 1} を削除`}
              onClick={() => onChange({ ...draft, patterns: draft.patterns.filter((_, j) => j !== i) })}
              className={ICON_BTN}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...draft,
            patterns: [...draft.patterns, { pattern: '', match_type: 'contains', priority: draft.patterns.length + 1 }],
          })
        }
        className={`${BTN} px-3 text-[11px] text-zinc-200 rounded border border-zinc-700`}
      >
        パターンを追加
      </button>
    </EditorFrame>
  )
}
