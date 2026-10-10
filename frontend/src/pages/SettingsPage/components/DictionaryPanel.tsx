import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { translateApi } from '../../../api/client'

interface DictionaryRule { source: string; replacement: string }

export function DictionaryPanel() {
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['translate-dictionary'],
    queryFn: () => typeof translateApi.getDictionary === 'function'
      ? translateApi.getDictionary()
      : Promise.resolve({ rules: [] }),
  })
  const [rules, setRules] = useState<DictionaryRule[]>([])
  const [source, setSource] = useState('')
  const [replacement, setReplacement] = useState('')
  const [editingSource, setEditingSource] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data) setRules(data.rules)
  }, [data])

  const persist = async (nextRules: DictionaryRule[], clearDraft: boolean) => {
    if (pending) return
    setPending(true)
    setMessage(null)
    setError(null)
    try {
      const result = await translateApi.saveDictionary(nextRules)
      setRules(result.rules)
      setMessage('設定を保存しました')
      setDeleteTarget(null)
      if (clearDraft) {
        setSource('')
        setReplacement('')
        setEditingSource(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存に失敗しました')
    } finally {
      setPending(false)
    }
  }

  const handleSubmit = () => {
    const cleanSource = source.trim()
    if (!cleanSource || !replacement.trim()) {
      setError('置換前と置換後を入力してください')
      return
    }
    const nextRule = { source: cleanSource, replacement }
    const nextRules = editingSource
      ? rules.map((rule) => rule.source === editingSource ? nextRule : rule)
      : [...rules.filter((rule) => rule.source !== cleanSource), nextRule]
    void persist(nextRules, true)
  }

  const startEdit = (rule: DictionaryRule) => {
    setEditingSource(rule.source)
    setSource(rule.source)
    setReplacement(rule.replacement)
    setError(null)
    setMessage(null)
  }

  return (
    <section aria-label="翻訳置換辞書" className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-surface-2/30 p-3 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-zinc-200">翻訳置換辞書</h3>
        <p className="mt-1 text-[11px] text-zinc-500">翻訳後に大文字小文字を区別して文字列を置換します。</p>
      </div>
      {isLoading ? <p className="text-xs text-zinc-500">辞書を読み込み中…</p> : null}
      {loadError && <p role="alert" className="text-xs text-red-300">{loadError instanceof Error ? loadError.message : '辞書を読み込めませんでした'}</p>}
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.source} className="flex flex-wrap items-center gap-2 rounded bg-surface p-2 text-xs">
            <span className="text-zinc-200">{rule.source}</span><span className="text-zinc-500">→</span><span className="flex-1 text-zinc-300">{rule.replacement}</span>
            <button type="button" disabled={pending} onClick={() => startEdit(rule)} className="text-zinc-300 disabled:opacity-50">編集</button>
            {deleteTarget === rule.source ? (
              <span className="flex items-center gap-2" role="group" aria-label={`「${rule.source}」の削除確認`}>
                <span className="text-amber-300">「{rule.source}」を削除しますか？</span>
                <button type="button" disabled={pending} onClick={() => void persist(rules.filter((item) => item.source !== rule.source), false)} className="text-red-300 disabled:opacity-50">削除を確定</button>
                <button type="button" disabled={pending} onClick={() => setDeleteTarget(null)} className="text-zinc-300">キャンセル</button>
              </span>
            ) : <button type="button" disabled={pending} onClick={() => { setDeleteTarget(rule.source); setMessage(null); setError(null) }} className="text-red-300 disabled:opacity-50">削除</button>}
          </li>
        ))}
      </ul>
      <div role="group" aria-label="辞書ルール入力" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleSubmit() } }} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input aria-label="置換前" disabled={pending} value={source} onChange={(event) => { setSource(event.target.value); setMessage(null); setError(null) }} placeholder="置換前の文字列" className="rounded bg-surface px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-50" />
        <input aria-label="置換後" disabled={pending} value={replacement} onChange={(event) => { setReplacement(event.target.value); setMessage(null); setError(null) }} placeholder="置換後の文字列" className="rounded bg-surface px-2 py-1.5 text-xs text-zinc-200 disabled:opacity-50" />
        <button type="button" onClick={handleSubmit} disabled={pending} className="rounded bg-[#7C6FDD] px-3 py-1.5 text-xs text-white disabled:opacity-50">
          {pending ? '保存中…' : editingSource ? '変更を保存' : 'ルールを追加'}
        </button>
        {editingSource && <button type="button" disabled={pending} onClick={() => { setEditingSource(null); setSource(''); setReplacement('') }} className="text-xs text-zinc-400">編集をキャンセル</button>}
      </div>
      {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-300">保存に失敗しました: {error}（設定は未保存です）</p>}
    </section>
  )
}
