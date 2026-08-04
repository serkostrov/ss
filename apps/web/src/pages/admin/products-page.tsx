import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { adminProductsLinks, CabinetProductsPanel } from '@features/cabinet'
import { ErrorState } from '@shared/ui'

export function AdminProductsPage() {
  const links = adminProductsLinks()
  return (
    <CanAccess
      permission={permissions['admin.companies']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра каталога продукции."
        />
      }
    >
      <CabinetProductsPanel
        clearNotificationBadges={false}
        companyTo={links.companyTo}
        productTo={links.productTo}
      />
    </CanAccess>
  )
}
