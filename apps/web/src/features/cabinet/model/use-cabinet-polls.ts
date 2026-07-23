import { useDeferredValue, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  pollsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type CabinetPoll,
} from '@shared/api'
import { appConfig } from '@shared/config'
import { notify } from '@shared/lib/notify'

export const CABINET_POLLS_STALE_MS = Math.max(appConfig.api.staleTimeMs, 60_000)
export const CABINET_POLLS_GC_MS = 15 * 60_000

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function filterCabinetPolls(items: CabinetPoll[], search: string): CabinetPoll[] {
  const q = normalizeSearch(search)
  if (!q) return items
  return items.filter((item) => {
    const haystack = [item.title, item.description ?? ''].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}

export function useCabinetPolls() {
  return useSupabaseQuery(
    queryKeys.polls.cabinetList,
    () => pollsService.listForMember(),
    {
      ensureFreshSession: true,
      staleTime: CABINET_POLLS_STALE_MS,
      gcTime: CABINET_POLLS_GC_MS,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useCabinetPollsSearch(search: string) {
  const query = useCabinetPolls()
  const deferredSearch = useDeferredValue(search)
  const filtered = useMemo(
    () => filterCabinetPolls(query.data ?? [], deferredSearch),
    [query.data, deferredSearch],
  )

  return {
    ...query,
    search: deferredSearch,
    items: filtered,
    totalCount: query.data?.length ?? 0,
    isFiltering: deferredSearch !== search,
  }
}

export function useCabinetPoll(id: string | undefined) {
  const queryClient = useQueryClient()

  return useSupabaseQuery(
    queryKeys.polls.cabinetDetail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return pollsService.getForMemberById(id)
    },
    {
      enabled: Boolean(id),
      ensureFreshSession: true,
      staleTime: CABINET_POLLS_STALE_MS,
      gcTime: CABINET_POLLS_GC_MS,
      meta: { suppressErrorToast: true },
      placeholderData: () => {
        if (!id) return undefined
        const list = queryClient.getQueryData<CabinetPoll[]>(queryKeys.polls.cabinetList)
        return list?.find((item) => item.id === id)
      },
    },
  )
}

export function useCastCabinetVoteMutation() {
  return useSupabaseMutation(
    (input: { pollId: string; optionId: string }) =>
      pollsService.castVote(input.pollId, input.optionId),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.polls.cabinetList, queryKeys.polls.all],
      onSuccess: () => notify.success('Ваш голос учтён'),
      onError: (error) => notify.fromError(error, 'Не удалось отправить голос'),
    },
  )
}

export type { CabinetPoll }
