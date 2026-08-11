import type { AuthProfile, User } from '@shared/api'
import { routes } from '@shared/config'
import type { UserRole, UserStatus } from '@shared/types'

import {
  isDualRoleStaff,
  type ActiveSurface,
} from './active-surface'

export type AccessState = {
  isAuthenticated: boolean
  role: UserRole | null
  status: UserStatus | null
  profile: AuthProfile | null
  activeSurface: ActiveSurface
}

export type AccessDecision = { allow: true } | { allow: false; redirectTo: string; reason: string }

function isRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'member'
}

function isStatus(value: unknown): value is UserStatus {
  return value === 'pending' || value === 'confirmed' || value === 'blocked'
}

/** Staff (admin) account blocked — must not stay in an authenticated app shell. */
export function isBlockedStaff(profile: AuthProfile | null | undefined): boolean {
  return profile?.role === 'admin' && profile.status === 'blocked'
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
    position: null,
    phone: typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : null,
    telegramUsername:
      typeof user.user_metadata?.telegram_username === 'string'
        ? user.user_metadata.telegram_username
        : null,
    showContactsToMembers: user.user_metadata?.show_contacts_to_members === true,
    emailNotificationsEnabled: user.user_metadata?.email_notifications_enabled !== false,
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
  if (isBlockedStaff(profile)) {
    return routes.login
  }

  if (profile.role === 'admin') {
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
  if (isBlockedStaff(state.profile)) {
    return { allow: false, redirectTo: routes.login, reason: 'staff_blocked' }
  }
  return { allow: true }
}

export function assertGuest(state: AccessState): AccessDecision {
  if (!state.isAuthenticated || !state.profile) {
    return { allow: true }
  }
  // Allow login form while session is cleared for blocked staff.
  if (isBlockedStaff(state.profile)) {
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

  const dual = isDualRoleStaff(state.profile)

  if (role === 'admin') {
    if (state.role !== 'admin') {
      return { allow: false, redirectTo: routes.forbidden, reason: 'wrong_role' }
    }
    if (dual && state.activeSurface === 'cabinet') {
      return { allow: false, redirectTo: routes.cabinet.root, reason: 'acting_as_member' }
    }
    return { allow: true }
  }

  // role === 'member'
  if (state.role === 'member') {
    if (state.status === 'blocked') {
      return { allow: true }
    }
    return { allow: true }
  }

  if (dual && state.activeSurface === 'cabinet') {
    return { allow: true }
  }

  if (dual && state.activeSurface === 'admin') {
    return { allow: false, redirectTo: routes.admin.root, reason: 'acting_as_admin' }
  }

  return { allow: false, redirectTo: routes.forbidden, reason: 'wrong_role' }
}

export function assertMemberStatus(state: AccessState, required: UserStatus): AccessDecision {
  const roleCheck = assertRole(state, 'member')
  if (!roleCheck.allow) return roleCheck

  if (isDualRoleStaff(state.profile) && state.activeSurface === 'cabinet') {
    if (!state.profile?.membership) {
      return { allow: false, redirectTo: routes.admin.root, reason: 'no_company_membership' }
    }
    return { allow: true }
  }

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
