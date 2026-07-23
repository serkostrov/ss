import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { WorkGroupDetailsCard } from '@features/work-groups'
import { ErrorState } from '@shared/ui'

export function AdminWorkGroupDetailsPage() {
  return (
    <CanAccess
      permission={permissions['admin.workGroups']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра карточки группы."
        />
      }
    >
      <WorkGroupDetailsCard />
    </CanAccess>
  )
}
