import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'

import type { AuthProfile } from '@shared/api'
import { routes } from '@shared/config'

export type ActiveSurface = 'admin' | 'cabinet'

export const ACTIVE_SURFACE_KEY = 'apss.activeSurface'

const listeners = new Set<() => void>()

function emitSurfaceChange() {
  for (const listener of listeners) listener()
}

function readStoredSurface(): ActiveSurface | null {
  try {
    const value = sessionStorage.getItem(ACTIVE_SURFACE_KEY)
    if (value === 'admin' || value === 'cabinet') return value
  } catch {
    // private mode / disabled storage
  }
  return null
}

export function setActiveSurface(surface: ActiveSurface): void {
  try {
    sessionStorage.setItem(ACTIVE_SURFACE_KEY, surface)
  } catch {
    // ignore
  }
  emitSurfaceChange()
}

export function clearActiveSurface(): void {
  try {
    sessionStorage.removeItem(ACTIVE_SURFACE_KEY)
  } catch {
    // ignore
  }
  emitSurfaceChange()
}

function subscribeSurface(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSurfaceSnapshot(): ActiveSurface | null {
  return readStoredSurface()
}

/** Staff with a linked company can open the full member cabinet. */
export function isDualRoleStaff(profile: AuthProfile | null | undefined): boolean {
  return Boolean(
    profile?.role === 'admin' &&
      profile.status !== 'blocked' &&
      profile.membership?.representativeId,
  )
}

export function defaultSurfaceForProfile(profile: AuthProfile | null | undefined): ActiveSurface {
  if (profile?.role === 'admin') return 'admin'
  return 'cabinet'
}

/**
 * Resolve which shell the user is acting in.
 * Pathname wins for dual-role deep links; otherwise stored preference / role default.
 */
export function resolveActiveSurface(
  profile: AuthProfile | null | undefined,
  pathname: string,
  stored: ActiveSurface | null,
): ActiveSurface {
  if (isDualRoleStaff(profile)) {
    if (pathname === routes.cabinet.root || pathname.startsWith(`${routes.cabinet.root}/`)) {
      return 'cabinet'
    }
    if (pathname === routes.admin.root || pathname.startsWith(`${routes.admin.root}/`)) {
      return 'admin'
    }
  }

  if (stored) return stored
  return defaultSurfaceForProfile(profile)
}

export function useActiveSurface(profile: AuthProfile | null | undefined): {
  activeSurface: ActiveSurface
  setSurface: (surface: ActiveSurface) => void
  isDualRole: boolean
} {
  const location = useLocation()
  const stored = useSyncExternalStore(subscribeSurface, getSurfaceSnapshot, () => null)

  const activeSurface = useMemo(
    () => resolveActiveSurface(profile, location.pathname, stored),
    [profile, location.pathname, stored],
  )

  const isDualRole = isDualRoleStaff(profile)

  const setSurface = useCallback((surface: ActiveSurface) => {
    setActiveSurface(surface)
  }, [])

  return { activeSurface, setSurface, isDualRole }
}

/** Local mirror for non-React callers that already know surface. */
export function useStoredActiveSurface(): ActiveSurface | null {
  return useSyncExternalStore(subscribeSurface, getSurfaceSnapshot, () => null)
}
