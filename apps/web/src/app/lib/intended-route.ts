import { getPostLoginPath } from '@features/auth/model/access'
import type { AuthProfile } from '@shared/api'
import { routes } from '@shared/config'

export const INTENDED_ROUTE_KEY = 'apss.intendedRoute'

export type LoginLocationState = {
  from?: string
}

const AUTH_PATH_PREFIXES = [
  routes.login,
  routes.register,
  routes.resetPassword,
  routes.updatePassword,
  routes.unauthorized,
  routes.forbidden,
  routes.notFound,
] as const

export function isAuthOrErrorPath(pathname: string): boolean {
  return AUTH_PATH_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false
  if (path.includes('://')) return false
  return true
}

export function buildLocationPath(pathname: string, search = '', hash = ''): string {
  return `${pathname}${search}${hash}`
}

export function saveIntendedRoute(path: string): void {
  if (!isSafeInternalPath(path) || isAuthOrErrorPath(path.split('?')[0] ?? path)) {
    return
  }
  try {
    sessionStorage.setItem(INTENDED_ROUTE_KEY, path)
  } catch {
    // private mode / disabled storage
  }
}

export function peekIntendedRoute(): string | null {
  try {
    return sessionStorage.getItem(INTENDED_ROUTE_KEY)
  } catch {
    return null
  }
}

export function consumeIntendedRoute(): string | null {
  try {
    const value = sessionStorage.getItem(INTENDED_ROUTE_KEY)
    sessionStorage.removeItem(INTENDED_ROUTE_KEY)
    return value
  } catch {
    return null
  }
}

export function clearIntendedRoute(): void {
  try {
    sessionStorage.removeItem(INTENDED_ROUTE_KEY)
  } catch {
    // ignore
  }
}

function canAccessIntendedPath(profile: AuthProfile, path: string): boolean {
  const pathname = path.split('?')[0] ?? path

  if (pathname.startsWith(routes.admin.root)) {
    return profile.role === 'admin' && profile.status !== 'blocked'
  }

  if (pathname.startsWith(routes.cabinet.root)) {
    if (profile.role !== 'member') return false
    if (pathname === routes.cabinet.pending) return true
    if (pathname === routes.cabinet.blocked) return true
    if (profile.status === 'confirmed') return true
    if (profile.status === 'pending') {
      return pathname === routes.cabinet.root || pathname === routes.cabinet.pending
    }
    if (profile.status === 'blocked') {
      return pathname === routes.cabinet.root || pathname === routes.cabinet.blocked
    }
  }

  // public paths
  if (pathname === routes.root || pathname === routes.home) return true

  return false
}

/**
 * Resolve post-login destination: intended route (state → storage) → role home.
 */
export function resolvePostAuthRedirect(
  profile: AuthProfile,
  locationState?: LoginLocationState | null,
): string {
  const candidates = [locationState?.from, peekIntendedRoute()].filter(
    (value): value is string => Boolean(value),
  )

  for (const candidate of candidates) {
    if (!isSafeInternalPath(candidate)) continue
    if (!canAccessIntendedPath(profile, candidate)) continue
    clearIntendedRoute()
    return candidate
  }

  clearIntendedRoute()
  return getPostLoginPath(profile)
}
