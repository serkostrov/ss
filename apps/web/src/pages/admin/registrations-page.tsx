import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { ModerationFeed } from '@features/moderation-queue'
import { ErrorState, PageHeader } from '@shared/ui'

export function AdminRegistrationsPage() {
  return (
    <CanAccess
      permission={permissions['admin.registrations']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для управления заявками." />
      }
    >
      <div className="space-y-4">
        <PageHeader
          title="Заявки"
          description="Единая лента: регистрации, продукция, категории и выпуск материалов."
        />
        <ModerationFeed />
      </div>
    </CanAccess>
  )
}
