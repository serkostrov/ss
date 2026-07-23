import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { MessagesHistoryPanel } from '@features/messages'
import { ErrorState } from '@shared/ui'

export function AdminMessagesPage() {
  return (
    <CanAccess
      permission={permissions['admin.messages']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра истории сообщений."
        />
      }
    >
      <MessagesHistoryPanel />
    </CanAccess>
  )
}
