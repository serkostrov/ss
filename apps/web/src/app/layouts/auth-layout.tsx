import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { APP_NAME } from '@shared/config'
import { InlineLoader } from '@shared/ui'

export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center bg-muted/40 px-4 py-10 sm:py-12">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          {APP_NAME}
        </p>
      </div>
      <div className="w-full max-w-md">
        <Suspense fallback={<InlineLoader label="Загрузка…" />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}
