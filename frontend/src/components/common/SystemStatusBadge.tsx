import type { GenerationSnapshot } from '../../api/domains/generation'
import type { ManagerStatus } from '../../api/domains/systemManager'

export type AggregateSystemStatus = 'READY' | 'OFFLINE' | 'CONNECTING' | 'STUCK' | 'STOPPED'

export interface SystemStatusBadgeProps {
  upstream: GenerationSnapshot['upstream'] | null
  reconnecting: boolean
  manager: ManagerStatus | null
  managerAvailable: boolean
  managerLoading?: boolean
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

export function SystemStatusBadge(props: SystemStatusBadgeProps): React.JSX.Element {
  const view = resolveSystemStatus(props)
  const details = !props.managerAvailable || !props.manager
    ? 'Manager unavailable'
    : `FE ${props.manager.fe.status} / BE ${props.manager.be.status} / Comfy ${props.manager.comfy.status}`

  return (
    <span
      data-testid="system-status-badge"
      data-generation-available={String(view.generationAvailable)}
      aria-label={`System ${view.label}; ${details}`}
      title={details}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${badgeColors[view.label]}`}
    >
      <span>{view.label}</span>
      {props.managerAvailable && props.manager && (
        <span className="hidden border-l border-current/20 pl-1.5 text-[9px] font-normal sm:inline">
          FE {props.manager.fe.status} · BE {props.manager.be.status} · Comfy {props.manager.comfy.status}
        </span>
      )}
    </span>
  )
}
