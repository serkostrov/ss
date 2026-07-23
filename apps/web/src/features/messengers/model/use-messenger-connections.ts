import {
  messengerConnectionsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type MessengerConnection,
  type MessengerConnectionInput,
  type MessengerPlatform,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

import type { MessengerConnectionFormValues } from './schemas'

function invalidateKeys(workGroupId: string) {
  return [
    queryKeys.workGroups.messengers(workGroupId),
    queryKeys.workGroups.detail(workGroupId),
    queryKeys.workGroups.all,
  ]
}

export function useMessengerConnections(workGroupId: string) {
  return useSupabaseQuery(
    queryKeys.workGroups.messengers(workGroupId),
    () => messengerConnectionsService.listByWorkGroup(workGroupId),
    { ensureFreshSession: true },
  )
}

export function useUpsertMessengerConnectionMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: MessengerConnectionInput) => messengerConnectionsService.upsert(input),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateKeys(workGroupId),
      onSuccess: () => notify.success('Подключение сохранено'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить подключение'),
    },
  )
}

export function useUpdateMessengerConnectionMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: {
      id: string
      values: Partial<Omit<MessengerConnectionInput, 'work_group_id' | 'platform'>>
    }) => messengerConnectionsService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateKeys(workGroupId),
      onSuccess: () => notify.success('Подключение обновлено'),
      onError: (error) => notify.fromError(error, 'Не удалось обновить подключение'),
    },
  )
}

export function useDeleteMessengerConnectionMutation(workGroupId: string) {
  return useSupabaseMutation((id: string) => messengerConnectionsService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateKeys(workGroupId),
    onSuccess: () => notify.success('Привязка удалена'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить привязку'),
  })
}

export function toMessengerConnectionInput(
  workGroupId: string,
  values: MessengerConnectionFormValues,
): MessengerConnectionInput {
  return {
    work_group_id: workGroupId,
    platform: values.platform,
    chat_id: values.chatId,
    chat_title: values.chatTitle || null,
    bot_status: values.botStatus,
    last_error: values.lastError || null,
  }
}

export function availablePlatforms(
  connections: MessengerConnection[],
  current?: MessengerPlatform,
): MessengerPlatform[] {
  const taken = new Set(connections.map((item) => item.platform))
  return (['telegram', 'max'] as MessengerPlatform[]).filter(
    (platform) => platform === current || !taken.has(platform),
  )
}

export type { MessengerConnection }
