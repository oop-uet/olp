import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
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
    <div className="flex min-h-screen items-center justify-center bg-[#eef2f5] p-4 font-sans">
      {/* Outer Card with subtle glow */}
      <div className="w-full max-w-4xl rounded-2xl bg-white p-8 shadow-[0_10px_25px_rgba(79,129,189,0.15)] border border-slate-100 flex flex-col gap-8">
        
        {/* FIT UET Header Panel */}
        <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
          <div className="flex h-12 w-12 items-center justify-center bg-[#003366] text-white font-bold rounded-lg shrink-0">
            <span className="text-xs tracking-tighter">FIT UET</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-wide uppercase leading-snug">
              KHOA CÔNG NGHỆ THÔNG TIN
            </h1>
            <p className="text-xs font-semibold text-slate-400">
              Trường Đại học Công nghệ – Đại học Quốc gia Hà Nội
            </p>
          </div>
        </div>

        {/* Form and Image Body Split */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center py-4">
          
          {/* Left illustration: Laptop & green circle icon */}
          <div className="flex flex-col items-center justify-center text-center gap-6 md:border-r md:border-slate-100 md:pr-8">
            <div className="relative flex items-center justify-center h-48 w-48 rounded-full bg-slate-50 border border-slate-100 shadow-inner">
              {/* SVG Laptop with Green circular Palm Tree Logo */}
              <svg viewBox="0 0 100 100" className="h-32 w-32">
                {/* Base Laptop */}
                <rect x="25" y="32" width="50" height="34" rx="2" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
                <rect x="28" y="35" width="44" height="28" fill="#1f2937" />
                {/* Screen reflection/decoration */}
                <path d="M 68 35 L 72 35 L 56 63 L 52 63 Z" fill="#ffffff" fillOpacity="0.05" />
                {/* Green Logo on Laptop Screen */}
                <circle cx="50" cy="49" r="10" fill="#00a65a" />
                {/* Tiny Palm Tree sketch inside logo */}
                <path d="M 48 55 Q 49 48 49 45 M 52 55 Q 51 48 51 45" stroke="#ffffff" strokeWidth="0.8" fill="none" />
                <path d="M 49 45 Q 43 42 41 46 M 49 45 Q 45 39 50 38 M 51 45 Q 55 39 50 38 M 51 45 Q 57 42 59 46" stroke="#ffffff" strokeWidth="0.8" fill="none" />
                {/* Laptop bottom bar */}
                <path d="M 18 66 L 82 66 L 80 69 L 20 69 Z" fill="#9ca3af" />
                <rect x="42" y="66" width="16" height="1" fill="#4b5563" />
                {/* Floating shapes */}
                <circle cx="20" cy="25" r="4" stroke="#00bcd4" strokeWidth="1" fill="none" />
                <polygon points="85,30 91,24 93,31" stroke="#8bc34a" strokeWidth="1" fill="none" />
                <polygon points="18,78 24,70 14,72" stroke="#8bc34a" strokeWidth="1" fill="none" />
                <circle cx="80" cy="75" r="3.5" stroke="#00bcd4" strokeWidth="1.2" fill="none" />
              </svg>
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-sm font-semibold text-slate-600 leading-snug">
                Hệ thống hỗ trợ dạy và học môn
              </p>
              <p className="text-sm font-bold text-slate-800 leading-snug">
                Lập trình hướng đối tượng
              </p>
            </div>
          </div>

          {/* Right Section: Form login */}
          <div className="flex flex-col gap-6 px-2">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                UET<span className="text-[#00a2e8] ml-0.5">OASIS</span>
              </h2>
              <p className="text-xs text-slate-500 font-semibold">
                Sử dụng tài khoản bạn được cung cấp
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3.5 text-xs font-semibold text-red-600 shadow-sm animate-fade-in">
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Account / Username */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  {/* User Icon */}
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
                  className="block w-full rounded-full bg-[#f1f3f5] border border-transparent px-4 py-3 pl-11 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-inner transition-all focus:bg-white focus:border-[#4f81bd] focus:outline-none focus:ring-1 focus:ring-[#4f81bd]"
                  placeholder="Tài khoản"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  {/* Lock Icon */}
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
                  className="block w-full rounded-full bg-[#f1f3f5] border border-transparent px-4 py-3 pl-11 text-sm font-medium text-slate-800 placeholder-slate-400 shadow-inner transition-all focus:bg-white focus:border-[#4f81bd] focus:outline-none focus:ring-1 focus:ring-[#4f81bd]"
                  placeholder="Mật khẩu"
                />
              </div>

              {/* Action Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#00bcd4] to-[#4f81bd] py-3 text-sm font-bold text-white shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#4f81bd] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Spinner /> ĐANG XÁC THỰC...
                    </>
                  ) : (
                    'ĐANG NHẬP'
                  )}
                </button>
              </div>
            </form>

            <div className="text-center">
              <a
                href="#/help"
                className="text-xs font-bold text-[#00bcd4] hover:text-[#4f81bd] transition-colors leading-relaxed block"
              >
                Hướng dẫn sử dụng dành<br />cho sinh viên
              </a>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
