import { Navigate } from 'react-router-dom'

import type { CabinetResource } from '@shared/api'
import { routes } from '@shared/config'
import { Alert, AlertDescription, AlertTitle, FullPageLoader } from '@shared/ui'

import { useCabinetResourceAccess } from '../model/resource-access'
import { cabinetResourceLabel } from '@features/levels/model/resource-access'

type RequireCabinetResourceProps = {
  resource: CabinetResource
  children: React.ReactNode
}

export function CabinetResourceContentBlocked({ resource }: { resource: CabinetResource }) {
  return (
    <Alert>
      <AlertTitle>Доступ к содержимому ограничен</AlertTitle>
      <AlertDescription>
        Раздел «{cabinetResourceLabel(resource)}» доступен, но просмотр и работа с данными для
        текущего статуса вашей компании отключены администратором. Обратитесь в АПСС, если считаете
        это ошибкой.
      </AlertDescription>
    </Alert>
  )
}

export function RequireCabinetResource({ resource, children }: RequireCabinetResourceProps) {
  const accessQuery = useCabinetResourceAccess()
  const access = accessQuery.map?.[resource]

  if (accessQuery.isLoading) {
    return <FullPageLoader label="Проверка доступа…" />
  }

  if (access && !access.visible) {
    return <Navigate to={routes.cabinet.root} replace />
  }

  if (access && !access.hasContent) {
    return (
      <div className="space-y-4">
        <CabinetResourceContentBlocked resource={resource} />
      </div>
    )
  }

  return children
}
