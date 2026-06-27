import { Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
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

  const isUnauthenticated = !isAuthenticated || !user

  // Save intended destination as a side-effect (not during render) to avoid
  // setState-during-render infinite loops.
  useEffect(() => {
    if (isUnauthenticated) {
      setIntendedDestination(location.pathname + location.search)
    }
  }, [isUnauthenticated, location.pathname, location.search, setIntendedDestination])

  if (isUnauthenticated) {
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
