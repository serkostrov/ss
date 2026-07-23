import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { AdminShell } from '@widgets/admin-shell'
import { InlineLoader } from '@shared/ui'

export function AdminLayout() {
  return (
    <AdminShell>
      <Suspense fallback={<InlineLoader label="Загрузка раздела…" />}>
        <Outlet />
      </Suspense>
    </AdminShell>
  )
}
