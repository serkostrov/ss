import { Navigate } from 'react-router-dom'

import { useAuth } from '@app/providers'
import { CabinetHomePanel } from '@features/cabinet'
import { routes } from '@shared/config'
import { FullPageLoader } from '@shared/ui'

export function CabinetHomePage() {
  const { profile, isReady } = useAuth()

  if (!isReady) {
    return <FullPageLoader />
  }

  if (!profile) {
    return <Navigate to={routes.login} replace />
  }

  if (profile.status === 'blocked') {
    return <Navigate to={routes.cabinet.blocked} replace />
  }

  if (profile.status === 'pending') {
    return <Navigate to={routes.cabinet.pending} replace />
  }

  return <CabinetHomePanel />
}
