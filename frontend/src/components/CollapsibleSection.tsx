import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}

export const CollapsibleSection = ({
  title,
  defaultOpen = true,
  badge,
  children,
  className = '',
  id,
}: CollapsibleSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#18181C] overflow-hidden ${className}`}>
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors focus:outline-none"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown size={16} className="text-zinc-400" />
          ) : (
            <ChevronRight size={16} className="text-zinc-400" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            {title}
          </span>
        </div>
        {badge && <div>{badge}</div>}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-[rgba(255,255,255,0.04)]">
          {children}
        </div>
      )}
    </div>
  )
}