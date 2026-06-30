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
    <div className="flex min-h-screen items-stretch bg-slate-50 font-sans">
      {/* Left Column: Brand & Info (Hidden on mobile) */}
      <div className="relative hidden w-0 flex-1 items-center justify-center bg-gradient-to-br from-[#002146] via-[#003366] to-[#001833] p-12 text-white lg:flex lg:flex-col lg:max-w-xl xl:max-w-2xl overflow-hidden">
        {/* Decorative Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        {/* Glowing aura */}
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-[#f37021]/10 blur-3xl"></div>
        <div className="absolute -right-20 -bottom-20 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>

        <div className="relative z-10 flex flex-col justify-between h-full w-full max-w-md">
          {/* Top Brand */}
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md p-0.5 ring-2 ring-white/20">
              <img src="/olp/uet-logo.jpg" alt="UET Logo" className="h-full w-full object-cover" />
            </span>
            <div>
              <span className="block text-lg font-bold tracking-wider">UET OASIS</span>
              <span className="block text-xs text-blue-200">Trường Đại học Công nghệ - ĐHQGHN</span>
            </div>
          </div>

          {/* Center Message */}
          <div className="my-auto py-12">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl leading-tight">
              Hệ thống Học và Thực hành <br />
              <span className="bg-gradient-to-r from-[#f37021] to-yellow-500 bg-clip-text text-transparent">Lập trình Hướng đối tượng</span>
            </h1>
            <p className="mt-4 text-base text-blue-100/90 leading-relaxed">
              Trải nghiệm môi trường lập trình OOP Java chuẩn mực của UET, biên dịch và chạy code trực tiếp trên máy tính cá nhân của bạn.
            </p>

            <ul className="mt-8 space-y-4">
              <li className="flex items-center gap-3 text-sm text-blue-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f37021]/20 text-[#f37021] font-bold">✓</span>
                <span>Chạy code cục bộ qua Local Agent cực nhanh</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-blue-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f37021]/20 text-[#f37021] font-bold">✓</span>
                <span>Chế độ toàn màn hình & giám sát chống gian lận</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-blue-200">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f37021]/20 text-[#f37021] font-bold">✓</span>
                <span>Bảng xếp hạng thi đua học tập thời gian thực</span>
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="text-xs text-blue-300">
            © {new Date().getFullYear()} UET-VNU. Đã đăng ký bản quyền.
          </div>
        </div>
      </div>

      {/* Right Column: Login Form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-white relative">
        {/* Subtle grid for mobile */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000002_1px,transparent_1px),linear-gradient(to_bottom,#00000002_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none lg:hidden"></div>
        
        <div className="mx-auto w-full max-w-sm lg:w-96 relative z-10">
          <div className="text-center lg:text-left">
            <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md p-0.5 ring-2 ring-primary/10 lg:hidden mb-4">
              <img src="/olp/uet-logo.jpg" alt="UET Logo" className="h-full w-full object-cover" />
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Đăng nhập hệ thống
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Dành cho Sinh viên, Giảng viên và Quản trị viên
            </p>
          </div>

          <div className="mt-8">
            {error && (
              <div
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm animate-fade-in"
                role="alert"
                aria-live="assertive"
              >
                <div className="flex gap-2">
                  <span className="font-semibold">⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                  Tên đăng nhập / Mã SV
                </label>
                <div className="mt-1">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-[#003366] focus:outline-none focus:ring-1 focus:ring-[#003366] hover:border-slate-400"
                    placeholder="Nhập mã sinh viên hoặc tên đăng nhập"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Mật khẩu
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="block w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 focus:border-[#003366] focus:outline-none focus:ring-1 focus:ring-[#003366] hover:border-slate-400"
                    placeholder="Nhập mật khẩu của bạn"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003366] px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#002146] focus:outline-none focus:ring-2 focus:ring-[#003366] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                >
                  {isLoading ? (
                    <>
                      <Spinner />
                      Đang xác thực...
                    </>
                  ) : (
                    'Đăng nhập'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
