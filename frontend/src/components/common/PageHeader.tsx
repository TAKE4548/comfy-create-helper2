import React, { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

export interface PageHeaderProps {
  title: string
  icon?: LucideIcon
  badge?: ReactNode
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  icon: Icon,
  badge,
  subtitle,
  actions,
  children,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`border-b border-[rgba(255,255,255,0.06)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-5 py-3 sm:py-4">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={17} className="text-zinc-400 flex-shrink-0" />}
          <h1 className="text-base font-semibold text-zinc-200 truncate">{title}</h1>
          {badge}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {subtitle && (
        <p className="px-4 sm:px-5 pb-3 text-xs text-zinc-400 -mt-1">{subtitle}</p>
      )}

      {children}
    </div>
  )
}
