import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { RepresentativesPanel } from '@features/representatives'
import { ErrorState } from '@shared/ui'

export function AdminRepresentativesPage() {
  return (
    <CanAccess
      permission={permissions['admin.representatives']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для управления представителями."
        />
      }
    >
      <RepresentativesPanel />
    </CanAccess>
  )
}
