import { Navigate } from 'react-router-dom'

import { routes } from '@shared/config'

export function CabinetCompanyPage() {
  return <Navigate to={`${routes.cabinet.account}?tab=company`} replace />
}
