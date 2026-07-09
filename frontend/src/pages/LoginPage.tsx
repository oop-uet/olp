import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, cachedGet } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { useRedirectStore } from '../stores/redirect.store'
import { getRoleDashboardPath } from '../router/AuthGuard'
import { Spinner } from '../components/ui'
import { AxiosError } from 'axios'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const clearIntendedDestination = useRedirectStore((s) => s.clearIntendedDestination)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await api.post('/api/auth/login', { username, password })
      const { accessToken, refreshToken, user } = response.data

      login(accessToken, refreshToken, user)

      const intendedDestination = clearIntendedDestination()
      const redirectPath = intendedDestination || getRoleDashboardPath(user.role)
      prefetchAfterLogin(user.role)
      navigate(redirectPath, { replace: true })
    } catch (err) {
      const axiosError = err as AxiosError
      if (axiosError.response?.status === 401) {
        setError('Tên đăng nhập hoặc mật khẩu không đúng')
      } else if (axiosError.response?.status === 423) {
        setError('Tài khoản đang tạm thời bị khóa')
      } else {
        setError('Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans">
      {/* Outer Split Card */}
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl border border-slate-100 flex flex-col md:flex-row overflow-hidden min-h-[500px]">
        
        {/* Left panel with UET premium gradient */}
        <div className="w-full md:w-1/2 bg-gradient-to-br from-teal-600 via-cyan-600 to-blue-600 p-12 text-white flex flex-col justify-between items-center text-center select-none relative">
          {/* Decorative blurs */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 blur-lg" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl" />

          {/* Header: UET Logo */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center bg-white rounded-xl shadow-inner overflow-hidden p-1 select-none">
              <img
                src={`${import.meta.env.BASE_URL}logo-final.png`}
                alt="UET Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="space-y-1">
              <h1 className="text-sm font-black tracking-wider uppercase text-white leading-tight">
                KHOA CÔNG NGHỆ THÔNG TIN
              </h1>
              <p className="text-[10px] font-semibold text-white/70">
                Đại học Công nghệ – ĐHQGHN
              </p>
            </div>
          </div>

          {/* Screen Leaf Illustration */}
          <div className="relative flex items-center justify-center h-44 w-44 rounded-full bg-white/10 border border-white/20 shadow-inner my-6">
            <svg viewBox="0 0 100 100" className="h-28 w-28 text-white">
              {/* Screen outer */}
              <rect x="25" y="32" width="50" height="34" rx="2" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <rect x="29" y="36" width="42" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" />
              {/* Secondary Leaf circle indicator */}
              <circle cx="50" cy="49" r="7" fill="currentColor" className="text-white/30" />
              {/* Stand */}
              <path d="M 18 66 L 82 66 L 80 69 L 20 69 Z" fill="currentColor" />
              {/* Floating tech shapes */}
              <circle cx="20" cy="25" r="3" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <polygon points="85,30 90,25 92,31" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <circle cx="80" cy="75" r="3" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </div>

          {/* Footer Text */}
          <div className="space-y-1 max-w-xs">
            <p className="text-xs font-bold text-white/80 leading-relaxed">
              Hệ thống hỗ trợ giảng dạy và thực hành
            </p>
            <p className="text-sm font-black text-white uppercase tracking-wide">
              Lập trình hướng đối tượng
            </p>
          </div>
        </div>

        {/* Right Section: Form login */}
        <div className="w-full md:w-1/2 p-12 flex flex-col justify-center gap-6 bg-white">
          <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-1">
              UET<span className="text-[#f37021] font-black">OASIS</span>
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              Đăng nhập hệ thống
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600 shadow-sm animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account / Username */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 pl-11 text-xs font-bold text-slate-800 placeholder-slate-400 transition-all focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/10 hover:border-slate-300"
                placeholder="Tên đăng nhập hoặc MSSV"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 pl-11 text-xs font-bold text-slate-800 placeholder-slate-400 transition-all focus:bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/10 hover:border-slate-300"
                placeholder="Mật khẩu"
              />
            </div>

            {/* Action Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 py-3 text-xs font-bold text-white shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Spinner className="h-3.5 w-3.5" /> ĐANG XÁC THỰC...
                  </>
                ) : (
                  'ĐĂNG NHẬP'
                )}
              </button>
            </div>
          </form>

          <div className="text-center pt-2">
            <Link
              to="/help"
              className="text-xs font-bold text-teal-600 hover:text-teal-700 transition-colors leading-relaxed block"
            >
              Hướng dẫn sử dụng dành cho sinh viên
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function prefetchAfterLogin(role: 'student' | 'instructor' | 'admin') {
  const run = () => {
    if (role === 'student') {
      void Promise.all([
        cachedGet('/api/students/sections'),
        cachedGet('/api/students/exercises'),
        import('./student/StudentCourseDetailPage'),
      ]).catch(() => undefined)
      return
    }

    if (role === 'instructor') {
      void Promise.all([
        cachedGet('/api/instructor/sections'),
        cachedGet('/api/exercises', undefined, { ttlMs: 60_000 }),
        import('./instructor/ExerciseManagerPage'),
      ]).catch(() => undefined)
      return
    }

    void Promise.all([
      cachedGet('/api/admin/stats', undefined, { ttlMs: 30_000 }),
      import('./admin/DashboardPage'),
    ]).catch(() => undefined)
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2000 })
  } else {
    globalThis.setTimeout(run, 500)
  }
}
