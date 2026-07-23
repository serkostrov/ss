import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { RegistrationsPanel } from '@features/registrations'
import { ErrorState } from '@shared/ui'

export function AdminRegistrationsPage() {
  return (
    <CanAccess
      permission={permissions['admin.registrations']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для управления заявками."
        />
      }
    >
      <RegistrationsPanel />
    </CanAccess>
  )
}
