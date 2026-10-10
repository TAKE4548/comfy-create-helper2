import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import { GenerationPromptFields, type PromptFieldView } from './GenerationPromptFields'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface MetadataItemView { key: string; name: string; recorded: boolean; value: JsonValue; role?: string | null; status?: string }
export interface GenerationMetadataPanelProps {
  imageUrl: string; promptId: string | null
  header: { workflowId: number | null; workflowName: string | null; queuedAt: string | null; metadataSavedAt: string | null; completedAt?: string | null; imageSavedAt: string | null; albums: string[] }
  fields: PromptFieldView[]; parameters: MetadataItemView[]; extras: MetadataItemView[]
  actualSeed: string | null
  loraRows: { key: string; model: string; role: string; weight: string | null; modelStrength: string | null; clipStrength: string | null }[]
  assets: MetadataItemView[]; warning: string | null; associationPanel?: ReactNode
}

function displayValue(value: JsonValue): string {
  if (typeof value === 'string') return value === '' ? '空文字列' : value
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }
function Items({ title, items }: { title: string; items: MetadataItemView[] }) {
  return <section className="space-y-2"><h4 className="font-semibold">{title} ({items.length})</h4>
    {items.length === 0 && <p className="text-sm text-zinc-500">記録はありません</p>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{items.map((item) => <article key={item.key} className="min-w-0 rounded border border-white/10 bg-surface-2 p-2">
      <h5 className="font-medium text-zinc-200">{item.name}</h5>{item.role && <p className="text-xs text-zinc-500">{item.role}</p>}
      {!item.recorded ? <p className="text-sm text-zinc-400">未記録</p> : <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm text-zinc-300">{displayValue(item.value)}</pre>}
      {item.status && item.status !== 'submitted' && <p className="text-xs text-amber-300">{item.status}</p>}
    </article>)}</div>
  </section>
}

export function GenerationMetadataPanel(props: GenerationMetadataPanelProps): ReactNode {
  const [tab, setTab] = useState<'details' | 'assets'>('details')
  const [dimensions, setDimensions] = useState<{ url: string; width: number; height: number; ratio: string } | null>(null)
  const [mime, setMime] = useState<string | null>(null)
  const [seedError, setSeedError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setMime(null)
    fetch(props.imageUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return
      if (!response.ok) throw new Error('image MIME unavailable')
      const type = response.headers.get('content-type')?.split(';')[0]?.trim()
      setMime(type?.startsWith('image/') ? type : null)
    }).catch(() => { if (!controller.signal.aborted) setMime(null) })
    return () => controller.abort()
  }, [props.imageUrl])
  const copySeed = async () => {
    if (props.actualSeed === null) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(props.actualSeed)
      setSeedError(false)
    } catch { setSeedError(true) }
  }
  const onImageLoad = (url: string, event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    if (width > 0 && height > 0) { const divisor = gcd(width, height); setDimensions({ url, width, height, ratio: `${width / divisor}:${height / divisor}` }) }
    else setDimensions(null)
  }
  const imageFacts = dimensions?.url === props.imageUrl ? dimensions : null
  const tabClass = (selected: boolean) => `rounded-t-md border-b-2 px-4 py-2 text-sm font-medium outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${selected ? 'border-sky-400 bg-sky-400/10 text-sky-100' : 'border-transparent text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`
  return <aside className="flex min-w-0 flex-col gap-4" aria-label="生成メタ情報">
    <img key={props.imageUrl} src={props.imageUrl} alt="" aria-hidden="true" onLoad={(event) => onImageLoad(props.imageUrl, event)} className="hidden" />
    <p className="text-sm text-zinc-400">画像サイズ: {imageFacts ? `${imageFacts.width} × ${imageFacts.height} (${imageFacts.ratio})` : '未取得'}</p>
    <p className="text-sm text-zinc-400">形式: {mime ?? '未取得'}</p>
    <section className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="block text-xs text-zinc-500">Workflow</span>{props.header.workflowName ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">Workflow ID</span>{props.header.workflowId ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">Prompt ID</span>{props.promptId ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">生成キュー登録</span>{props.header.queuedAt ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">メタ情報保存</span>{props.header.metadataSavedAt ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">生成完了時刻</span>{props.header.completedAt ?? '未記録'}</div>
      <div><span className="block text-xs text-zinc-500">画像保存時刻</span>{props.header.imageSavedAt ?? '未記録'}</div>
    </section>
    <section><h4 className="font-semibold">アルバム（現在）</h4><p className="text-sm text-zinc-300">{props.header.albums.length ? props.header.albums.join('、') : '所属なし'}</p></section>
    <section><h4 className="font-semibold">実際のseed</h4><div className="flex items-center gap-2"><code>{props.actualSeed ?? '未記録'}</code>
      <button type="button" disabled={props.actualSeed === null} onClick={() => void copySeed()} aria-label="実際のseedをコピー">コピー</button></div>
      {seedError && <p role="alert" className="text-sm text-red-300">seedのコピーに失敗しました。</p>}</section>
    <div role="tablist" aria-label="生成情報" className="flex gap-2 border-b border-white/10">
      <button type="button" role="tab" aria-selected={tab === 'details'} aria-controls="metadata-details" className={tabClass(tab === 'details')} onClick={() => setTab('details')}>Prompts ({props.fields.length})</button>
      <button type="button" role="tab" aria-selected={tab === 'assets'} aria-controls="metadata-assets" className={tabClass(tab === 'assets')} onClick={() => setTab('assets')}>Parameters &amp; Assets ({props.parameters.length + props.extras.length + props.assets.length + props.loraRows.length})</button>
    </div>
    <div id="metadata-details" role="tabpanel" hidden={tab !== 'details'} className="space-y-4">
      <GenerationPromptFields fields={props.fields} warning={props.warning} />
    </div>
    <div id="metadata-assets" role="tabpanel" hidden={tab !== 'assets'} className="space-y-4"><Items title="生成時アセット" items={props.assets} />
      <Items title="パラメータ" items={props.parameters} /><Items title="その他" items={props.extras} />
      <section><h4 className="font-semibold">生成時LoRA ({props.loraRows.length})</h4><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{props.loraRows.map((row) => <article key={row.key} className="rounded border border-white/10 p-2">
        <h5 className="font-medium">{row.model}</h5><p className="text-xs text-zinc-400">{row.role}</p>
        <p>適用強度: {row.weight ?? '未記録'}</p><p>モデル強度: {row.modelStrength ?? '未記録'}</p><p>CLIP強度: {row.clipStrength ?? '未記録'}</p>
      </article>)}</div></section>{props.associationPanel}</div>
  </aside>
}
