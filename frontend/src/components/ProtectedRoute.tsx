import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { useAuth } from '../context/AuthContext'
import type { UserType } from '../types/auth'

type ProtectedRouteProps = {
  requiredUserType?: UserType
}

export function ProtectedRoute({ requiredUserType }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingState label="Restoring your session" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredUserType && user?.user_type !== requiredUserType) {
    return (
      <ErrorState
        title="Access restricted"
        description="This area is available to organizer accounts only."
      />
    )
  }

  return <Outlet />
}
