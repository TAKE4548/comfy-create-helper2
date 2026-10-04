import { useState } from 'react'

export interface PromptFieldView {
  key: string
  name: string
  role: string | null
  nodeId: string
  recorded: boolean
  value: string | null
  status: 'submitted' | 'bypassed' | 'missing'
}

type GraphemeSegmenter = new (locales?: string | string[], options?: { granularity: 'grapheme' }) => { segment(value: string): Iterable<unknown> }

export function GenerationPromptFields(props: { fields: PromptFieldView[]; warning: string | null }): React.ReactNode {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [copyError, setCopyError] = useState<string | null>(null)
  const graphemeCount = (value: string): number | null => {
    try {
      const Segmenter = (Intl as unknown as { Segmenter?: GraphemeSegmenter }).Segmenter
      if (!Segmenter) return null
      return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length
    } catch { return null }
  }
  const defaultOpen = (field: PromptFieldView) => field.recorded && Boolean(field.value)
  const isOpen = (field: PromptFieldView) => overrides[field.key] ?? defaultOpen(field)
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(props.fields.map((field) => [field.key, open])))
  const copy = async (field: PromptFieldView) => {
    if (!field.recorded || field.value === null) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(field.value)
      setCopyError(null)
    } catch {
      setCopyError('コピーに失敗しました。ブラウザーのクリップボード権限を確認してください。')
    }
  }

  return <section aria-label={`Prompt欄 (${props.fields.length})`} className="space-y-3">
    <header className="flex items-center justify-between gap-2">
      <h3 className="font-semibold text-zinc-100">Prompt欄 ({props.fields.length})</h3>
      <div className="flex gap-2">
        <button type="button" className="text-xs" onClick={() => setAll(true)}>すべて展開</button>
        <button type="button" className="text-xs" onClick={() => setAll(false)}>すべて折りたたむ</button>
      </div>
    </header>
    {props.warning && <p role="status" className="text-amber-300 text-sm">{props.warning}</p>}
    {copyError && <p role="alert" className="text-red-300 text-sm">{copyError}</p>}
    {props.fields.map((field) => {
      const identity = `${field.name}${field.role ? ` (${field.role})` : ` (Node ${field.nodeId})`}`
      const open = isOpen(field)
      const count = field.recorded && field.value !== null ? graphemeCount(field.value) : null
      return <article key={field.key} className="rounded-lg border border-white/10 bg-surface-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <button type="button" aria-expanded={open} aria-controls={`prompt-${field.key}`} aria-label={`${identity}を${open ? '折りたたむ' : '展開'}`}
          className="min-w-0 flex-1 text-left" onClick={() => setOverrides((current) => ({ ...current, [field.key]: !open }))}>
            <span className="block font-medium text-zinc-100">{field.name}</span>
            <span className="block text-xs text-zinc-400">{field.role ?? 'role不明'} / Node {field.nodeId}</span>
            {(!field.recorded || field.value === null) && <span className="block text-xs text-zinc-500">未記録</span>}
            {field.recorded && field.value === '' && <span className="block text-xs text-zinc-500">空欄</span>}
          </button>
          <button type="button" className="text-xs" disabled={!field.recorded || field.value === null}
            aria-label={`${identity}をコピー`} onClick={() => void copy(field)}>コピー</button>
        </div>
        {open && <div id={`prompt-${field.key}`} className="mt-3">
          {!field.recorded || field.value === null ? <p className="text-sm text-zinc-400">未記録</p> : field.value === '' ?
            <p className="text-sm text-zinc-400">{field.role ?? field.name}欄に記録されたテキストはありません</p> :
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-zinc-200">{field.value}</pre>}
          {field.recorded && field.value !== null && <p className="mt-2 text-xs text-zinc-500">{count === null ? '文字数: 未対応' : `文字数: ${count}`}</p>}
          {field.status === 'bypassed' && <p className="mt-1 text-xs text-amber-300">バイパスされた欄</p>}
        </div>}
      </article>
    })}
  </section>
}
