import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers'
import {
  buildLocationPath,
  saveIntendedRoute,
  type LoginLocationState,
} from '@app/lib/intended-route'
import { assertAuthenticated } from '@features/auth'
import { routes } from '@shared/config'
import { FullPageLoader } from '@shared/ui'

import { useAccessState } from './use-access-state'

export function RequireAuth() {
  const { isReady, isLoading } = useAuth()
  const access = useAccessState()
  const location = useLocation()

  if (!isReady || isLoading) {
    return <FullPageLoader label="Проверка сессии…" />
  }

  const decision = assertAuthenticated(access)
  if (!decision.allow) {
    const from = buildLocationPath(location.pathname, location.search, location.hash)
    saveIntendedRoute(from)

    const state: LoginLocationState = { from }
    return <Navigate to={routes.login} replace state={state} />
  }

  return <Outlet />
}
