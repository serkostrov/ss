import {
  messengerOutboundService,
  queryKeys,
  useSupabaseMutation,
  type MessengerOutboundDeleteInput,
  type MessengerOutboundInput,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

export function useSendMessengerMessageMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: MessengerOutboundInput) => messengerOutboundService.send(input),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.messages.all, queryKeys.workGroups.messengers(workGroupId)],
      onSuccess: () => notify.success('Сообщение отправлено'),
      onError: (error) => notify.fromError(error, 'Не удалось отправить сообщение'),
    },
  )
}

export function useDeleteMessengerMessageMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: MessengerOutboundDeleteInput) => messengerOutboundService.delete(input),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.messages.all, queryKeys.workGroups.messengers(workGroupId)],
      onSuccess: () => notify.success('Сообщение удалено'),
      onError: (error) => notify.fromError(error, 'Не удалось удалить сообщение'),
    },
  )
}
