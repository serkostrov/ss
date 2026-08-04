import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { CabinetProductDetailsPanel } from '@features/cabinet'
import { routes } from '@shared/config'
import { ErrorState } from '@shared/ui'

export function AdminProductDetailsPage() {
  return (
    <CanAccess
      permission={permissions['admin.companies']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра продукции."
        />
      }
    >
      <CabinetProductDetailsPanel
        productsListTo={routes.admin.products}
        companyTo={routes.admin.company}
      />
    </CanAccess>
  )
}
