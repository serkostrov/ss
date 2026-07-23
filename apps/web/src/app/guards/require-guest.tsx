import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers'
import {
  resolvePostAuthRedirect,
  type LoginLocationState,
} from '@app/lib/intended-route'
import { assertGuest } from '@features/auth'
import { FullPageLoader } from '@shared/ui'

import { useAccessState } from './use-access-state'

/** Blocks auth pages for already signed-in users; restores intended route when possible. */
export function RequireGuest() {
  const { isReady, profile } = useAuth()
  const access = useAccessState()
  const location = useLocation()

  if (!isReady) {
    return <FullPageLoader />
  }

  const decision = assertGuest(access)
  if (!decision.allow && profile) {
    const state = location.state as LoginLocationState | null
    const target = resolvePostAuthRedirect(profile, state)
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
