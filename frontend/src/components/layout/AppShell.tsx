import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Zap, Layers, Tag, Clock, Settings, Sparkles,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: Zap, label: 'Generate', id: 'nav-generate' },
  { to: '/studio', icon: Sparkles, label: 'Studio', id: 'nav-studio' },
  { to: '/loras', icon: Layers, label: 'LoRAs', id: 'nav-loras' },
  { to: '/tags', icon: Tag, label: 'Tags', id: 'nav-tags' },
  { to: '/history', icon: Clock, label: 'History', id: 'nav-history' },
  { to: '/settings', icon: Settings, label: 'Settings', id: 'nav-settings' },
]

export function AppShell() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('prompt-surgeon-sidebar-collapsed') === 'true'
  })

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('prompt-surgeon-sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex h-full bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-surface border-r border-[rgba(255,255,255,0.06)] flex-shrink-0 transition-all duration-300 ease-in-out w-14 ${
          isCollapsed ? 'lg:w-16' : 'lg:w-56'
        }`}
      >
        {/* Logo / Header */}
        <div className={`flex items-center px-2 lg:px-4 py-5 border-b border-[rgba(255,255,255,0.06)] ${isCollapsed ? 'lg:justify-center' : 'lg:justify-between justify-center'}`}>
          <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'lg:hidden' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-accent-green flex items-center justify-center flex-shrink-0 glow-green">
              <Zap size={16} className="text-background font-bold" />
            </div>
            {!isCollapsed && (
              <span className="hidden lg:block text-sm font-semibold text-zinc-200 tracking-wide whitespace-nowrap">
                Prompt Surgeon
              </span>
            )}
          </div>
          <button
            onClick={toggleSidebar}
            id="sidebar-toggle"
            className="hidden lg:flex min-h-11 min-w-11 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 focus:outline-none transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Primary navigation" className="flex-1 p-1 lg:p-2 space-y-1 pt-4">
          {navItems.map(({ to, icon: Icon, label, id }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              id={id}
              aria-label={label}
              className={({ isActive }) =>
                `flex min-h-11 min-w-11 items-center justify-center lg:justify-start gap-3 px-0 lg:px-3 py-2.5 rounded-lg transition-all group
                ${isActive
                  ? 'bg-accent-green/10 text-accent-green'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={18}
                    className={`flex-shrink-0 ${isActive ? 'text-accent-green' : 'text-zinc-400 group-hover:text-zinc-200'}`}
                  />
                  <span
                    className={`hidden lg:block text-sm font-medium overflow-hidden whitespace-nowrap transition-all duration-300 ${
                      isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                    }`}
                  >
                    {label}
                  </span>
                  {isActive && !isCollapsed && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-green" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Version */}
        <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-center">
          <p
            className={`text-xs text-zinc-600 overflow-hidden whitespace-nowrap transition-all duration-300 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}
          >
            v2.0.0
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[calc(54px+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 inset-x-0 h-[calc(54px+env(safe-area-inset-bottom))] bg-surface border-t border-[rgba(255,255,255,0.06)] flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom)] z-[var(--z-mobile-nav)]">
        {navItems.map(({ to, icon: Icon, label, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            id={`${id}-mobile`}
            aria-label={label}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 min-h-11 min-w-11 flex-1 px-1 rounded-lg
              ${isActive ? 'text-accent-green' : 'text-zinc-500'}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} className={isActive ? 'text-accent-green' : ''} />
                <span className="text-xs truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
