import {
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  workGroupMembershipRequestsService,
  type WorkGroupMembershipRequestStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

export function useWorkGroupMembershipRequests(
  status: WorkGroupMembershipRequestStatus | 'all' = 'pending',
) {
  return useSupabaseQuery(
    queryKeys.workGroups.membershipRequests(status),
    () => workGroupMembershipRequestsService.list(status),
    { ensureFreshSession: true },
  )
}

export function useReviewWorkGroupMembershipRequestMutation() {
  return useSupabaseMutation(
    (input: { id: string; approve: boolean; note?: string | null }) =>
      workGroupMembershipRequestsService.review(input.id, input.approve, input.note),
    {
      ensureFreshSession: true,
      invalidateKeys: [
        ['apss', 'work-groups', 'membership-requests'] as const,
        queryKeys.workGroups.cabinetList,
        queryKeys.workGroups.all,
      ],
      onSuccess: (_data, input) =>
        notify.success(input.approve ? 'Заявка одобрена' : 'Заявка отклонена'),
      onError: (error) => notify.fromError(error, 'Не удалось обработать заявку'),
    },
  )
}
