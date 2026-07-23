import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { InlineLoader } from '@shared/ui'

/** Minimal layout for public marketing pages. */
export function PublicLayout() {
  return (
    <Suspense fallback={<InlineLoader label="Загрузка…" />}>
      <Outlet />
    </Suspense>
  )
}
