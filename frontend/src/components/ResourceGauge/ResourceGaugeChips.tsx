import { useGenerationStore } from '../../store/useGenerationStore'
import { useBrowserStorageUsage } from '../../hooks/useBrowserStorageUsage'
import { formatStorageUsage } from '../../utils/browserStorageUsage'

function chipColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500 border-zinc-800'
  if (pct >= 95) return 'text-red-400 border-red-800/50'
  if (pct >= 85) return 'text-amber-400 border-amber-800/50'
  return 'text-zinc-400 border-zinc-800'
}

function StatChip({ label, pct }: { label: string; pct: number | null }) {
  return (
    <span className={`
      flex-shrink-0 text-[10px] font-semibold
      px-2 py-0.5 rounded border
      bg-surface-2/60
      ${chipColor(pct)}
    `}>
      <span>{label} </span>
      <span className="ux-numeric">{pct !== null ? `${Math.round(pct)}%` : '--'}</span>
    </span>
  )
}

export function ResourceGaugeChips() {
  const stats = useGenerationStore(s => s.systemStats)
  const storage = useBrowserStorageUsage()

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
        <StatChip label="CPU" pct={stats?.cpu_pct ?? null} />
        <StatChip label="RAM" pct={stats?.ram_pct ?? null} />
        <StatChip label="GPU" pct={stats?.gpu_pct ?? null} />
        <StatChip label="VRAM" pct={stats?.vram_pct ?? null} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="flex-shrink-0 rounded border border-zinc-800 bg-surface-2/60 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
          localStorage {formatStorageUsage(storage.localStorage)}
        </span>
        <span className="flex-shrink-0 rounded border border-zinc-800 bg-surface-2/60 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
          sessionStorage {formatStorageUsage(storage.sessionStorage)}
        </span>
      </div>
      <details className="text-[9px] text-zinc-500">
        <summary className="cursor-pointer select-none">推定使用量の説明</summary>
        <p className="mt-1 leading-relaxed">
          現在のオリジンのlocalStorageと、現在のタブのsessionStorageにあるキーと値を合計した推定値です。キーと値をUTF-16の各2 bytesとして計算しており、実際の保存容量とは異なる場合があります。保存内容は表示しません。
        </p>
      </details>
    </div>
  )
}
