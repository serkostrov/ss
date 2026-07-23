import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { WorkGroupsPanel } from '@features/work-groups'
import { ErrorState } from '@shared/ui'

export function AdminWorkGroupsPage() {
  return (
    <CanAccess
      permission={permissions['admin.workGroups']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для управления рабочими группами."
        />
      }
    >
      <WorkGroupsPanel />
    </CanAccess>
  )
}
