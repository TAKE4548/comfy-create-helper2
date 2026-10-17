import { useState, useRef } from 'react'
import { Activity } from 'lucide-react'
import type { GenerationSnapshot } from '../../api/domains/generation'
import type { ManagerStatus } from '../../api/domains/systemManager'
import { systemManagerApi } from '../../api/domains/systemManager'
import { HeaderDropdown } from './header/HeaderDropdown'

export type AggregateSystemStatus = 'READY' | 'OFFLINE' | 'CONNECTING' | 'STUCK' | 'STOPPED'

export interface LocationParts {
  protocol: string
  hostname: string
  pathname: string
  search: string
  hash: string
}

export function buildSwitchUrl(
  targetPort: string,
  loc: LocationParts = typeof window !== 'undefined'
    ? window.location
    : { protocol: 'http:', hostname: 'localhost', pathname: '/', search: '', hash: '' }
): string {
  const portPart = targetPort ? `:${targetPort}` : ''
  return `${loc.protocol}//${loc.hostname}${portPart}${loc.pathname}${loc.search}${loc.hash}`
}

export interface SystemStatusBadgeProps {
  upstream: GenerationSnapshot['upstream'] | null
  reconnecting: boolean
  manager: ManagerStatus | null
  managerAvailable: boolean
  managerLoading?: boolean
  variant?: 'full' | 'slim' | 'dot'
  isDev?: boolean
  currentPort?: string
  backendPort?: string
  comfyPort?: string
  managerPort?: string
  targetProdPort?: string
  targetDevPort?: string
  onNavigate?: (url: string) => void
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
  const [isOpen, setIsOpen] = useState(false)
  const [isActionInFlight, setIsActionInFlight] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const isDev = props.isDev ?? (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DEV : false)
  const currentPort = props.currentPort ?? (typeof window !== 'undefined' ? (window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) : '5173')
  const backendPort = props.backendPort ?? '8000'
  const comfyPort = props.comfyPort ?? '8188'
  const managerPort = props.managerPort ?? '8899'
  const targetProdPort = props.targetProdPort ?? '8000'
  const targetDevPort = props.targetDevPort ?? '5173'

  const feRunning = props.manager?.fe.running ?? false

  const handleStartFrontend = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActionInFlight || !props.managerAvailable) return
    setIsActionInFlight(true)
    try {
      await systemManagerApi.action('start', 'frontend')
    } catch (err) {
      console.error('Failed to start dev server', err)
    } finally {
      setIsActionInFlight(false)
    }
  }

  const handleStopFrontendAndReturn = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isActionInFlight || !props.managerAvailable) return
    setIsActionInFlight(true)
    try {
      await systemManagerApi.action('stop', 'frontend')
      const targetUrl = buildSwitchUrl(targetProdPort)
      if (props.onNavigate) props.onNavigate(targetUrl)
      else if (typeof window !== 'undefined') window.location.assign(targetUrl)
    } catch (err) {
      console.error('Failed to stop dev server', err)
    } finally {
      setIsActionInFlight(false)
    }
  }

  const handleSwitchToDev = (e: React.MouseEvent) => {
    e.stopPropagation()
    const targetUrl = buildSwitchUrl(targetDevPort)
    if (props.onNavigate) props.onNavigate(targetUrl)
    else if (typeof window !== 'undefined') window.location.assign(targetUrl)
  }

  const handleSwitchToProd = (e: React.MouseEvent) => {
    e.stopPropagation()
    const targetUrl = buildSwitchUrl(targetProdPort)
    if (props.onNavigate) props.onNavigate(targetUrl)
    else if (typeof window !== 'undefined') window.location.assign(targetUrl)
  }

  const comfyStatusText = props.manager
    ? `${props.manager.comfy.status}${props.manager.comfy.running ? ' (FastAPI中継 OK)' : ''}`
    : ''
  const details = !props.managerAvailable || !props.manager
    ? 'Manager unavailable'
    : `FE ${props.manager.fe.status} · BE ${props.manager.be.status} · Comfy ${comfyStatusText}`

  const services = [
    {
      name: 'Frontend',
      running: isDev || feRunning,
      status: isDev ? 'running' : (props.manager?.fe.status ?? (feRunning ? 'running' : 'stopped')),
      port: isDev ? currentPort : targetDevPort,
    },
    {
      name: 'FastAPI (BE)',
      running: props.manager?.be.running ?? false,
      status: props.manager?.be.status ?? 'stopped',
      port: backendPort,
    },
    {
      name: 'ComfyUI',
      running: props.manager?.comfy.running ?? false,
      status: props.manager?.comfy.status ?? 'stopped',
      port: comfyPort,
    },
    {
      name: 'Manager',
      running: props.managerAvailable,
      status: props.managerAvailable ? 'running' : 'offline',
      port: managerPort,
    },
  ]

  const dropdown = (
    <HeaderDropdown
      open={isOpen}
      onClose={() => setIsOpen(false)}
      anchorRef={containerRef}
      align="start"
      data-testid="system-status-dropdown"
      className="w-[280px] p-3 rounded-lg border border-zinc-800 bg-surface-1/95 shadow-2xl overscroll-contain text-xs text-zinc-300"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
        <div className="flex items-center gap-1.5 font-medium text-zinc-200">
          <Activity className="w-3.5 h-3.5 text-zinc-400" />
          <span>システム稼働モニタ</span>
        </div>
      </div>

      <div className="space-y-1.5 py-1">
        {services.map((svc) => (
          <div key={svc.name} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-zinc-300 font-medium">{svc.name}</span>
            <span
              data-testid={`service-status-${svc.name}`}
              className={`font-mono text-[11px] text-right ${svc.running ? 'text-green-400' : 'text-zinc-500'}`}
            >
              {svc.running ? `${svc.status} (:${svc.port})` : svc.status}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2.5 border-t border-zinc-800 flex flex-col gap-2">
        {!isDev ? (
          <>
            {!feRunning ? (
              <button
                type="button"
                onClick={handleStartFrontend}
                disabled={isActionInFlight || !props.managerAvailable}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation transition-colors"
              >
                ▶ 開発起動
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSwitchToDev}
                disabled={isActionInFlight}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation transition-colors"
              >
                ⇄ 開発用
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSwitchToProd}
              disabled={isActionInFlight}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation transition-colors"
            >
              ⇄ 本番用
            </button>
            <button
              type="button"
              onClick={handleStopFrontendAndReturn}
              disabled={isActionInFlight || !props.managerAvailable}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation transition-colors"
            >
              ■ 停止して本番へ
            </button>
          </>
        )}
      </div>
    </HeaderDropdown>
  )

  if (variant === 'dot') {
    return (
      <div ref={containerRef} className="relative inline-flex items-center">
        <span
          role="button"
          tabIndex={0}
          data-testid="system-status-badge"
          data-generation-available={String(view.generationAvailable)}
          aria-label={`System ${view.label}; ${details}`}
          title={details}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setIsOpen((prev) => !prev)
            }
          }}
          className={`inline-block shrink-0 w-[7px] h-[7px] rounded-full cursor-pointer touch-manipulation ${dotColors[view.label]}`}
        />
        {dropdown}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5 shrink-0">
      {isDev && (
        <span
          data-testid="dev-port-badge"
          className="inline-flex shrink-0 whitespace-nowrap touch-manipulation items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border border-amber-500/40 bg-amber-500/10 text-amber-300"
        >
          DEV :{currentPort}
        </span>
      )}
      <span
        role="button"
        tabIndex={0}
        data-testid="system-status-badge"
        data-generation-available={String(view.generationAvailable)}
        aria-label={`System ${view.label}; ${details}`}
        title={details}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen((prev) => !prev)
          }
        }}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 cursor-pointer touch-manipulation ${badgeColors[view.label]}`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-80" />
        <span>{view.label}</span>
        {variant === 'full' && props.managerAvailable && props.manager && (
          <span className="hidden border-l border-current/20 pl-1.5 text-[9px] font-normal sm:inline">
            FE {props.manager.fe.status} · BE {props.manager.be.status} · Comfy {props.manager.comfy.status}
          </span>
        )}
      </span>
      {dropdown}
    </div>
  )
}
