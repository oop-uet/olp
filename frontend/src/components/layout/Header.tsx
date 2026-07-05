import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import { MenuIcon } from '../ui/Icon'
import { api } from '../../lib/api'

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
  const [studentSections, setStudentSections] = useState<any[]>([])

  useEffect(() => {
    if (user?.role === 'student') {
      api.get('/api/students/sections')
        .then((res) => {
          setStudentSections(res.data ?? [])
        })
        .catch(() => {})
    }
  }, [user])

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
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-card-hover animate-fade-in">
              {/* Styled gray header */}
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                Tài khoản
              </div>
              
              <div className="py-1">
                {user.role === 'student' && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      if (studentSections.length > 0) {
                        navigate(`/student/classes/${studentSections[0].id}/students/${user.id}/profile`)
                      } else {
                        navigate('/student/exercises')
                      }
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                  >
                    <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Trang cá nhân
                  </button>
                )}
                
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/change-password')
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Cập nhật mật khẩu
                </button>
              </div>

              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Thoát
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
