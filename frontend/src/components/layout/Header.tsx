import { useAuthStore } from '../../stores/auth.store'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  /** Optional page title to display in the header */
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 items-center justify-between bg-primary px-6 text-white shadow-md">
      {/* Page title area */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{title ?? 'OOP Learning Platform'}</h1>
      </div>

      {/* User info and logout */}
      <div className="flex items-center gap-4">
        {user && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm">{user.username}</span>
              <span className="rounded-full bg-primary-400 px-2 py-0.5 text-xs capitalize">
                {user.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md border border-primary-200 px-3 py-1 text-sm text-primary-100 transition-colors hover:bg-primary-400 hover:text-white"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </header>
  )
}
