import { useDeferredValue, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  workGroupMembersService,
  type WorkGroupMember,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function membersKey(workGroupId: string, search = '') {
  return [...queryKeys.workGroups.members(workGroupId), { search }] as const
}

function candidatesKey(workGroupId: string, search = '') {
  return [...queryKeys.workGroups.members(workGroupId), 'candidates', { search }] as const
}

const invalidateMembers = (workGroupId: string) => [
  queryKeys.workGroups.members(workGroupId),
  queryKeys.workGroups.detail(workGroupId),
  queryKeys.workGroups.all,
]

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

export function useWorkGroupMembers(workGroupId: string | undefined, search = '') {
  const deferred = useDeferredValue(search.trim())

  return useSupabaseQuery(
    membersKey(workGroupId ?? 'none', deferred),
    () => {
      if (!workGroupId) return Promise.resolve([] as WorkGroupMember[])
      return workGroupMembersService.list(workGroupId, { search: deferred })
    },
    {
      enabled: Boolean(workGroupId),
      ensureFreshSession: true,
      staleTime: 30_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useWorkGroupMemberCandidates(workGroupId: string | undefined, search = '') {
  const deferred = useDeferredValue(search.trim())

  return useSupabaseQuery(
    candidatesKey(workGroupId ?? 'none', deferred),
    () => {
      if (!workGroupId) return Promise.resolve([])
      return workGroupMembersService.listCandidates(workGroupId, {
        search: deferred,
        limit: 150,
      })
    },
    {
      enabled: Boolean(workGroupId),
      ensureFreshSession: true,
      staleTime: 15_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useAddWorkGroupMemberMutation(workGroupId: string) {
  const queryClient = useQueryClient()

  return useSupabaseMutation(
    (representativeId: string) => workGroupMembersService.add(workGroupId, representativeId),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateMembers(workGroupId),
      onSuccess: async () => {
        notify.success('Участник добавлен')
        await queryClient.invalidateQueries({
          queryKey: queryKeys.workGroups.members(workGroupId),
        })
      },
      onError: (error) => notify.fromError(error, 'Не удалось добавить участника'),
    },
  )
}

export function useBulkAddWorkGroupMembersMutation(workGroupId: string) {
  const queryClient = useQueryClient()

  return useSupabaseMutation(
    (representativeIds: string[]) =>
      workGroupMembersService.bulkAdd(workGroupId, representativeIds),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateMembers(workGroupId),
      onSuccess: async (result) => {
        if (result.inserted === 0) {
          notify.info('Новых участников нет — все уже в группе или недоступны')
        } else if (result.skipped > 0) {
          notify.success(
            `Добавлено: ${result.inserted}, пропущено дублей/недоступных: ${result.skipped}`,
          )
        } else {
          notify.success(`Добавлено участников: ${result.inserted}`)
        }
        await queryClient.invalidateQueries({
          queryKey: queryKeys.workGroups.members(workGroupId),
        })
      },
      onError: (error) => notify.fromError(error, 'Не удалось массово добавить участников'),
    },
  )
}

export function useRemoveWorkGroupMemberMutation(workGroupId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (memberId: string) => withSession(() => workGroupMembersService.remove(memberId)),
    onMutate: async (memberId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.workGroups.members(workGroupId) })
      const previous = queryClient.getQueriesData<WorkGroupMember[]>({
        queryKey: queryKeys.workGroups.members(workGroupId),
      })
      queryClient.setQueriesData<WorkGroupMember[]>(
        { queryKey: queryKeys.workGroups.members(workGroupId) },
        (current) => current?.filter((item) => item.id !== memberId),
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notify.fromError(error, 'Не удалось удалить участника')
    },
    onSuccess: () => notify.success('Участник удалён'),
    onSettled: async () => {
      await Promise.all(
        invalidateMembers(workGroupId).map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      )
    },
  })
}

export function useRemoveManyWorkGroupMembersMutation(workGroupId: string) {
  return useSupabaseMutation(
    (memberIds: string[]) => workGroupMembersService.removeMany(memberIds),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateMembers(workGroupId),
      onSuccess: (count) => notify.success(`Удалено участников: ${count}`),
      onError: (error) => notify.fromError(error, 'Не удалось удалить участников'),
    },
  )
}

export function useFilteredMemberIds(members: WorkGroupMember[] | undefined) {
  return useMemo(() => new Set((members ?? []).map((item) => item.representative_id)), [members])
}

export type { WorkGroupMember }
