import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { registerUnauthorizedHandler } from '@app/lib/unauthorized-redirect'
import { routes } from '@shared/config'
import { notify } from '@shared/lib/notify'
import type { LoginLocationState } from '@app/lib/intended-route'

import { useAuth } from './use-auth'

/** Listens for API 401 and redirects to login with intended route. */
export function UnauthorizedRedirectBridge() {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  useEffect(() => {
    return registerUnauthorizedHandler(({ from }) => {
      void (async () => {
        try {
          await signOut()
        } catch {
          // ignore sign-out errors during forced re-auth
        }

        notify.warning('Сессия истекла. Войдите снова.')
        const state: LoginLocationState = { from }
        navigate(routes.login, { replace: true, state })
      })()
    })
  }, [navigate, signOut])

  return null
}
