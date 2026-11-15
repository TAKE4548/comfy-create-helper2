import { Loader2, RefreshCw } from 'lucide-react'
import { useComfyFreeMemory } from '../../../hooks/useComfyFreeMemory'

export interface HeaderFreeMemoryActionProps {
  variant: 'desktop' | 'mobile'
}

export function HeaderFreeMemoryAction({ variant }: HeaderFreeMemoryActionProps): React.JSX.Element {
  const { enabled, reason, pending, feedback, run } = useComfyFreeMemory()
  const isMobile = variant === 'mobile'
  const wrapperClass = isMobile
    ? 'flex flex-col gap-1.5 pt-2 border-t border-white/5'
    : 'flex flex-col gap-1.5 pt-2.5 mt-2.5 border-t border-zinc-800/60'
  const textTone = isMobile ? 'text-zinc-300' : 'text-zinc-400'

  return (
    <div data-testid="resource-free-memory" className={wrapperClass}>
      <button
        type="button"
        data-testid="resource-free-memory-button"
        disabled={!enabled || pending}
        aria-busy={pending}
        onClick={() => { void run() }}
        className="w-full min-h-[44px] touch-manipulation flex items-center justify-center gap-2 px-2 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-200 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 whitespace-nowrap">ComfyUI メモリ解放</span>
      </button>
      {!enabled && !pending && reason && (
        <p data-testid="resource-free-memory-reason" className={`text-[11px] break-words ${textTone}`}>{reason}</p>
      )}
      <p
        data-testid="resource-free-memory-status"
        role="status"
        aria-live="polite"
        className={`text-[11px] break-words ${textTone}`}
      >
        {feedback.message}
      </p>
    </div>
  )
}
