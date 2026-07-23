import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { AuditLogPanel } from '@features/audit'
import { ErrorState } from '@shared/ui'

export function AdminAuditPage() {
  return (
    <CanAccess
      permission={permissions['admin.audit']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра журнала действий."
        />
      }
    >
      <AuditLogPanel />
    </CanAccess>
  )
}
