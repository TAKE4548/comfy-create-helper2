import { NavLink, Outlet } from 'react-router-dom'
import {
  Zap, Layers, Tag, Clock, Settings,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: Zap, label: 'Generate', id: 'nav-generate' },
  { to: '/loras', icon: Layers, label: 'LoRAs', id: 'nav-loras' },
  { to: '/tags', icon: Tag, label: 'Tags', id: 'nav-tags' },
  { to: '/history', icon: Clock, label: 'History', id: 'nav-history' },
  { to: '/settings', icon: Settings, label: 'Settings', id: 'nav-settings' },
]

export function AppShell() {
  return (
    <div className="flex h-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-16 xl:w-56 bg-surface border-r border-[rgba(255,255,255,0.06)] flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[rgba(255,255,255,0.06)]">
          <div className="w-8 h-8 rounded-lg bg-accent-green flex items-center justify-center flex-shrink-0 glow-green">
            <Zap size={16} className="text-background font-bold" />
          </div>
          <span className="hidden xl:block text-sm font-semibold text-zinc-200 tracking-wide">
            Prompt Surgeon
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 pt-4">
          {navItems.map(({ to, icon: Icon, label, id }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              id={id}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group
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
                  <span className="hidden xl:block text-sm font-medium">{label}</span>
                  {isActive && (
                    <div className="hidden xl:block ml-auto w-1.5 h-1.5 rounded-full bg-accent-green" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Version */}
        <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)]">
          <p className="hidden xl:block text-xs text-zinc-600">v2.0.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-[rgba(255,255,255,0.06)] flex items-center justify-around px-2 pb-safe z-50">
        {navItems.map(({ to, icon: Icon, label, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            id={`${id}-mobile`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 px-3 rounded-lg min-w-0
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
