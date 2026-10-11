import { useState, useRef, useEffect } from 'react'
import { useGenerationStore } from '../../../store/useGenerationStore'

function chipColor(pct: number | null, isVram = false): string {
  if (pct === null) return 'text-zinc-500 border-zinc-800'
  if (pct >= 95) return 'text-red-400 border-red-800/50'
  if (pct >= 85) return 'text-amber-400 border-amber-800/50'
  if (isVram) return 'text-purple-400 border-purple-800/50'
  return 'text-zinc-400 border-zinc-800'
}

function StatChip({
  label,
  pct,
  isVram = false,
}: {
  label: string
  pct: number | null
  isVram?: boolean
}) {
  return (
    <span
      className={`
        flex-shrink-0 text-[10px] font-semibold
        px-1.5 py-0.5 rounded border
        bg-surface-2/60
        ${chipColor(pct, isVram)}
      `}
    >
      <span>{label} </span>
      <span className="ux-numeric">{pct !== null ? `${Math.round(pct)}%` : '--%'}</span>
    </span>
  )
}

export function ResourceHoverMonitor(): React.JSX.Element {
  const stats = useGenerationStore((s) => s.systemStats)
  const [isHovered, setIsHovered] = useState(false)
  const [isMobileExpanded, setIsMobileExpanded] = useState(false)
  const mobileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMobileExpanded) return
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setIsMobileExpanded(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
    }
  }, [isMobileExpanded])

  const vramPctText = stats?.vram_pct != null ? `${Math.round(stats.vram_pct)}%` : '--%'
  const vramGbText =
    stats?.vram_used_gb != null && stats?.vram_total_gb != null
      ? `${stats.vram_used_gb.toFixed(1)} / ${stats.vram_total_gb.toFixed(1)} GB`
      : '-- / -- GB'

  const ramPctText = stats?.ram_pct != null ? `${Math.round(stats.ram_pct)}%` : '--%'
  const ramGbText =
    stats?.ram_used_gb != null && stats?.ram_total_gb != null
      ? `${stats.ram_used_gb.toFixed(1)} / ${stats.ram_total_gb.toFixed(1)} GB`
      : '-- / -- GB'

  const mobileRamText =
    stats?.ram_used_gb != null
      ? `${stats.ram_used_gb.toFixed(1)}G`
      : (stats?.ram_pct != null ? `${Math.round(stats.ram_pct)}%` : '--')

  const mobileVramText =
    stats?.vram_used_gb != null
      ? `${stats.vram_used_gb.toFixed(1)}G`
      : (stats?.vram_pct != null ? `${Math.round(stats.vram_pct)}%` : '--')

  return (
    <div
      data-testid="resource-hover-monitor"
      className="relative flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Desktop Chips (CPU -> RAM -> GPU -> VRAM) */}
      <div className="hidden sm:flex items-center gap-1.5 cursor-pointer">
        <StatChip label="CPU" pct={stats?.cpu_pct ?? null} />
        <StatChip label="RAM" pct={stats?.ram_pct ?? null} />
        <StatChip label="GPU" pct={stats?.gpu_pct ?? null} />
        <StatChip label="VRAM" pct={stats?.vram_pct ?? null} isVram />
      </div>

      {/* Desktop Hover Card (Width 250px) */}
      {isHovered && (
        <div
          data-testid="resource-hover-card"
          role="tooltip"
          className="hidden sm:block absolute right-0 top-full mt-1.5 w-[250px] p-3 rounded-lg border border-zinc-800 bg-surface-1/95 backdrop-blur-md shadow-2xl z-50 text-xs text-zinc-300 pointer-events-auto"
        >
          <div className="font-semibold text-zinc-200 mb-2 pb-1 border-b border-zinc-800 flex justify-between items-center">
            <span>リソース詳細</span>
            <span className="text-[10px] text-zinc-500 font-normal">Real-time</span>
          </div>

          {/* VRAM Section */}
          <div className="space-y-1 mb-2.5">
            <div className="flex justify-between items-center">
              <span className="text-purple-300 font-medium">VRAM</span>
              <span className="text-zinc-400 font-mono text-[11px]">{vramGbText} ({vramPctText})</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, stats?.vram_pct ?? 0))}%` }}
              />
            </div>
          </div>

          {/* RAM Section */}
          <div className="space-y-1 mb-2.5">
            <div className="flex justify-between items-center">
              <span className="text-blue-300 font-medium">RAM</span>
              <span className="text-zinc-400 font-mono text-[11px]">{ramGbText} ({ramPctText})</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, stats?.ram_pct ?? 0))}%` }}
              />
            </div>
          </div>

          {/* CPU / GPU Section */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/60 text-[11px]">
            <div>
              <span className="text-zinc-400">CPU: </span>
              <span className="text-zinc-200 font-mono">{stats?.cpu_pct != null ? `${Math.round(stats.cpu_pct)}%` : '--%'}</span>
            </div>
            <div>
              <span className="text-zinc-400">GPU: </span>
              <span className="text-zinc-200 font-mono">{stats?.gpu_pct != null ? `${Math.round(stats.gpu_pct)}%` : '--%'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Pill & Overlay */}
      <div className="sm:hidden relative flex items-center" ref={mobileRef}>
        {!isMobileExpanded ? (
          <button
            type="button"
            data-testid="mobile-vram-pill"
            onClick={() => setIsMobileExpanded(true)}
            className="w-[96px] h-7 px-2 rounded-full border border-purple-800/60 bg-purple-500/10 text-purple-300 text-[10px] font-medium flex items-center justify-between shadow-sm active:scale-95 transition-transform"
            aria-label="リソースモニタ展開"
          >
            <span>VRAM {vramPctText}</span>
            <span className="text-[9px] text-purple-400">◀</span>
          </button>
        ) : (
          <div
            data-testid="mobile-resource-overlay"
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[330px] max-w-[calc(100vw-1.5rem)] h-8 px-2.5 rounded-full border border-zinc-700 bg-surface-1 shadow-2xl z-[80] flex items-center justify-between text-[10px] text-zinc-300 animate-in fade-in slide-in-from-right-4 duration-150"
          >
            <div className="flex items-center gap-1.5 font-mono overflow-x-auto scrollbar-none">
              <span>CPU {stats?.cpu_pct != null ? `${Math.round(stats.cpu_pct)}%` : '--%'}</span>
              <span className="text-zinc-600">|</span>
              <span>RAM {mobileRamText}</span>
              <span className="text-zinc-600">|</span>
              <span>GPU {stats?.gpu_pct != null ? `${Math.round(stats.gpu_pct)}%` : '--%'}</span>
              <span className="text-zinc-600">|</span>
              <span className="text-purple-300 font-medium">VRAM {mobileVramText}</span>
            </div>
            <button
              type="button"
              data-testid="mobile-overlay-close"
              onClick={(e) => {
                e.stopPropagation()
                setIsMobileExpanded(false)
              }}
              className="ml-2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-surface-2 text-zinc-400 hover:text-zinc-200"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}