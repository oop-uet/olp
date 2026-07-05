import { useState, useRef, useEffect, ComponentType } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, UserRole } from '../../stores/auth.store'
import {
  ExerciseIcon,
  SubmissionIcon,
  ProgressIcon,
  LeaderboardIcon,
  SectionIcon,
  ConfigIcon,
  DashboardIcon,
  TeacherIcon,
  StudentsIcon,
  MenuIcon,
  LogoutIcon,
} from '../ui/Icon'
import { LocalExecutorStatusButton } from '../student/LocalExecutorStatusButton'

interface MenuItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
}

const menusByRole: Record<UserRole, MenuItem[]> = {
  student: [
    { label: 'Bài tập', path: '/student/exercises', icon: ExerciseIcon },
    { label: 'Bài nộp', path: '/student/submissions', icon: SubmissionIcon },
    { label: 'Bảng xếp hạng', path: '/student/leaderboard', icon: LeaderboardIcon },
  ],
  instructor: [
    { label: 'Trang chủ', path: '/instructor/classes', icon: SectionIcon },
    { label: 'Bài Nộp', path: '/instructor/submissions', icon: SubmissionIcon },
    { label: 'Xếp Hạng', path: '/instructor/leaderboard', icon: LeaderboardIcon },
    { label: 'Thống Kê', path: '/instructor/statistic', icon: ProgressIcon },
    { label: 'Kiểm tra mã nguồn', path: '/instructor/plagiarism', icon: ConfigIcon },
  ],
  admin: [
    { label: 'Tổng quan', path: '/admin/dashboard', icon: DashboardIcon },
    { label: 'Giảng viên', path: '/admin/instructors', icon: TeacherIcon },
    { label: 'Sinh viên', path: '/admin/students', icon: StudentsIcon },
    { label: 'Lớp học phần', path: '/admin/sections', icon: SectionIcon },
    { label: 'Bài tập', path: '/admin/exercises', icon: ExerciseIcon },
    { label: 'Cấu hình', path: '/admin/config', icon: ConfigIcon },
  ],
}

const roleLabels: Record<string, string> = {
  student: 'Sinh viên',
  instructor: 'Giảng viên',
  admin: 'Quản trị',
}



/**
 * Top horizontal navigation bar emulating the UET OASIS visual language:
 * teal→green gradient, white text, leaf brand mark, role-based horizontal
 * menu, responsive hamburger, and a user dropdown.
 */
export function TopNav() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!user) return null

  const menuItems = menusByRole[user.role] ?? []
  const displayName = user.fullName || user.username
  const initial = (user.fullName || user.username || '?').charAt(0).toUpperCase()

  const handleLogout = () => {
    setUserMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-white/15 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-white/20'
        : 'text-white/85 hover:bg-white/5 hover:text-white border border-transparent'
    }`

  return (
    <header className="relative bg-gradient-to-r from-primary-800 via-primary-900 to-slate-900 text-white shadow-md border-b border-white/5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
        {/* Brand */}
        <NavLink to="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary shadow-md">
            <svg viewBox="0 0 100 100" className="h-6 w-6 text-white" stroke="currentColor" fill="none" strokeWidth="6">
              <path d="M 48 80 Q 50 48 50 35" strokeWidth="8" />
              <path d="M 50 35 Q 35 30 30 42" strokeWidth="6" />
              <path d="M 50 35 Q 40 20 50 18" strokeWidth="6" />
              <path d="M 50 35 Q 60 20 50 18" strokeWidth="6" />
              <path d="M 50 35 Q 65 30 70 42" strokeWidth="6" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-wide text-white">UET OASIS</span>
        </NavLink>

        {/* Desktop menu */}
        <nav className="hidden flex-1 items-center gap-2 lg:flex ml-8">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.path} to={item.path} className={navLinkClass}>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Right side: user dropdown + mobile hamburger */}
        <div className="flex items-center gap-2">
          {user.role === 'student' && <LocalExecutorStatusButton />}

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full py-1 pl-2 pr-1 transition-colors hover:bg-white/10"
              aria-label="Mở menu người dùng"
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <span className="hidden text-right sm:block">
                <span className="block text-sm font-semibold leading-tight text-white">
                  {displayName}
                </span>
                <span className="block text-xs leading-tight text-white/70">
                  {roleLabels[user.role]}
                </span>
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white ring-1 ring-white/40 shadow-inner">
                {initial}
              </span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-100 bg-white py-1 text-gray-700 shadow-xl ring-1 ring-black/5 animate-fade-in">
                <div className="border-b border-gray-100 px-4 py-3 bg-gray-50/50 rounded-t-xl">
                  <p className="text-sm font-semibold text-gray-800">{displayName}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate('/change-password')
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Đổi mật khẩu
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogoutIcon className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden"
            aria-label="Mở menu điều hướng"
            aria-haspopup="true"
            aria-expanded={mobileOpen}
          >
            <MenuIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <nav className="border-t border-white/10 bg-primary-700 px-4 py-3 lg:hidden shadow-inner">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white/10 text-white border border-white/15'
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </header>
  )
}
