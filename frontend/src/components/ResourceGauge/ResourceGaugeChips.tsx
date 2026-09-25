import { useGenerationStore } from '../../store/useGenerationStore'

function chipColor(pct: number | null): string {
  if (pct === null) return 'text-zinc-500 border-zinc-800'
  if (pct >= 95) return 'text-red-400 border-red-800/50'
  if (pct >= 85) return 'text-amber-400 border-amber-800/50'
  return 'text-zinc-400 border-zinc-800'
}

function StatChip({ label, pct }: { label: string; pct: number | null }) {
  return (
    <span className={`
      flex-shrink-0 text-[10px] font-mono font-semibold
      px-2 py-0.5 rounded border
      bg-surface-2/60
      ${chipColor(pct)}
    `}>
      {label} {pct !== null ? `${Math.round(pct)}%` : '--'}
    </span>
  )
}

export function ResourceGaugeChips() {
  const stats = useGenerationStore(s => s.systemStats)

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      <StatChip label="CPU" pct={stats?.cpu_pct ?? null} />
      <StatChip label="RAM" pct={stats?.ram_pct ?? null} />
      <StatChip label="GPU" pct={stats?.gpu_pct ?? null} />
      <StatChip label="VRAM" pct={stats?.vram_pct ?? null} />
    </div>
  )
}
