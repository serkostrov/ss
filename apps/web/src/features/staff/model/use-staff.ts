import {
  queryKeys,
  staffService,
  useSupabaseMutation,
  useSupabaseQuery,
  type BindStaffCompanyInput,
  type DemoteStaffInput,
  type PromoteStaffInput,
  type UpdateStaffInput,
  type DbUserStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateStaff = [
  queryKeys.staff.all,
  queryKeys.registrations.all,
  queryKeys.companies.all,
  queryKeys.representatives.all,
]

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
    onSuccess: (_data, variables) =>
      notify.success(
        variables.companyId
          ? 'Сотрудник добавлен и привязан к компании'
          : 'Сотрудник добавлен',
      ),
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
          variables.status === 'blocked' ? 'Сотрудник заблокирован' : 'Сотрудник разблокирован',
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}

export function useDemoteStaffMutation() {
  return useSupabaseMutation((input: DemoteStaffInput) => staffService.demote(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateStaff,
    onSuccess: () =>
      notify.success('Статус сотрудника снят — учётная запись остаётся представителем компании'),
    onError: (error) => notify.fromError(error, 'Не удалось снять статус сотрудника'),
  })
}

export function useBindStaffCompanyMutation() {
  return useSupabaseMutation((input: BindStaffCompanyInput) => staffService.bindCompany(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateStaff,
    onSuccess: () => notify.success('Компания привязана — сотрудник может открыть кабинет'),
    onError: (error) => notify.fromError(error, 'Не удалось привязать компанию'),
  })
}

export function useUnbindStaffCompanyMutation() {
  return useSupabaseMutation((userId: string) => staffService.unbindCompany(userId), {
    ensureFreshSession: true,
    invalidateKeys: invalidateStaff,
    onSuccess: () => notify.success('Компания отвязана'),
    onError: (error) => notify.fromError(error, 'Не удалось отвязать компанию'),
  })
}
