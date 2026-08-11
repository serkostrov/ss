import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { FullPageLoader } from '@shared/ui'

import { exitedCompanyPath, isExitedCompany } from '@features/cabinet/model/company-access'

/**
 * Blocks association resources for representatives of exited («Вышедшая») companies.
 * They may only open the company card.
 */
export function RequireNonExitedCompany() {
  const { isReady, isLoading, profile } = useAuth()

  if (!isReady || isLoading) {
    return <FullPageLoader label="Проверка доступа…" />
  }

  if (isExitedCompany(profile)) {
    return <Navigate to={exitedCompanyPath} replace />
  }

  return <Outlet />
}
