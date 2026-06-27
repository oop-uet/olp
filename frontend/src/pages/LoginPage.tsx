import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { useRedirectStore } from '../stores/redirect.store'
import { getRoleDashboardPath } from '../router/AuthGuard'
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
        setError('Invalid username or password')
      } else if (axiosError.response?.status === 423) {
        setError('Account is temporarily locked')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Blue header area with branding */}
      <div className="bg-primary py-12 text-center">
        <div className="mx-auto max-w-md px-4">
          <div className="mb-3 flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
              <span className="text-xl font-bold text-primary">U</span>
            </div>
            <h1 className="text-2xl font-bold text-white">UET-VNU</h1>
          </div>
          <p className="text-sm text-primary-100">
            OOP Learning Platform
          </p>
        </div>
      </div>

      {/* Login form card */}
      <div className="flex flex-1 items-start justify-center px-4 pt-8">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
          <h2 className="mb-6 text-center text-xl font-semibold text-gray-800">
            Sign in to your account
          </h2>

          {error && (
            <div
              className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
