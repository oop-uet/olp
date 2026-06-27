import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { getRoleDashboardPath } from '../router/AuthGuard'
import { Spinner } from '../components/ui'

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const { user, login: updateAuth } = useAuthStore()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }

    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại')
      return
    }

    setIsLoading(true)

    try {
      await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      })

      // Update local state to clear mustChangePassword
      if (user) {
        const { accessToken, refreshToken } = useAuthStore.getState()
        if (accessToken && refreshToken) {
          updateAuth(accessToken, refreshToken, { ...user, mustChangePassword: false })
        }
      }

      // Redirect to dashboard
      const dashPath = user ? getRoleDashboardPath(user.role) : '/'
      navigate(dashPath, { replace: true })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setError(axiosErr?.response?.data?.error?.message || 'Đổi mật khẩu thất bại. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-gray-900">Đổi mật khẩu</h1>
          <p className="mt-2 text-sm text-gray-600">
            Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống.
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="label">
              Mật khẩu hiện tại
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="input"
              placeholder="Nhập mật khẩu hiện tại (MSSV)"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="label">
              Mật khẩu mới
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="input"
              placeholder="Ít nhất 6 ký tự"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="label">
              Xác nhận mật khẩu mới
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="input"
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full">
            {isLoading ? (
              <>
                <Spinner />
                Đang xử lý...
              </>
            ) : (
              'Đổi mật khẩu'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
