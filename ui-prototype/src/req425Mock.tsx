// REQ-425 UI mock (offline, local state only). Not production code: values are fixtures
// following docs/design/REQ-425.md §5 (main). No network, no persistence.
import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../frontend/src/index.css'

type Chip = { t: string; on: boolean }
type Block = { id: string; label: string }
type Section = { id: string; name: string; repeat: boolean; blocks: Block[] }
type Group = { id: string; name: string; node: string; filter: 'all' | number; blockIds: string[] }

const mk = (labels: string[]): Block[] => labels.map(l => ({ id: l, label: l }))
const ANIMA: Section[] = [
  { id: 'character', name: 'キャラクター', repeat: true, blocks: mk(['character name', 'series name', '@artist name if needed', 'skin / ears / horns / halo / wings', 'hair color', 'hair length', 'hair style', 'eye color', 'eye shape', 'pupils', 'expression', 'body features', 'headwear / eyewear', 'neckwear', 'upper clothes', 'lower clothes', 'legwear', 'shoes', 'accessories / tail / wings']) },
  { id: 'global', name: '全体', repeat: false, blocks: mk(['pose', 'hand position', 'leg position', 'action', 'camera distance', 'camera angle', 'lens', 'focus', 'composition', 'background', 'time', 'weather', 'scene objects', 'lighting', 'depth', 'effects', 'after details']) },
]
const NODES = ['positive_main（Main CLIPTextEncode）', 'positive_upscale（Upscale CLIPTextEncode）', 'positive_face（FaceDetailer PrimitiveString）']
const c = (...t: string[]): Chip[] => t.map(x => ({ t: x, on: true }))

type State = Record<string, Chip[]>[] // character instances; globals live in `glob`
const initChars: State = [
  { 'character name': c('alice'), 'series name': c('original'), 'hair color': c('silver hair'), 'hair length': c('long hair'), expression: c('smile'), 'upper clothes': [{ t: 'white blouse', on: false }, { t: 'navy cardigan', on: true }] },
  { 'character name': c('bob'), 'hair color': c('black hair'), 'upper clothes': c('coat') },
]
const initGlob: Record<string, Chip[]> = { pose: c('standing'), 'camera angle': c('from below'), background: c('city street', 'night'), lighting: c('rim light') }
const initGroups: Group[] = [
  { id: 'g1', name: 'Main', node: NODES[0], filter: 'all', blockIds: [...ANIMA[0].blocks.map(b => b.id), ...ANIMA[1].blocks.map(b => b.id)] },
  { id: 'g2', name: 'Upscale', node: NODES[1], filter: 'all', blockIds: ['character name', 'hair color', 'hair style', 'background', 'lighting', 'depth', 'effects'] },
  { id: 'g3', name: 'FaceDetailer', node: NODES[2], filter: 1, blockIds: ['character name', 'expression', 'eye color', 'pupils'] },
]

const joinBlock = (cs?: Chip[]) => (cs ?? []).filter(x => x.on).map(x => x.t.replace(/^[\s,]+|[\s,]+$/g, '')).filter(Boolean).join(', ')
function joinGroup(g: Group, chars: State, glob: Record<string, Chip[]>) {
  const parts: string[] = []
  const blockSet = new Set(g.blockIds)
  const charIds = ANIMA[0].blocks.map(b => b.id).filter(i => blockSet.has(i))
  const picked = g.filter === 'all' ? chars : chars.filter((_, i) => i + 1 === g.filter)
  picked.forEach(inst => charIds.forEach(id => parts.push(joinBlock(inst[id]))))
  ANIMA[1].blocks.filter(b => blockSet.has(b.id)).forEach(b => parts.push(joinBlock(glob[b.id])))
  return parts.filter(Boolean).join(', ')
}

const card = 'rounded-xl border border-white/10 bg-[#121215]'
const btn = 'min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-white/10 bg-[#18181C] px-3 text-sm text-zinc-200 hover:bg-white/10'
const primary = 'min-h-11 inline-flex items-center justify-center rounded-lg bg-[#7C6FDD] px-4 text-sm font-semibold text-white'

function ChipEditor({ chips, onChange, placeholder, onAsset }: { chips: Chip[]; onChange: (c: Chip[]) => void; placeholder?: string; onAsset?: () => void }) {
  const [v, setV] = useState('')
  const commit = () => { const t = v.trim(); if (t) onChange([...chips, { t, on: true }]); setV('') }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-[#09090B] p-1.5">
      {chips.map((x, i) => (
        <span key={i} className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 font-mono text-xs ${x.on ? 'border-[#7C6FDD]/40 bg-[#7C6FDD]/15 text-zinc-100' : 'border-white/10 bg-white/5 text-zinc-500 line-through'}`}>
          <button type="button" aria-label={`${x.t} を${x.on ? '無効' : '有効'}化`} onClick={() => onChange(chips.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))}>{x.t}</button>
          <button type="button" aria-label={`${x.t} を削除`} className="text-zinc-400" onClick={() => onChange(chips.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      <input value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() } }}
        placeholder={chips.length ? '' : placeholder} className="min-h-8 min-w-[5rem] flex-1 bg-transparent px-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-600" />
      {onAsset && <button type="button" onClick={onAsset} className="min-h-8 rounded-md border border-[#3ecf8e]/40 px-2 text-xs text-[#3ecf8e]">+ アセット</button>}
    </div>
  )
}

function BlockRow({ label, chips, onChange, hideEmpty }: { label: string; chips: Chip[]; onChange: (c: Chip[]) => void; hideEmpty: boolean }) {
  const [forceOpen, setForceOpen] = useState(false)
  if (hideEmpty && chips.length === 0 && !forceOpen) {
    return <button type="button" onClick={() => setForceOpen(true)} className="flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-xs text-zinc-500 hover:bg-white/5"><span>{label}</span><span>＋ 入力</span></button>
  }
  return (
    <div className="space-y-1 px-2 py-1">
      <div className="text-[0.8125rem] font-medium text-zinc-300">{label}</div>
      <ChipEditor chips={chips} onChange={onChange} placeholder={label} onAsset={() => onChange([...chips, { t: '<lora:sample_style:0.8>', on: true }])} />
    </div>
  )
}

function Acc({ title, badge, children, defaultOpen = true, right }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={card}>
      <div className="flex items-center gap-2 pr-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 flex-1 items-center gap-2 px-3 text-left text-sm font-semibold text-zinc-100">
          <span className="text-zinc-500">{open ? '▾' : '▸'}</span>{title}{badge && <span className="rounded bg-white/10 px-1.5 text-xs font-normal text-zinc-400">{badge}</span>}
        </button>
        {right}
      </div>
      {open && <div className="border-t border-white/10 p-2">{children}</div>}
    </section>
  )
}

function GenerateView({ chars, setChars, glob, setGlob, groups, neg, setNeg }: any) {
  const [hideEmpty, setHideEmpty] = useState(true)
  const [active, setActive] = useState(0)
  const [showPrev, setShowPrev] = useState(true)
  const inst = Math.min(active, chars.length - 1)
  const upd = (i: number, id: string, cs: Chip[]) => setChars(chars.map((x: any, k: number) => (k === i ? { ...x, [id]: cs } : x)))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-100">プロンプト <span className="ml-1 rounded bg-[#7C6FDD]/20 px-1.5 text-xs font-normal text-[#b3a9ff]">Anima 標準テンプレート</span></h2>
        <label className="flex min-h-11 items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} className="h-4 w-4" />空ブロックを隠す</label>
      </div>

      <Acc title="キャラクター" badge={`${chars.length}人`} right={<button className={btn} onClick={() => { setChars([...chars, {}]); setActive(chars.length) }}>＋ インスタンスを追加</button>}>
        <div className="mb-2 flex flex-wrap gap-1.5" role="tablist">
          {chars.map((_: any, i: number) => (
            <span key={i} className={`inline-flex items-center rounded-lg border ${i === inst ? 'border-[#7C6FDD] bg-[#7C6FDD]/20' : 'border-white/10 bg-[#18181C]'}`}>
              <button role="tab" aria-selected={i === inst} onClick={() => setActive(i)} className="min-h-11 min-w-11 px-3 text-sm text-zinc-100">#{i + 1}</button>
              {chars.length > 1 && <button aria-label={`#${i + 1} を削除`} onClick={() => { setChars(chars.filter((_: any, k: number) => k !== i)); setActive(0) }} className="min-h-11 min-w-11 text-zinc-400">🗑</button>}
            </span>
          ))}
        </div>
        <div className="divide-y divide-white/5">
          {ANIMA[0].blocks.map(b => <BlockRow key={b.id + inst} label={b.label} chips={chars[inst][b.id] ?? []} onChange={cs => upd(inst, b.id, cs)} hideEmpty={hideEmpty} />)}
        </div>
      </Acc>

      <Acc title="全体" badge="17ブロック" defaultOpen={false}>
        <div className="divide-y divide-white/5">
          {ANIMA[1].blocks.map(b => <BlockRow key={b.id} label={b.label} chips={glob[b.id] ?? []} onChange={cs => setGlob({ ...glob, [b.id]: cs })} hideEmpty={hideEmpty} />)}
        </div>
      </Acc>

      <section className={card}>
        <button type="button" aria-expanded={showPrev} onClick={() => setShowPrev(!showPrev)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-zinc-100">
          <span className="text-zinc-500">{showPrev ? '▾' : '▸'}</span>結合プレビュー（出力グループ別 送信文字列）
        </button>
        {showPrev && <div className="space-y-2 border-t border-white/10 p-3">
          {groups.map((g: Group) => {
            const s = joinGroup(g, chars, glob)
            return <div key={g.id} className="rounded-lg bg-[#09090B] p-2">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs"><b className="text-zinc-100">{g.name}</b><span className="text-zinc-500">→ {g.node.split('（')[0]}</span><span className="rounded bg-white/10 px-1.5 text-zinc-400">{g.filter === 'all' ? '全インスタンス' : `#${g.filter} のみ`}</span></div>
              <div className="break-words font-mono text-xs text-zinc-300">{s || <span className="text-zinc-600">（空文字）</span>}</div>
            </div>
          })}
        </div>}
      </section>

      <section className={card + ' p-3'}>
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-zinc-100">Negative Prompt <span className="rounded bg-white/10 px-1.5 text-xs font-normal text-zinc-400">出力グループ未割当・従来の1欄</span></div>
        <ChipEditor chips={neg} onChange={setNeg} placeholder="negative prompt" />
      </section>
    </div>
  )
}

function GroupsView({ groups, setGroups, nChars }: any) {
  const [sel, setSel] = useState(groups[1].id)
  const g: Group = groups.find((x: Group) => x.id === sel) ?? groups[0]
  const patch = (p: Partial<Group>) => setGroups(groups.map((x: Group) => (x.id === g.id ? { ...x, ...p } : x)))
  const move = (i: number, d: number) => { const a = [...g.blockIds]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; patch({ blockIds: a }) }
  const toggle = (id: string) => patch({ blockIds: g.blockIds.includes(id) ? g.blockIds.filter(x => x !== id) : [...g.blockIds, id] })
  return (
    <div className="space-y-3">
      <div className={card + ' space-y-2 p-3'}>
        <label className="block text-xs text-zinc-400">プロンプト構造テンプレート
          <select className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#09090B] px-2 text-sm text-zinc-100"><option>Anima 標準テンプレート（組込）</option><option>未適用（従来の単一入力）</option><option>My 2枚構成（カスタム）</option></select>
        </label>
        <p className="text-xs text-zinc-500">ワークフロー: sample_anima_t2i.json / 出力グループは任意に追加・編集・削除でき、固定名はありません。</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {groups.map((x: Group) => <button key={x.id} onClick={() => setSel(x.id)} className={`${btn} ${x.id === g.id ? '!border-[#7C6FDD] !bg-[#7C6FDD]/20' : ''}`}>{x.name}</button>)}
        <button className={btn} onClick={() => { const id = 'g' + (groups.length + 1) + Math.random().toString(36).slice(2, 5); setGroups([...groups, { id, name: `新規グループ ${groups.length + 1}`, node: NODES[0], filter: 'all', blockIds: [] }]); setSel(id) }}>＋ 出力グループ</button>
      </div>

      <div className={card + ' space-y-3 p-3'}>
        <div className="flex gap-2">
          <input value={g.name} onChange={e => patch({ name: e.target.value })} aria-label="グループ名" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#09090B] px-3 text-sm text-zinc-100" />
          <button className={btn} aria-label="グループを削除" disabled={groups.length <= 1} onClick={() => { setGroups(groups.filter((x: Group) => x.id !== g.id)); setSel(groups[0].id) }}>🗑</button>
        </div>
        <label className="block text-xs text-zinc-400">送信先プロンプトノード（textarea マッピング）
          <select value={g.node} onChange={e => patch({ node: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#09090B] px-2 text-sm text-zinc-100">{NODES.map(n => <option key={n}>{n}</option>)}<option disabled>negative_prompt（未割当のまま 1 欄で運用）</option></select>
        </label>
        <label className="block text-xs text-zinc-400">キャラクター Repeat の対象
          <select value={String(g.filter)} onChange={e => patch({ filter: e.target.value === 'all' ? 'all' : Number(e.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#09090B] px-2 text-sm text-zinc-100">
            <option value="all">全インスタンス結合</option>{[1, 2, 3].map(n => <option key={n} value={n}>#{n} のみ</option>)}
          </select>
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-400"><span>結合順（選択中 {g.blockIds.length} ブロック）</span><button className="min-h-9 text-[#b3a9ff]" onClick={() => patch({ blockIds: [] })}>全解除</button></div>
          <ol className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-[#09090B] p-1.5">
            {g.blockIds.map((id, i) => (
              <li key={id} className="flex items-center gap-1 text-xs text-zinc-200">
                <span className="w-6 text-right text-zinc-500">{i + 1}</span><span className="min-w-0 flex-1 truncate">{id}</span>
                <button className="min-h-9 min-w-9" aria-label="上へ" onClick={() => move(i, -1)}>↑</button><button className="min-h-9 min-w-9" aria-label="下へ" onClick={() => move(i, 1)}>↓</button>
              </li>))}
            {!g.blockIds.length && <li className="p-2 text-xs text-zinc-600">ブロック未選択</li>}
          </ol>
        </div>

        {ANIMA.map(s => (
          <div key={s.id}>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400"><span>{s.name}{s.repeat && '（Repeat）'}</span>
              <span><button className="min-h-9 px-2 text-[#b3a9ff]" onClick={() => patch({ blockIds: [...g.blockIds, ...s.blocks.map(b => b.id).filter(i => !g.blockIds.includes(i))] })}>全選択</button>
              <button className="min-h-9 px-2 text-[#b3a9ff]" onClick={() => patch({ blockIds: g.blockIds.filter(i => !s.blocks.some(b => b.id === i)) })}>全解除</button></span></div>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              {s.blocks.map(b => <label key={b.id} className="flex min-h-9 items-center gap-2 text-xs text-zinc-300"><input type="checkbox" className="h-4 w-4" checked={g.blockIds.includes(b.id)} onChange={() => toggle(b.id)} /><span className="truncate">{b.label}</span></label>)}
            </div>
          </div>
        ))}
        <p className="text-xs text-zinc-500">※ 指定番号が存在しない（現在 {nChars} 人）場合は、この部分をスキップして送信します。</p>
      </div>
    </div>
  )
}

function ManagerView() {
  const [secs, setSecs] = useState<Section[]>([{ id: 's1', name: '人物', repeat: true, blocks: mk(['name', 'outfit']) }, { id: 's2', name: '背景', repeat: false, blocks: mk(['place']) }])
  const setBlocks = (si: number, f: (b: Block[]) => Block[]) => setSecs(secs.map((s, i) => (i === si ? { ...s, blocks: f(s.blocks) } : s)))
  return (
    <div className="space-y-3">
      <div className={card + ' divide-y divide-white/5'}>
        {[['Anima 標準テンプレート', '組込・2セクション / 36ブロック', true], ['My 2枚構成', 'カスタム・編集中', false]].map(([n, d, b]) => (
          <div key={String(n)} className="flex items-center gap-2 p-3"><div className="min-w-0 flex-1"><div className="text-sm text-zinc-100">{n} {b && <span className="ml-1 rounded bg-white/10 px-1.5 text-xs text-zinc-400">組込</span>}</div><div className="text-xs text-zinc-500">{d}</div></div>
            <button className={btn}>複製</button>{!b && <button className={btn} aria-label="削除">🗑</button>}</div>))}
      </div>
      <div className={card + ' space-y-3 p-3'}>
        <div className="text-sm font-semibold text-zinc-100">「My 2枚構成」を編集</div>
        {secs.map((s, si) => (
          <div key={s.id} className="space-y-1 rounded-lg bg-[#09090B] p-2">
            <div className="flex items-center gap-2"><input value={s.name} onChange={e => setSecs(secs.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)))} aria-label="セクション名" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#121215] px-2 text-sm text-zinc-100" />
              <label className="flex min-h-11 items-center gap-1 text-xs text-zinc-300"><input type="checkbox" className="h-4 w-4" checked={s.repeat} onChange={e => setSecs(secs.map((x, i) => (i === si ? { ...x, repeat: e.target.checked } : x)))} />Repeat</label></div>
            {s.blocks.map((b, bi) => (
              <div key={b.id + bi} className="flex items-center gap-1"><input value={b.label} onChange={e => setBlocks(si, bs => bs.map((x, i) => (i === bi ? { ...x, label: e.target.value } : x)))} aria-label="ブロック名" className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#121215] px-2 text-xs text-zinc-100" />
                <button className="min-h-11 min-w-11 text-zinc-300" aria-label="上へ" onClick={() => setBlocks(si, bs => { const a = [...bs]; if (bi > 0) [a[bi - 1], a[bi]] = [a[bi], a[bi - 1]]; return a })}>↑</button>
                <button className="min-h-11 min-w-11 text-zinc-300" aria-label="下へ" onClick={() => setBlocks(si, bs => { const a = [...bs]; if (bi < a.length - 1) [a[bi + 1], a[bi]] = [a[bi], a[bi + 1]]; return a })}>↓</button>
                <button className="min-h-11 min-w-11 text-zinc-400" aria-label="削除" onClick={() => setBlocks(si, bs => bs.filter((_, i) => i !== bi))}>×</button></div>))}
            <button className={btn} onClick={() => setBlocks(si, bs => [...bs, { id: 'new' + bs.length + Date.now(), label: 'new block' }])}>＋ ブロック追加</button>
          </div>))}
        <div className="flex gap-2"><button className={btn} onClick={() => setSecs([...secs, { id: 's' + Date.now(), name: '新規セクション', repeat: false, blocks: [] }])}>＋ セクション追加</button><button className={primary}>保存（モック）</button></div>
      </div>
    </div>
  )
}

function App() {
  const q = new URLSearchParams(location.search)
  const [tab, setTab] = useState(q.get('tab') ?? 'generate')
  const [mobile, setMobile] = useState(q.get('vp') === 'pc' ? false : q.get('vp') === 'mobile' ? true : window.innerWidth < 700)
  const [chars, setChars] = useState<State>(initChars)
  const [glob, setGlob] = useState(initGlob)
  const [groups, setGroups] = useState<Group[]>(initGroups)
  const [neg, setNeg] = useState<Chip[]>(c('lowres', 'bad anatomy', 'watermark'))
  const tabs = [['generate', '生成画面'], ['groups', '設定: 出力グループ'], ['manager', '設定: テンプレート管理']]
  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-200" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mx-auto flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#121215] p-2" style={{ maxWidth: mobile ? 430 : 1100 }}>
        <span className="rounded bg-[#7C6FDD]/20 px-2 py-1 text-xs text-[#b3a9ff]">REQ-425 UIモック（オフライン・保存なし）</span>
        <button className={btn} onClick={() => setMobile(!mobile)}>表示: {mobile ? 'モバイル' : 'PC'}</button>
      </div>
      <div className="mx-auto" style={{ maxWidth: mobile ? 430 : 1100 }}>
        <nav className="flex gap-1 overflow-x-auto p-2" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`${btn} shrink-0 ${tab === k ? '!border-[#7C6FDD] !bg-[#7C6FDD] !text-white' : ''}`}>{l}</button>)}</nav>
        <main className="p-2 pb-24">
          {tab === 'generate' && <GenerateView {...{ chars, setChars, glob, setGlob, groups, neg, setNeg }} />}
          {tab === 'groups' && <GroupsView groups={groups} setGroups={setGroups} nChars={chars.length} />}
          {tab === 'manager' && <ManagerView />}
        </main>
        {tab === 'generate' && <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#09090B]/95 p-2"><div className="mx-auto" style={{ maxWidth: mobile ? 430 : 1100 }}><button className={primary + ' w-full'} onClick={() => alert('モック: 生成APIは呼びません')}>生成（モック）</button></div></div>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
