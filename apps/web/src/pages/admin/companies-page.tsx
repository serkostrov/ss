import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { CompaniesPanel } from '@features/companies'
import { ErrorState } from '@shared/ui'

export function AdminCompaniesPage() {
  return (
    <CanAccess
      permission={permissions['admin.companies']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для управления компаниями." />
      }
    >
      <CompaniesPanel />
    </CanAccess>
  )
}
