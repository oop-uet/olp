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
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Blue header area with UET-VNU branding */}
      <div className="bg-primary py-12 text-center">
        <div className="mx-auto max-w-md px-4">
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <span className="text-2xl font-bold text-primary">U</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">UET-VNU</h1>
          </div>
          <p className="text-sm text-primary-100">OOP Learning Platform</p>
        </div>
      </div>

      {/* Login form card */}
      <div className="flex flex-1 items-start justify-center px-4 pt-8">
        <div className="card w-full max-w-md p-8">
          <h2 className="mb-6 text-center text-xl font-semibold text-gray-800">
            Đăng nhập
          </h2>

          {error && (
            <div
              className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="label">
                Tên đăng nhập
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="input"
                placeholder="Nhập tên đăng nhập"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input"
                placeholder="Nhập mật khẩu"
              />
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
              {isLoading ? (
                <>
                  <Spinner />
                  Đang đăng nhập...
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
