import {
  levelsService,
  pollsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type Poll,
  type PollInput,
  type PollStatus,
  type PollsListFilters,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

import {
  fromDatetimeLocalValue,
  type PollFormValues,
} from './schemas'

function listKey(filters: PollsListFilters) {
  return queryKeys.polls.list({
    search: filters.search?.trim() || '',
    status: filters.status ?? 'all',
    voteMode: filters.voteMode ?? 'all',
  })
}

const invalidateAll = [queryKeys.polls.all]

export function usePolls(filters: PollsListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => pollsService.list(filters), {
    ensureFreshSession: true,
  })
}

export function usePoll(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.polls.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return pollsService.getById(id)
    },
    { enabled: Boolean(id), ensureFreshSession: true },
  )
}

export function useLevelsForPollAcl() {
  return useSupabaseQuery(
    queryKeys.levels.list({ search: '', active: 'all' }),
    () => levelsService.list({ active: 'all' }),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCreatePollMutation() {
  return useSupabaseMutation((input: PollInput) => pollsService.create(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Голосование создано'),
    onError: (error) => notify.fromError(error, 'Не удалось создать голосование'),
  })
}

export function useUpdatePollMutation() {
  return useSupabaseMutation(
    (input: { id: string; values: PollInput }) => pollsService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Голосование сохранено'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить голосование'),
    },
  )
}

export function useSetPollStatusMutation() {
  return useSupabaseMutation(
    (input: { id: string; status: PollStatus }) => pollsService.setStatus(input.id, input.status),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        const labels: Record<PollStatus, string> = {
          draft: 'Переведено в черновик',
          active: 'Голосование активировано',
          closed: 'Голосование закрыто',
        }
        notify.success(labels[variables.status])
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}

export function useDeletePollMutation() {
  return useSupabaseMutation((id: string) => pollsService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Голосование удалено'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить голосование'),
  })
}

export function toPollInput(values: PollFormValues): PollInput {
  return {
    title: values.title,
    description: values.description || null,
    vote_mode: values.voteMode,
    starts_at: fromDatetimeLocalValue(values.startsAt),
    ends_at: fromDatetimeLocalValue(values.endsAt),
    status: values.status,
    options: values.options.map((item) => item.trim()).filter(Boolean),
    level_ids: values.levelIds,
  }
}

export type { Poll }
