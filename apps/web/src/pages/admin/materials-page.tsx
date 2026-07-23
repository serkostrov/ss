import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { MaterialsPanel } from '@features/materials'
import { ErrorState } from '@shared/ui'

export function AdminMaterialsPage() {
  return (
    <CanAccess
      permission={permissions['admin.materials']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для управления материалами." />
      }
    >
      <MaterialsPanel />
    </CanAccess>
  )
}
