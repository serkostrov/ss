import type { ReactNode } from 'react'

import { usePermissions } from '../model/use-permissions'
import type { Permission } from '../model/permissions'

type CanAccessProps = {
  permission?: Permission
  anyOf?: readonly Permission[]
  allOf?: readonly Permission[]
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Conditionally renders UI by permission.
 * Prefer route guards for hard redirects; use this for nav/actions/sections.
 */
export function CanAccess({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: CanAccessProps) {
  const { can, canAny, canAll } = usePermissions()

  let allowed = true

  if (permission) {
    allowed = can(permission)
  }

  if (allowed && anyOf?.length) {
    allowed = canAny(anyOf)
  }

  if (allowed && allOf?.length) {
    allowed = canAll(allOf)
  }

  if (!allowed) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
