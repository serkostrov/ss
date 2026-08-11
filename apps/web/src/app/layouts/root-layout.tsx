import { Outlet } from 'react-router-dom'

import { BlockedStaffRedirectBridge } from '@app/providers/blocked-staff-redirect-bridge'
import { UnauthorizedRedirectBridge } from '@app/providers/unauthorized-redirect-bridge'

/** Root shell: outlet + global auth redirect bridge (must live under Router). */
export function RootLayout() {
  return (
    <>
      <UnauthorizedRedirectBridge />
      <BlockedStaffRedirectBridge />
      <Outlet />
    </>
  )
}
