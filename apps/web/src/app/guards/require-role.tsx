import { Navigate, Outlet } from 'react-router-dom'

import { assertRole } from '@features/auth'
import type { UserRole } from '@shared/types'
import { FullPageLoader } from '@shared/ui'

import { useAccessState } from './use-access-state'
import { useAuth } from '@app/providers'

type RequireRoleProps = {
  role: UserRole
}

export function RequireRole({ role }: RequireRoleProps) {
  const { isReady, isLoading } = useAuth()
  const access = useAccessState()

  if (!isReady || isLoading) {
    return <FullPageLoader label="Проверка доступа…" />
  }

  const decision = assertRole(access, role)
  if (!decision.allow) {
    return <Navigate to={decision.redirectTo} replace />
  }

  return <Outlet />
}
