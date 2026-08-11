import { useMemo } from 'react'

import { useAuth } from '@app/providers'
import type { AccessState } from '@features/auth'
import { useActiveSurface } from '@features/auth/model/active-surface'

export function useAccessState(): AccessState {
  const { isAuthenticated, profile } = useAuth()
  const { activeSurface } = useActiveSurface(profile)

  return useMemo(
    () => ({
      isAuthenticated,
      role: profile?.role ?? null,
      status: profile?.status ?? null,
      profile,
      activeSurface,
    }),
    [isAuthenticated, profile, activeSurface],
  )
}
