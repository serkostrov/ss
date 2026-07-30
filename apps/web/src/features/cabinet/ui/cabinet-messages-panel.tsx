import { useEffect, useState } from 'react'

import { MessagesFeedPanel } from '@features/messages'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui'
import { queryKeys, useSupabaseQuery, workGroupsService } from '@shared/api'

export function CabinetMessagesPanel() {
  const groupsQuery = useSupabaseQuery(
    queryKeys.workGroups.list({ search: '', status: 'all' }),
    () => workGroupsService.list({ status: 'all' }),
    {
      ensureFreshSession: true,
      meta: { suppressErrorToast: true },
    },
  )

  const groups = groupsQuery.data ?? []
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    if (!selectedId && groups.length > 0) {
      setSelectedId(groups[0]!.id)
    }
  }, [groups, selectedId])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Сообщения"
        description="Лента постов из каналов Telegram и Max по вашим рабочим группам."
      />

      {groupsQuery.isLoading && !groupsQuery.data ? <LoadingState label="Загрузка групп…" /> : null}

      {groupsQuery.isError ? (
        <ErrorState error={groupsQuery.error} onRetry={() => void groupsQuery.refetch()} />
      ) : null}

      {!groupsQuery.isLoading && !groupsQuery.isError && groups.length === 0 ? (
        <EmptyState
          title="Нет рабочих групп"
          description="Когда вас добавят в рабочую группу, здесь появится лента сообщений."
        />
      ) : null}

      {groups.length > 0 ? (
        <div className="space-y-4">
          <div className="max-w-md">
            <Select value={selectedId || undefined} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите группу" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedId ? (
            <MessagesFeedPanel workGroupId={selectedId} showPageHeader={false} hideGroupFilter />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
