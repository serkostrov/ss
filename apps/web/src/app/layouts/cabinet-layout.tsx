import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { CabinetShell } from '@widgets/cabinet-shell'
import { InlineLoader } from '@shared/ui'

export function CabinetLayout() {
  return (
    <CabinetShell>
      <Suspense fallback={<InlineLoader label="Загрузка раздела…" />}>
        <Outlet />
      </Suspense>
    </CabinetShell>
  )
}
