import { useEffect, useState } from 'react'
import { lorasApi, snapshotsApi, tagSetsApi } from '../api/client'
import type { Lora, Snapshot, SnapshotTagSetCreate, SnapshotTriggerAssociation, TagSet } from '../api/types'
import { ASSOCIATIONS_KEY } from '../utils/generationRecord'

interface Props {
  snapshot: Snapshot; onPersisted: (snapshot: Snapshot) => void
  onEditingChange: (editing: boolean, saving: boolean) => void
}
function current(snapshot: Snapshot) {
  const generic = (snapshot.tag_sets ?? []).map(t => ({ tag_set_id: t.tag_set_id, role: t.role }))
  let triggers: SnapshotTriggerAssociation[] = [], malformed = false
  if (ASSOCIATIONS_KEY in snapshot.params) {
    try {
      const record = JSON.parse(String(snapshot.params[ASSOCIATIONS_KEY]))
      if (record.version !== 1 || !Array.isArray(record.lora_trigger_sets) || !record.lora_trigger_sets.every((t: SnapshotTriggerAssociation) =>
        t && Number.isInteger(t.lora_id) && Number.isInteger(t.trigger_set_id) && typeof t.role === 'string')) throw new Error()
      triggers = record.lora_trigger_sets.map((t: SnapshotTriggerAssociation) => ({ ...t }))
    } catch { malformed = true }
  }
  return { generic, triggers, malformed }
}
const control = 'rounded border border-zinc-600 px-2 py-1 bg-surface-2 text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2'
export function SnapshotTagAssociationsPanel({ snapshot, onPersisted, onEditingChange }: Props) {
  const [tagSets, setTagSets] = useState<TagSet[]>([])
  const [loras, setLoras] = useState<Lora[]>([])
  const [editing, setEditing] = useState(false), [saving, setSaving] = useState(false)
  const [genericDraft, setGenericDraft] = useState<SnapshotTagSetCreate[]>([])
  const [triggerDraft, setTriggerDraft] = useState<SnapshotTriggerAssociation[]>([])
  const [error, setError] = useState(''), [role, setRole] = useState('association-only')
  const [genericId, setGenericId] = useState(''), [triggerId, setTriggerId] = useState('')
  useEffect(() => {
    let live = true
    Promise.allSettled([tagSetsApi.list(), lorasApi.list()]).then(([tags, models]) => {
      if (!live) return
      if (tags.status === 'fulfilled') setTagSets(tags.value)
      if (models.status === 'fulfilled') setLoras(models.value)
      if (tags.status === 'rejected' || models.status === 'rejected') setError('選択候補の取得に失敗しました')
    })
    return () => { live = false }
  }, [])
  useEffect(() => { onEditingChange(editing, saving) }, [editing, saving, onEditingChange])
  const persisted = current(snapshot)
  const generic = editing ? genericDraft : persisted.generic
  const triggers = editing ? triggerDraft : persisted.triggers
  const candidates = loras.filter(l => snapshot.loras?.some(s => s.lora_id === l.id))
    .flatMap(l => l.trigger_word_sets.map(t => ({ id: `${l.id}:${t.id}`, lora: l, set: t })))
  const genericName = (id: number) => tagSets.find(t => t.id === id)?.name ?? `ID ${id}（未登録）`
  const triggerName = (t: SnapshotTriggerAssociation) => loras.find(l => l.id === t.lora_id)?.trigger_word_sets.find(s => s.id === t.trigger_set_id)?.name
    ?? `LoRA ${t.lora_id} / ID ${t.trigger_set_id}（未登録）`
  const begin = () => {
    setGenericDraft(persisted.generic.map(t => ({ ...t })))
    setTriggerDraft(persisted.triggers.map(t => ({ ...t })))
    setError(''); setEditing(true)
  }
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      const saved = await snapshotsApi.patch(snapshot.id, { tag_sets: genericDraft, lora_trigger_sets: triggerDraft })
      onPersisted(saved); setEditing(false)
    } catch { setError('タグ関連の保存に失敗しました。内容を保持しています。') }
    finally { setSaving(false) }
  }
  return <section aria-label="現在のタグ関連" className="space-y-3 border-t border-zinc-700 pt-3">
    <div className="flex justify-between items-center"><h3>現在のタグ関連</h3>
      {!editing && <button className={control} disabled={persisted.malformed} onClick={begin}>タグ関連を編集</button>}
    </div>
    <p className="text-xs text-zinc-400">現在の関連です。生成時のプロンプト・LoRA設定は保持されます。</p>
    {persisted.malformed && <p role="alert">トリガー関連を読み取れません。編集できません。</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    <h4>汎用タグセット ({generic.length})</h4>
    {generic.length === 0 && <p className="text-zinc-400">関連なし</p>}
    {generic.map((t, i) => <div key={`${t.tag_set_id}:${t.role}:${i}`} className="flex gap-2 items-center">
      <span>{genericName(t.tag_set_id)}</span><small>role: {t.role === 'association-only' ? '対象指定なし' : t.role || '指定なし'}</small>
      {editing && <button className={control} disabled={saving} aria-label={`汎用タグセット ${genericName(t.tag_set_id)} を削除`}
        onClick={() => setGenericDraft(genericDraft.filter((_, n) => n !== i))}>削除</button>}
    </div>)}
    <h4>LoRAトリガーセット ({triggers.length})</h4>
    {triggers.length === 0 && <p className="text-zinc-400">関連なし</p>}
    {triggers.map((t, i) => <div key={`${t.lora_id}:${t.trigger_set_id}:${t.role}:${i}`} className="flex flex-wrap gap-2 items-center">
      <span>{triggerName(t)}</span><small>LoRA: {loras.find(l => l.id === t.lora_id)?.model_name ?? t.lora_id} / role: {t.role === 'association-only' ? '対象指定なし' : t.role || '指定なし'}</small>
      {editing && <button className={control} disabled={saving} aria-label={`LoRAトリガーセット ${triggerName(t)} を削除`}
        onClick={() => setTriggerDraft(triggerDraft.filter((_, n) => n !== i))}>削除</button>}
    </div>)}
    {editing && <fieldset disabled={saving} className="space-y-2">
      <label className="block">追加するrole <input className={control} value={role} onChange={e => setRole(e.target.value)} placeholder="association-only" /></label>
      <p className="text-xs text-zinc-400">対象指定なしは association-only として関連を保存します。</p>
      <div className="flex flex-wrap gap-2"><label>汎用タグセットを選択 <select className={control} value={genericId} onChange={e => setGenericId(e.target.value)}>
        <option value="">選択</option>{tagSets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select></label><button className={control} disabled={!genericId} onClick={() => {
        const tag_set_id = Number(genericId)
        const targetRole = role.trim() ? role : 'association-only'
        if (!genericDraft.some(t => t.tag_set_id === tag_set_id && (t.role ?? '') === targetRole)) setGenericDraft([...genericDraft, { tag_set_id, role: targetRole }])
      }}>汎用タグセットを追加</button></div>
      <div className="flex flex-wrap gap-2"><label>LoRAトリガーセットを選択 <select className={control} value={triggerId} onChange={e => setTriggerId(e.target.value)}>
        <option value="">選択</option>{candidates.map(c => <option key={c.id} value={c.id}>{c.lora.model_name} / {c.set.name}</option>)}
      </select></label><button className={control} disabled={!triggerId} onClick={() => {
        const [lora_id, trigger_set_id] = triggerId.split(':').map(Number)
        const targetRole = role.trim() ? role : 'association-only'
        if (!triggerDraft.some(t => t.lora_id === lora_id && t.trigger_set_id === trigger_set_id && t.role === targetRole)) setTriggerDraft([...triggerDraft, { lora_id, trigger_set_id, role: targetRole }])
      }}>LoRAトリガーセットを追加</button></div>
      <div className="flex gap-2"><button className={control} onClick={save}>保存</button>
        <button className={control} onClick={() => { setEditing(false); setError(''); setGenericDraft([]); setTriggerDraft([]) }}>キャンセル</button></div>
    </fieldset>}
  </section>
}
