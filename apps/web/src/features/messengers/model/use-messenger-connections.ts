import {
  messengerBotChannelsService,
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

export function useMessengerBotChannels(platform: MessengerPlatform, enabled = true) {
  return useSupabaseQuery(
    queryKeys.workGroups.botChannels(platform),
    () => messengerBotChannelsService.listActiveChannels(platform),
    { ensureFreshSession: true, enabled },
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
    // Status is managed by worker / binding flow — never set manually in UI.
    bot_status: 'connected',
    last_error: null,
  }
}

export function availablePlatforms(
  connections: MessengerConnection[] = [],
  current?: MessengerPlatform,
): MessengerPlatform[] {
  const taken = new Set(connections.map((item) => item.platform))
  return (['telegram', 'max'] as MessengerPlatform[]).filter(
    (platform) => platform === current || !taken.has(platform),
  )
}

/** Chat ids already bound in this work group for a platform. */
export function boundChatIds(
  connections: MessengerConnection[],
  platform: MessengerPlatform,
  exceptConnectionId?: string,
): Set<string> {
  return new Set(
    connections
      .filter(
        (item) =>
          item.platform === platform &&
          (!exceptConnectionId || item.id !== exceptConnectionId),
      )
      .map((item) => item.chat_id),
  )
}

export type { MessengerConnection }
