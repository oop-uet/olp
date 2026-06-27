import { NavLink } from 'react-router-dom'
import { useAuthStore, UserRole } from '../../stores/auth.store'

interface MenuItem {
  label: string
  path: string
  icon: string
}

const menusByRole: Record<UserRole, MenuItem[]> = {
  student: [
    { label: 'Exercises', path: '/student/exercises', icon: '📝' },
    { label: 'Submissions', path: '/student/submissions', icon: '📤' },
    { label: 'Progress', path: '/student/progress', icon: '📊' },
  ],
  instructor: [
    { label: 'Exercise Manager', path: '/instructor/exercises', icon: '📋' },
    { label: 'Submissions', path: '/instructor/submissions', icon: '📥' },
    { label: 'Leaderboard', path: '/instructor/leaderboard', icon: '🏆' },
  ],
  admin: [
    { label: 'Sections', path: '/admin/sections', icon: '🏫' },
    { label: 'Configuration', path: '/admin/config', icon: '⚙️' },
    { label: 'Quota Monitor', path: '/admin/quota', icon: '📈' },
  ],
}

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { user } = useAuthStore()

  if (!user) return null

  const menuItems = menusByRole[user.role] ?? []

  return (
    <aside
      className={`flex h-screen flex-col bg-primary text-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo area */}
      <div className="flex h-16 items-center justify-center border-b border-primary-400 px-3">
        {collapsed ? (
          <span className="text-lg font-bold">U</span>
        ) : (
          <span className="text-sm font-bold tracking-wide">UET-VNU OOP</span>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-b border-primary-400 text-primary-200 hover:bg-primary-400 hover:text-white"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '▶' : '◀'}
      </button>

      {/* Navigation links */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-400 text-white font-medium'
                      : 'text-primary-100 hover:bg-primary-600 hover:text-white'
                  }`
                }
                title={item.label}
              >
                <span className="text-base">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Role indicator at bottom */}
      {!collapsed && (
        <div className="border-t border-primary-400 p-3">
          <p className="text-xs text-primary-200">
            Role: <span className="capitalize text-white">{user.role}</span>
          </p>
        </div>
      )}
    </aside>
  )
}
