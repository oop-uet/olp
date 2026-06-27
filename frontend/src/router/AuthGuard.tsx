import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, UserRole } from '../stores/auth.store'
import { useRedirectStore } from '../stores/redirect.store'

interface AuthGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { isAuthenticated, user } = useAuthStore()
  const { setIntendedDestination } = useRedirectStore()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    // Save the intended destination before redirecting to login
    setIntendedDestination(location.pathname + location.search)
    return <Navigate to="/login" replace />
  }

  // Force password change on first login
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // User is authenticated but doesn't have the required role
    // Redirect to their own dashboard
    return <Navigate to={getRoleDashboardPath(user.role)} replace />
  }

  return <>{children}</>
}

export function getRoleDashboardPath(role: UserRole): string {
  switch (role) {
    case 'student':
      return '/student/exercises'
    case 'instructor':
      return '/instructor/exercises'
    case 'admin':
      return '/admin/sections'
  }
}
