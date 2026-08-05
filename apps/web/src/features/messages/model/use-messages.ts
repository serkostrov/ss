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
    externalChatId: filters.externalChatId ?? 'all',
    deliveryStatus: filters.deliveryStatus ?? 'all',
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  })
}

type UseMessagesOptions = {
  /** Poll while the chat thread is open (fallback when Realtime WS is blocked). */
  live?: boolean
}

export function useMessages(filters: MessagesListFilters, options?: UseMessagesOptions) {
  return useSupabaseQuery(listKey(filters), () => messagesService.list(filters), {
    ensureFreshSession: true,
    refetchInterval: options?.live ? 2_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
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
