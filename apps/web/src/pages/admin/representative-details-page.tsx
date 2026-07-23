import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { RepresentativeDetailsCard } from '@features/representatives'
import { ErrorState } from '@shared/ui'

export function AdminRepresentativeDetailsPage() {
  return (
    <CanAccess
      permission={permissions['admin.representatives']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра представителя."
        />
      }
    >
      <RepresentativeDetailsCard />
    </CanAccess>
  )
}
