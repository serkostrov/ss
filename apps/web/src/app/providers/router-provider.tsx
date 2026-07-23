import { Suspense } from 'react'
import { RouterProvider as ReactRouterProvider } from 'react-router-dom'

import { router } from '@app/router'
import { FullPageLoader } from '@shared/ui'

/** Application router with top-level Suspense boundary. */
export function AppRouterProvider() {
  return (
    <Suspense fallback={<FullPageLoader label="Загрузка страницы…" />}>
      <ReactRouterProvider router={router} />
    </Suspense>
  )
}
