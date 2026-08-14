import {
  queryKeys,
  registeredUsersService,
  useSupabaseMutation,
  useSupabaseQuery,
  type AdminUpdateUserInput,
  type RegisteredUsersListFilters,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateRegisteredUsers = [
  queryKeys.registeredUsers.all,
  queryKeys.staff.all,
  queryKeys.registrations.all,
]

function listKey(filters: RegisteredUsersListFilters) {
  return queryKeys.registeredUsers.list({
    search: filters.search?.trim() || '',
    role: filters.role ?? 'all',
    status: filters.status ?? 'all',
  })
}

export function useRegisteredUsers(filters: RegisteredUsersListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => registeredUsersService.list(filters), {
    ensureFreshSession: true,
    staleTime: 30_000,
  })
}

export function useUpdateRegisteredUserMutation() {
  return useSupabaseMutation(
    (input: AdminUpdateUserInput) => registeredUsersService.update(input),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateRegisteredUsers,
      onSuccess: () => notify.success('Данные пользователя сохранены'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить пользователя'),
    },
  )
}

export function useDeleteRegisteredUserMutation() {
  return useSupabaseMutation((userId: string) => registeredUsersService.delete(userId), {
    ensureFreshSession: true,
    invalidateKeys: invalidateRegisteredUsers,
    onSuccess: () => notify.success('Пользователь удалён из системы'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить пользователя'),
  })
}
