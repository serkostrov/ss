import {
  messagesService,
  queryKeys,
  useSupabaseQuery,
  workGroupsService,
  type MessagesListFilters,
} from '@shared/api'

function listKey(filters: MessagesListFilters) {
  return queryKeys.messages.list({
    search: filters.search?.trim() || '',
    workGroupId: filters.workGroupId ?? 'all',
    source: filters.source ?? 'all',
    deliveryStatus: filters.deliveryStatus ?? 'all',
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  })
}

export function useMessages(filters: MessagesListFilters) {
  return useSupabaseQuery(listKey(filters), () => messagesService.list(filters), {
    ensureFreshSession: true,
    meta: { suppressErrorToast: true },
  })
}

export function useMessage(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.messages.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return messagesService.getById(id)
    },
    {
      enabled: Boolean(id),
      ensureFreshSession: true,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useWorkGroupsForMessageFilter() {
  return useSupabaseQuery(
    queryKeys.workGroups.list({ search: '', status: 'all' }),
    () => workGroupsService.list({ status: 'all' }),
    {
      ensureFreshSession: true,
      staleTime: 60_000,
      meta: { suppressErrorToast: true },
    },
  )
}
