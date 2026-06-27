import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { MenuIcon, LogoutIcon } from '../ui/Icon'

interface HeaderProps {
  onToggleSidebar?: () => void
  onToggleMobile?: () => void
}

const roleLabels: Record<string, string> = {
  student: 'Sinh viên',
  instructor: 'Giảng viên',
  admin: 'Quản trị',
}

export function Header({ onToggleSidebar, onToggleMobile }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const initial = (user?.fullName || user?.username || '?').charAt(0).toUpperCase()

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      {/* Left: sidebar toggles */}
      <div className="flex items-center gap-2">
        {/* Mobile menu button */}
        <button
          onClick={onToggleMobile}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          aria-label="Mở menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        {/* Desktop collapse button */}
        <button
          onClick={onToggleSidebar}
          className="hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:block"
          aria-label="Thu gọn menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold text-gray-800">OOP Learning Platform</h1>
      </div>

      {/* Right: user menu */}
      {user && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight text-gray-800">
                {user.fullName || user.username}
              </p>
              <p className="text-xs leading-tight text-gray-500">{roleLabels[user.role]}</p>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-card-hover animate-fade-in">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{user.fullName || user.username}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/change-password')
                }}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Đổi mật khẩu
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
              >
                <LogoutIcon className="h-4 w-4" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
