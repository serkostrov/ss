import {
  queryKeys,
  staffService,
  useSupabaseMutation,
  useSupabaseQuery,
  type PromoteStaffInput,
  type UpdateStaffInput,
  type DbUserStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateStaff = [queryKeys.staff.all, queryKeys.registrations.all]

export function useStaffUsers() {
  return useSupabaseQuery(queryKeys.staff.list, () => staffService.list(), {
    ensureFreshSession: true,
  })
}

export function useStaffPromoteCandidates(search = '') {
  return useSupabaseQuery(
    queryKeys.staff.candidates(search),
    () => staffService.listPromoteCandidates(search),
    { ensureFreshSession: true, staleTime: 15_000 },
  )
}

export function usePromoteStaffMutation() {
  return useSupabaseMutation((input: PromoteStaffInput) => staffService.promote(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateStaff,
    onSuccess: () => notify.success('Сотрудник добавлен'),
    onError: (error) => notify.fromError(error, 'Не удалось назначить сотрудника'),
  })
}

export function useUpdateStaffMutation() {
  return useSupabaseMutation((input: UpdateStaffInput) => staffService.update(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateStaff,
    onSuccess: () => notify.success('Профиль сотрудника сохранён'),
    onError: (error) => notify.fromError(error, 'Не удалось сохранить профиль'),
  })
}

export function useSetStaffStatusMutation() {
  return useSupabaseMutation(
    (input: { userId: string; status: Extract<DbUserStatus, 'confirmed' | 'blocked'> }) =>
      staffService.setStatus(input.userId, input.status),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateStaff,
      onSuccess: (_data, variables) => {
        notify.success(
          variables.status === 'blocked'
            ? 'Сотрудник заблокирован'
            : 'Сотрудник разблокирован',
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}
