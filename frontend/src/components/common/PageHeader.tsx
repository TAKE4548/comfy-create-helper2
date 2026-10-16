import { useEffect, useState, type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { useGenerationStore } from '../../store/useGenerationStore'
import { useManagerStatus } from '../../hooks/useManagerStatus'
import { SystemStatusBadge } from './SystemStatusBadge'
import { ResourceHoverMonitor } from './header/ResourceHoverMonitor'
import { HeaderKebabMenu } from './header/HeaderKebabMenu'

export interface PageHeaderProps {
  title: string
  icon?: LucideIcon
  badge?: ReactNode
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
  hideRightCluster?: boolean
}

export function PageHeader({
  title,
  icon: Icon,
  badge,
  subtitle,
  actions,
  children,
  className = '',
  hideRightCluster = false,
}: PageHeaderProps) {
  const upstream = useGenerationStore((state) => state.generationSnapshot?.upstream ?? null)
  const isConnected = useGenerationStore((state) => state.isConnected)
  const generationSyncing = useGenerationStore((state) => state.generationSyncing)
  const managerStatus = useManagerStatus()
  const [managerLoading, setManagerLoading] = useState(true)

  useEffect(() => {
    let active = true
    if (managerStatus.available || managerStatus.status !== null) {
      setManagerLoading(false)
      return () => { active = false }
    }
    void managerStatus.refetch().finally(() => {
      if (active) setManagerLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <div data-page-header-root="" className={`w-full border-b border-[rgba(255,255,255,0.06)] bg-surface ${className}`}>
      <div className="flex flex-wrap md:flex-nowrap items-center min-h-[50px] px-4 md:px-5">
        {/* Left Cluster */}
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <Icon size={16} className="text-zinc-400 flex-shrink-0" />}
          <h1 className="text-sm font-semibold text-zinc-200 truncate md:whitespace-nowrap">{title}</h1>
          <div className="hidden md:inline-flex">
            <SystemStatusBadge
              upstream={upstream}
              reconnecting={!isConnected || generationSyncing}
              manager={managerStatus.status}
              managerAvailable={managerStatus.available}
              managerLoading={managerLoading}
              variant="slim"
            />
          </div>
          <div className="inline-block md:hidden">
            <SystemStatusBadge
              upstream={upstream}
              reconnecting={!isConnected || generationSyncing}
              manager={managerStatus.status}
              managerAvailable={managerStatus.available}
              managerLoading={managerLoading}
              variant="dot"
            />
          </div>
          {badge}
          {actions && (
            <div className="hidden md:block w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />
          )}
        </div>

        {/* Actions: on desktop in-line after left cluster, on mobile wraps to row 2 */}
        {actions && (
          <div className="w-full md:w-auto order-last md:order-none overflow-x-auto scrollbar-none flex items-center gap-2 py-1.5 md:py-0 border-t md:border-t-0 border-[rgba(255,255,255,0.04)] md:ml-2">
            {actions}
          </div>
        )}

        {/* Right Cluster */}
        {!hideRightCluster && (
          <div className="ml-auto flex items-center gap-2 md:gap-2.5 shrink-0 py-2 md:py-0">
            <ResourceHoverMonitor />
            <div className="hidden md:block w-px h-4 bg-white/10 shrink-0" aria-hidden="true" />
            <HeaderKebabMenu />
          </div>
        )}
      </div>
      {subtitle && <p className="px-4 md:px-5 pb-2 text-xs text-zinc-400">{subtitle}</p>}
      {children}
    </div>
  )
}
