import { useBrowserStorageUsage } from '../../hooks/useBrowserStorageUsage'
import { useGenerationStore } from '../../store/useGenerationStore'
import { formatStorageUsage } from '../../utils/browserStorageUsage'

function getColorClass(pct: number | null): string {
  if (pct === null) return 'text-zinc-500'
  if (pct >= 95) return 'text-red-400'
  if (pct >= 85) return 'text-amber-400'
  return 'text-zinc-400'
}

function GaugeRow({ label, pct, detail }: {
  label: string
  pct: number | null
  detail: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="text-zinc-500 w-8 flex-shrink-0">{label}</span>
      <span className="text-zinc-400 flex-1 truncate">{detail}</span>
      <span className={`font-mono font-bold w-8 text-right ${getColorClass(pct)}`}>
        {pct !== null ? `${Math.round(pct)}%` : '--'}
      </span>
    </div>
  )
}

function UsagePair({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono font-bold ${getColorClass(pct)}`}>
        {pct !== null ? `${Math.round(pct)}%` : '--'}
      </span>
    </div>
  )
}

function StorageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[10px]">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-400">{value}</span>
    </div>
  )
}

function StorageEstimateHelp() {
  return (
    <details className="text-[9px] text-zinc-500">
      <summary className="cursor-pointer select-none">推定使用量の説明</summary>
      <p className="mt-1 max-w-56 leading-relaxed">
        現在のオリジンのlocalStorageと、現在のタブのsessionStorageにあるキーと値を合計した推定値です。キーと値をUTF-16の各2 bytesとして計算しており、実際の保存容量とは異なる場合があります。保存内容は表示しません。
      </p>
    </details>
  )
}

export function ResourceGaugeHUD() {
  const stats = useGenerationStore(s => s.systemStats)
  const storage = useBrowserStorageUsage()

  return (
    <div className="absolute top-3 right-3 z-10 bg-[#18181C]/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 space-y-1 min-w-[160px]">
      <div className="flex items-center justify-between gap-5">
        <UsagePair label="CPU" pct={stats?.cpu_pct ?? null} />
        <UsagePair label="GPU" pct={stats?.gpu_pct ?? null} />
      </div>
      <GaugeRow label="RAM" pct={stats?.ram_pct ?? null} detail={stats ? `${stats.ram_used_gb}/${stats.ram_total_gb}GB` : '--'} />
      <GaugeRow
        label="VRAM"
        pct={stats?.vram_pct ?? null}
        detail={stats?.vram_used_gb != null ? `${stats.vram_used_gb}/${stats.vram_total_gb}GB` : '--'}
      />
      <StorageRow label="localStorage" value={formatStorageUsage(storage.localStorage)} />
      <StorageRow label="sessionStorage" value={formatStorageUsage(storage.sessionStorage)} />
      <StorageEstimateHelp />
    </div>
  )
}
