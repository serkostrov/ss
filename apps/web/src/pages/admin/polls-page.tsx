import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { PollsPanel } from '@features/polls'
import { ErrorState } from '@shared/ui'

export function AdminPollsPage() {
  return (
    <CanAccess
      permission={permissions['admin.polls']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для управления голосованиями."
        />
      }
    >
      <PollsPanel />
    </CanAccess>
  )
}
