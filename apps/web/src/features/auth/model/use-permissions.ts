import { useMemo } from 'react'

import { useAuth } from '@app/providers'
import type { AccessState } from './access'
import { getPermissionsForRole, hasPermission, type Permission } from './permissions'

export function usePermissions() {
  const { isAuthenticated, profile } = useAuth()

  const access = useMemo<AccessState>(
    () => ({
      isAuthenticated,
      role: profile?.role ?? null,
      status: profile?.status ?? null,
      profile,
    }),
    [isAuthenticated, profile],
  )

  return useMemo(() => {
    const list = getPermissionsForRole(access.role)
    const workGroupOpts = {
      canManageWorkGroups: access.profile?.canManageWorkGroups,
    }

    return {
      access,
      permissions: list,
      can: (permission: Permission) => hasPermission(access, permission, workGroupOpts),
      canAny: (items: readonly Permission[]) =>
        items.some((permission) => hasPermission(access, permission, workGroupOpts)),
      canAll: (items: readonly Permission[]) =>
        items.every((permission) => hasPermission(access, permission, workGroupOpts)),
    }
  }, [access])
}
