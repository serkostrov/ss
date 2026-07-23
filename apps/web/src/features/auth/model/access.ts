import type { AuthProfile, User } from '@shared/api'
import { routes } from '@shared/config'
import type { UserRole, UserStatus } from '@shared/types'

export type AccessState = {
  isAuthenticated: boolean
  role: UserRole | null
  status: UserStatus | null
  profile: AuthProfile | null
}

export type AccessDecision =
  | { allow: true }
  | { allow: false; redirectTo: string; reason: string }

function isRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'member'
}

function isStatus(value: unknown): value is UserStatus {
  return value === 'pending' || value === 'confirmed' || value === 'blocked'
}

/** Build effective profile from DB row or auth metadata fallback. */
export function resolveAuthProfile(user: User, dbProfile: AuthProfile | null): AuthProfile {
  if (dbProfile) {
    return dbProfile
  }

  const appRole = user.app_metadata?.role
  const metaStatus = user.user_metadata?.status
  const metaName = user.user_metadata?.full_name

  return {
    id: user.id,
    email: user.email ?? null,
    role: isRole(appRole) ? appRole : 'member',
    status: isStatus(metaStatus) ? metaStatus : 'pending',
    representativeId: null,
    fullName: typeof metaName === 'string' ? metaName : null,
    companyNameHint:
      typeof user.user_metadata?.company_name_hint === 'string'
        ? user.user_metadata.company_name_hint
        : null,
    companyInnHint:
      typeof user.user_metadata?.company_inn_hint === 'string'
        ? user.user_metadata.company_inn_hint
        : null,
    staffPosition: null,
    isCeo: false,
    canManageWorkGroups: false,
    membership: null,
  }
}

export function getPostLoginPath(profile: AuthProfile): string {
  if (profile.role === 'admin') {
    if (profile.status === 'blocked') {
      return routes.forbidden
    }
    return routes.admin.root
  }

  if (profile.status === 'blocked') {
    return routes.cabinet.blocked
  }

  if (profile.status === 'pending') {
    return routes.cabinet.pending
  }

  return routes.cabinet.root
}

export function assertAuthenticated(state: AccessState): AccessDecision {
  if (!state.isAuthenticated) {
    return { allow: false, redirectTo: routes.login, reason: 'unauthenticated' }
  }
  return { allow: true }
}

export function assertGuest(state: AccessState): AccessDecision {
  if (!state.isAuthenticated || !state.profile) {
    return { allow: true }
  }
  return {
    allow: false,
    redirectTo: getPostLoginPath(state.profile),
    reason: 'already_authenticated',
  }
}

export function assertRole(state: AccessState, role: UserRole): AccessDecision {
  const auth = assertAuthenticated(state)
  if (!auth.allow) return auth

  if (!state.role) {
    return { allow: false, redirectTo: routes.login, reason: 'missing_role' }
  }

  if (state.role !== role) {
    return { allow: false, redirectTo: routes.forbidden, reason: 'wrong_role' }
  }

  if (role === 'admin' && state.status === 'blocked') {
    return { allow: false, redirectTo: routes.forbidden, reason: 'staff_blocked' }
  }

  if (role === 'member' && state.status === 'blocked') {
    // blocked members may only see blocked page — enforced by route tree
    return { allow: true }
  }

  return { allow: true }
}

export function assertMemberStatus(
  state: AccessState,
  required: UserStatus,
): AccessDecision {
  const roleCheck = assertRole(state, 'member')
  if (!roleCheck.allow) return roleCheck

  if (state.status === 'blocked') {
    return { allow: false, redirectTo: routes.cabinet.blocked, reason: 'blocked' }
  }

  if (state.status === 'pending') {
    return { allow: false, redirectTo: routes.cabinet.pending, reason: 'pending' }
  }

  if (state.status !== required) {
    return { allow: false, redirectTo: routes.cabinet.root, reason: 'status_mismatch' }
  }

  return { allow: true }
}
