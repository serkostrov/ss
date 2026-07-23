import {
  buildLocationPath,
  saveIntendedRoute,
  type LoginLocationState,
} from './intended-route'
import { routes } from '@shared/config'

type UnauthorizedHandler = (payload: { from: string }) => void

let unauthorizedHandler: UnauthorizedHandler | null = null
let redirectInFlight = false

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

/** Call from API/query layer on 401. */
export function triggerUnauthorizedRedirect(from?: string): void {
  if (redirectInFlight) return
  redirectInFlight = true

  const target =
    from && from.length > 0
      ? from
      : buildLocationPath(window.location.pathname, window.location.search, window.location.hash)

  saveIntendedRoute(target)

  if (unauthorizedHandler) {
    unauthorizedHandler({ from: target })
    window.setTimeout(() => {
      redirectInFlight = false
    }, 1000)
    return
  }

  const loginUrl = new URL(routes.login, window.location.origin)
  window.location.assign(loginUrl.toString())
}

export type { LoginLocationState }
