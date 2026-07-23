import {
  queryKeys,
  representativesService,
  useSupabaseMutation,
  useSupabaseQuery,
  workGroupsService,
  type WorkGroup,
  type WorkGroupInput,
  type WorkGroupsListFilters,
  type WorkGroupStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

function listKey(filters: WorkGroupsListFilters) {
  return queryKeys.workGroups.list({
    search: filters.search?.trim() || '',
    status: filters.status ?? 'all',
  })
}

const invalidateAll = [queryKeys.workGroups.all]

export function useWorkGroups(filters: WorkGroupsListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => workGroupsService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useWorkGroup(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.workGroups.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return workGroupsService.getById(id)
    },
    { enabled: Boolean(id), ensureFreshSession: true },
  )
}

export function useRepresentativesForWorkGroupSelect() {
  return useSupabaseQuery(
    [...queryKeys.representatives.all, 'options-active'] as const,
    () => representativesService.listOptions(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCreateWorkGroupMutation() {
  return useSupabaseMutation((input: WorkGroupInput) => workGroupsService.create(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Рабочая группа создана'),
    onError: (error) => notify.fromError(error, 'Не удалось создать группу'),
  })
}

export function useUpdateWorkGroupMutation() {
  return useSupabaseMutation(
    (input: { id: string; values: WorkGroupInput }) =>
      workGroupsService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Группа сохранена'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить группу'),
    },
  )
}

export function useSetWorkGroupStatusMutation() {
  return useSupabaseMutation(
    (input: { id: string; status: WorkGroupStatus }) =>
      workGroupsService.setStatus(input.id, input.status),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        const labels: Record<WorkGroupStatus, string> = {
          active: 'Группа активирована',
          paused: 'Группа на паузе',
          archived: 'Группа в архиве',
        }
        notify.success(labels[variables.status])
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}

export function useDeleteWorkGroupMutation() {
  return useSupabaseMutation((id: string) => workGroupsService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Группа удалена'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить группу'),
  })
}

export function toWorkGroupInput(values: {
  name: string
  description?: string
  responsibleRepresentativeId?: string
  status: WorkGroupStatus
}): WorkGroupInput {
  return {
    name: values.name,
    description: values.description || null,
    responsible_representative_id: values.responsibleRepresentativeId || null,
    status: values.status,
  }
}

export type { WorkGroup }
