import { CanAccess, permissions } from '@features/auth'
import { StaffPanel } from '@features/staff'
import { ErrorState } from '@shared/ui'

export function AdminStaffPage() {
  return (
    <CanAccess
      permission={permissions['admin.staff']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для управления сотрудниками АПСС."
        />
      }
    >
      <StaffPanel />
    </CanAccess>
  )
}
