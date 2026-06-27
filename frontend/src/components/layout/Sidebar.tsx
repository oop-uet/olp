import { NavLink } from 'react-router-dom'
import { ComponentType } from 'react'
import { useAuthStore, UserRole } from '../../stores/auth.store'
import {
  ExerciseIcon,
  SubmissionIcon,
  ProgressIcon,
  LeaderboardIcon,
  SectionIcon,
  ConfigIcon,
  QuotaIcon,
  DashboardIcon,
  TeacherIcon,
  StudentsIcon,
} from '../ui/Icon'

interface MenuItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
}

const menusByRole: Record<UserRole, MenuItem[]> = {
  student: [
    { label: 'Bài tập', path: '/student/exercises', icon: ExerciseIcon },
    { label: 'Bài nộp', path: '/student/submissions', icon: SubmissionIcon },
    { label: 'Tiến độ', path: '/student/progress', icon: ProgressIcon },
  ],
  instructor: [
    { label: 'Quản lý bài tập', path: '/instructor/exercises', icon: ExerciseIcon },
    { label: 'Lớp của tôi', path: '/instructor/classes', icon: SectionIcon },
    { label: 'Chấm bài', path: '/instructor/submissions', icon: SubmissionIcon },
    { label: 'Bảng xếp hạng', path: '/instructor/leaderboard', icon: LeaderboardIcon },
  ],
  admin: [
    { label: 'Tổng quan', path: '/admin/dashboard', icon: DashboardIcon },
    { label: 'Giảng viên', path: '/admin/instructors', icon: TeacherIcon },
    { label: 'Sinh viên', path: '/admin/students', icon: StudentsIcon },
    { label: 'Lớp học phần', path: '/admin/sections', icon: SectionIcon },
    { label: 'Cấu hình', path: '/admin/config', icon: ConfigIcon },
    { label: 'Giám sát Quota', path: '/admin/quota', icon: QuotaIcon },
  ],
}

interface SidebarProps {
  collapsed?: boolean
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

export function Sidebar({ collapsed = false, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { user } = useAuthStore()
  if (!user) return null

  const menuItems = menusByRole[user.role] ?? []

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-primary-600 text-white transition-all duration-200 lg:static lg:translate-x-0 ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-64'
        } w-64 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white font-bold text-primary-600">
            U
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-bold">UET-VNU</p>
              <p className="text-[11px] text-primary-200">OOP Platform</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onCloseMobile}
                    title={item.label}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'text-primary-100 hover:bg-white/10 hover:text-white'
                      } ${collapsed ? 'lg:justify-center' : ''}`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Role footer */}
        {!collapsed && (
          <div className="border-t border-white/10 p-4">
            <p className="text-xs text-primary-200">
              Vai trò:{' '}
              <span className="font-medium capitalize text-white">
                {user.role === 'student' ? 'Sinh viên' : user.role === 'instructor' ? 'Giảng viên' : 'Quản trị'}
              </span>
            </p>
          </div>
        )}
      </aside>
    </>
  )
}
