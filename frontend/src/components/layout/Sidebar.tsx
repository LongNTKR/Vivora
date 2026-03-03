import { NavLink } from 'react-router-dom'
import { MessageSquare, Video, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/library', icon: Video, label: 'Library' },
]

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold">Vivora</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
