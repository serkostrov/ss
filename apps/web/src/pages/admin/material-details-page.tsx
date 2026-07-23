import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { MaterialSectionEditor } from '@features/materials'
import { ErrorState } from '@shared/ui'

export function AdminMaterialDetailsPage() {
  return (
    <CanAccess
      permission={permissions['admin.materials']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для редактирования раздела." />
      }
    >
      <MaterialSectionEditor />
    </CanAccess>
  )
}
