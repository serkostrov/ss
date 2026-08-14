import {
  queryKeys,
  registeredUsersService,
  useSupabaseQuery,
  type RegisteredUsersListFilters,
} from '@shared/api'

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
