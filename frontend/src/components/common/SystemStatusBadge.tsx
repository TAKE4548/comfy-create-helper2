import type { GenerationSnapshot } from '../../api/domains/generation'
import type { ManagerStatus } from '../../api/domains/systemManager'

export type AggregateSystemStatus = 'READY' | 'OFFLINE' | 'CONNECTING' | 'STUCK' | 'STOPPED'

export interface SystemStatusBadgeProps {
  upstream: GenerationSnapshot['upstream'] | null
  reconnecting: boolean
  manager: ManagerStatus | null
  managerAvailable: boolean
  managerLoading?: boolean
  variant?: 'full' | 'slim' | 'dot'
}

export interface SystemStatusView {
  label: AggregateSystemStatus
  generationAvailable: boolean
}

export function resolveSystemStatus({
  upstream,
  reconnecting,
  manager,
  managerAvailable,
  managerLoading = false,
}: SystemStatusBadgeProps): SystemStatusView {
  const generationAvailable = upstream?.http_ready === true
  if (managerLoading) return { label: 'CONNECTING', generationAvailable }
  if (!managerAvailable) return { label: 'OFFLINE', generationAvailable }
  if (!manager || !manager.be.running) return { label: 'CONNECTING', generationAvailable }

  const action = manager.action_in_progress
  const service = action?.service.toLowerCase()
  const actionName = action?.action.toLowerCase()
  if ((service === 'backend' || service === 'be' || service === 'comfy') &&
      (actionName === 'start' || actionName === 'restart' || actionName === 'reboot-service')) {
    return { label: 'CONNECTING', generationAvailable }
  }

  if (!manager.comfy.running) return { label: 'STOPPED', generationAvailable }

  if (upstream?.http_ready === false && upstream.failure_since !== null) {
    const failureStartedAt = Date.parse(upstream.failure_since)
    if (Number.isFinite(failureStartedAt) && Date.now() - failureStartedAt > 30_000) {
      return { label: 'STUCK', generationAvailable }
    }
  }

  if (reconnecting || !upstream || !upstream.http_ready || !upstream.ws_connected) {
    return { label: 'CONNECTING', generationAvailable }
  }
  return { label: 'READY', generationAvailable }
}

const badgeColors: Record<AggregateSystemStatus, string> = {
  READY: 'border-green-500/30 bg-green-500/10 text-green-300',
  OFFLINE: 'border-red-500/30 bg-red-500/10 text-red-300',
  CONNECTING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  STUCK: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  STOPPED: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
}

const dotColors: Record<AggregateSystemStatus, string> = {
  READY: 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]',
  OFFLINE: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]',
  CONNECTING: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]',
  STUCK: 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)]',
  STOPPED: 'bg-zinc-500',
}

export function SystemStatusBadge(props: SystemStatusBadgeProps): React.JSX.Element {
  const { variant = 'slim' } = props
  const view = resolveSystemStatus(props)
  const comfyStatusText = props.manager
    ? `${props.manager.comfy.status}${props.manager.comfy.running ? ' (FastAPI中継 OK)' : ''}`
    : ''
  const details = !props.managerAvailable || !props.manager
    ? 'Manager unavailable'
    : `FE ${props.manager.fe.status} · BE ${props.manager.be.status} · Comfy ${comfyStatusText}`

  if (variant === 'dot') {
    return (
      <span
        data-testid="system-status-badge"
        data-generation-available={String(view.generationAvailable)}
        aria-label={`System ${view.label}; ${details}`}
        title={details}
        className={`inline-block shrink-0 w-[7px] h-[7px] rounded-full ${dotColors[view.label]}`}
      />
    )
  }

  return (
    <span
      data-testid="system-status-badge"
      data-generation-available={String(view.generationAvailable)}
      aria-label={`System ${view.label}; ${details}`}
      title={details}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${badgeColors[view.label]}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      <span>{view.label}</span>
      {variant === 'full' && props.managerAvailable && props.manager && (
        <span className="hidden border-l border-current/20 pl-1.5 text-[9px] font-normal sm:inline">
          FE {props.manager.fe.status} · BE {props.manager.be.status} · Comfy {props.manager.comfy.status}
        </span>
      )}
    </span>
  )
}
