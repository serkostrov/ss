import type { AuthProfile } from '@shared/api'
import { routes } from '@shared/config'

/** Company left the association (`archived` / «Вышедшая»). */
export function isExitedCompany(profile: AuthProfile | null | undefined): boolean {
  return profile?.membership?.accessStatus === 'archived'
}

/** Suspended visibility rules are still in development — not gated here. */
export function isSuspendedCompany(profile: AuthProfile | null | undefined): boolean {
  return profile?.membership?.accessStatus === 'suspended'
}

export const exitedCompanyPath = `${routes.cabinet.account}?tab=company`
