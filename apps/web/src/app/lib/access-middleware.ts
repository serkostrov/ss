/**
 * Access middleware helpers for route guards and programmatic checks.
 */
export {
  assertAuthenticated,
  assertGuest,
  assertRole,
  assertMemberStatus,
  getPostLoginPath,
  resolveAuthProfile,
} from '@features/auth'
export type { AccessState, AccessDecision } from '@features/auth'

export {
  saveIntendedRoute,
  consumeIntendedRoute,
  resolvePostAuthRedirect,
  buildLocationPath,
} from './intended-route'
export type { LoginLocationState } from './intended-route'

export { triggerUnauthorizedRedirect } from './unauthorized-redirect'
