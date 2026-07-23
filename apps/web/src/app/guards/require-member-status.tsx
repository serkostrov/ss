import { Navigate, Outlet } from 'react-router-dom'

import { assertMemberStatus } from '@features/auth'
import type { UserStatus } from '@shared/types'
import { FullPageLoader } from '@shared/ui'

import { useAccessState } from './use-access-state'
import { useAuth } from '@app/providers'

type RequireMemberStatusProps = {
  status: UserStatus
}

export function RequireMemberStatus({ status }: RequireMemberStatusProps) {
  const { isReady, isLoading } = useAuth()
  const access = useAccessState()

  if (!isReady || isLoading) {
    return <FullPageLoader label="Проверка статуса…" />
  }

  const decision = assertMemberStatus(access, status)
  if (!decision.allow) {
    return <Navigate to={decision.redirectTo} replace />
  }

  return <Outlet />
}
