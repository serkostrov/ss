import {
  messengerOutboundService,
  queryKeys,
  useSupabaseMutation,
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
