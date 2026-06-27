import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import { getRoleDashboardPath } from './AuthGuard'

/**
 * Redirects the root path `/` to the appropriate dashboard based on user role.
 * If not authenticated, redirects to login.
 */
export function RoleRedirect() {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={getRoleDashboardPath(user.role)} replace />
}
