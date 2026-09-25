import { useGenerationStore } from '../../store/useGenerationStore'

/**
 * 使用率に応じたテキストカラークラスを返す
 * - null  → zinc-500 (データなし)
 * - ≥ 95% → red-400  (危険)
 * - ≥ 85% → amber-400 (警告)
 * - それ以外 → zinc-400 (正常)
 */
function getColorClass(pct: number | null): string {
  if (pct === null) return 'text-zinc-500'
  if (pct >= 95) return 'text-red-400'
  if (pct >= 85) return 'text-amber-400'
  return 'text-zinc-400'
}

/**
 * HUD 内の 1 行: ラベル / 詳細 / パーセント
 */
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

/**
 * ResourceGaugeHUD — デスクトップ用リソース使用率 HUD
 *
 * プレビューエリア右上 (absolute top-3 right-3) に重ねて表示する。
 * 親要素は `position: relative` である必要がある。
 */
export function ResourceGaugeHUD() {
  const stats = useGenerationStore(s => s.systemStats)

  return (
    <div className="
      absolute top-3 right-3 z-10
      bg-[#18181C]/80 backdrop-blur-sm
      border border-white/10
      rounded-lg px-3 py-2 space-y-1
      min-w-[160px]
    ">
      <GaugeRow
        label="CPU"
        pct={stats?.cpu_pct ?? null}
        detail={stats ? `${Math.round(stats.cpu_pct)}%` : '--'}
      />
      <GaugeRow
        label="RAM"
        pct={stats?.ram_pct ?? null}
        detail={stats ? `${stats.ram_used_gb}/${stats.ram_total_gb}GB` : '--'}
      />
      <GaugeRow
        label="GPU"
        pct={stats?.gpu_pct ?? null}
        detail={stats?.gpu_pct != null ? `${Math.round(stats.gpu_pct)}%` : '--'}
      />
      <GaugeRow
        label="VRAM"
        pct={stats?.vram_pct ?? null}
        detail={stats?.vram_used_gb != null
          ? `${stats.vram_used_gb}/${stats.vram_total_gb}GB`
          : '--'}
      />
    </div>
  )
}
