import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { PollDetailsCard } from '@features/polls'
import { ErrorState } from '@shared/ui'

export function AdminPollDetailsPage() {
  return (
    <CanAccess
      permission={permissions['admin.polls']}
      fallback={
        <ErrorState
          title="Нет доступа"
          description="Недостаточно прав для просмотра карточки голосования."
        />
      }
    >
      <PollDetailsCard />
    </CanAccess>
  )
}
