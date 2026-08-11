import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { clearIntendedRoute } from '@app/lib/intended-route'
import { clearActiveSurface, isBlockedStaff } from '@features/auth'
import { routes } from '@shared/config'
import { notify } from '@shared/lib/notify'

import { useAuth } from './use-auth'

/**
 * Blocked staff must not stay in a session loop (403 ↔ guest redirect).
 * Sign out and send them to the login screen so another account can be used.
 */
export function BlockedStaffRedirectBridge() {
  const navigate = useNavigate()
  const { profile, isAuthenticated, isReady, signOut } = useAuth()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!isReady || !isAuthenticated || !isBlockedStaff(profile) || inFlight.current) {
      return
    }

    inFlight.current = true

    void (async () => {
      try {
        await signOut()
      } catch {
        // ignore — still send user to login
      } finally {
        clearIntendedRoute()
        clearActiveSurface()
        notify.warning('Учётная запись заблокирована. Войдите под другим аккаунтом.')
        navigate(routes.login, { replace: true })
        inFlight.current = false
      }
    })()
  }, [isAuthenticated, isReady, navigate, profile, signOut])

  return null
}
