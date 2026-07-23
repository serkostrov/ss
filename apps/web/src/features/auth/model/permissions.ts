import type { AccessState } from './access'
import type { UserRole } from '@shared/types'

/**
 * UI-level permissions for admin (and future cabinet) surfaces.
 * Route guards remain the source of truth for redirects;
 * these hide/disable controls that the user must not see.
 */
export const permissions = {
  'admin.access': 'admin.access',
  'admin.dashboard': 'admin.dashboard',
  'admin.registrations': 'admin.registrations',
  'admin.levels': 'admin.levels',
  'admin.companies': 'admin.companies',
  'admin.representatives': 'admin.representatives',
  'admin.workGroups': 'admin.workGroups',
  'admin.messages': 'admin.messages',
  'admin.materials': 'admin.materials',
  'admin.polls': 'admin.polls',
  'admin.audit': 'admin.audit',
  'admin.settings': 'admin.settings',
  'admin.staff': 'admin.staff',
} as const

export type Permission = (typeof permissions)[keyof typeof permissions]

const ALL_ADMIN_PERMISSIONS = Object.values(permissions)

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ALL_ADMIN_PERMISSIONS,
  member: [],
}

export function getPermissionsForRole(role: UserRole | null | undefined): readonly Permission[] {
  if (!role) return []
  return ROLE_PERMISSIONS[role] ?? []
}

export function hasPermission(
  state: AccessState,
  permission: Permission,
  options?: { canManageWorkGroups?: boolean },
): boolean {
  if (!state.isAuthenticated || !state.role) return false
  if (!getPermissionsForRole(state.role).includes(permission)) return false

  if (
    (permission === permissions['admin.workGroups'] ||
      permission === permissions['admin.messages']) &&
    options?.canManageWorkGroups === false
  ) {
    return false
  }

  return true
}

export function hasAnyPermission(state: AccessState, list: readonly Permission[]): boolean {
  return list.some((permission) => hasPermission(state, permission))
}

export function hasAllPermissions(state: AccessState, list: readonly Permission[]): boolean {
  return list.every((permission) => hasPermission(state, permission))
}
