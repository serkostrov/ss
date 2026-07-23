import { useMemo } from 'react'

import { useAuth } from '@app/providers'
import type { AccessState } from '@features/auth'

export function useAccessState(): AccessState {
  const { isAuthenticated, profile } = useAuth()

  return useMemo(
    () => ({
      isAuthenticated,
      role: profile?.role ?? null,
      status: profile?.status ?? null,
      profile,
    }),
    [isAuthenticated, profile],
  )
}
