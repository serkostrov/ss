import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  cabinetWorkGroupsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type CabinetWorkGroup,
  type WorkGroupLink,
  type WorkGroupMembershipRequestKind,
} from '@shared/api'
import type { WorkGroupStatusFilter } from '@features/work-groups'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

export type CabinetWorkGroupsFilters = {
  search?: string
  status?: WorkGroupStatusFilter
  categoryId?: string
}

export function useCabinetWorkGroups() {
  return useSupabaseQuery(
    queryKeys.workGroups.cabinetList,
    () => cabinetWorkGroupsService.list(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCabinetWorkGroupsFiltered(filters: CabinetWorkGroupsFilters = {}) {
  const query = useCabinetWorkGroups()
  const search = filters.search?.trim().toLowerCase() ?? ''
  const status = filters.status ?? 'all'
  const categoryId = filters.categoryId ?? 'all'

  const items = useMemo(() => {
    let rows = query.data ?? []

    if (status !== 'all') {
      rows = rows.filter((row) => row.status === status)
    }

    if (categoryId !== 'all') {
      rows = rows.filter((row) => row.category_id === categoryId)
    }

    if (search) {
      rows = rows.filter((row) => {
        const haystack = [row.name, row.description, row.category_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(search)
      })
    }

    return rows
  }, [query.data, search, status, categoryId])

  return {
    ...query,
    items,
    totalCount: query.data?.length ?? 0,
  }
}

/** @deprecated Use useCabinetWorkGroupsFiltered */
export function useCabinetWorkGroupsSearch(search: string) {
  return useCabinetWorkGroupsFiltered({ search })
}

export function useCabinetWorkGroup(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.workGroups.cabinetDetail(id ?? 'none'),
    async (): Promise<CabinetWorkGroup | null> => {
      if (!id) return null
      return cabinetWorkGroupsService.getById(id)
    },
    {
      enabled: Boolean(id),
      ensureFreshSession: true,
      staleTime: 30_000,
    },
  )
}

export function useCabinetWorkGroupLinks(workGroupId: string | undefined, enabled: boolean) {
  return useSupabaseQuery(
    queryKeys.workGroups.links(workGroupId ?? 'none'),
    async (): Promise<WorkGroupLink[]> => {
      if (!workGroupId) return []
      return cabinetWorkGroupsService.listLinks(workGroupId)
    },
    {
      enabled: Boolean(workGroupId) && enabled,
      ensureFreshSession: true,
      staleTime: 30_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useRequestWorkGroupMembershipMutation() {
  const queryClient = useQueryClient()

  return useSupabaseMutation(
    (input: { workGroupId: string; kind: WorkGroupMembershipRequestKind }) =>
      cabinetWorkGroupsService.requestMembership(input.workGroupId, input.kind),
    {
      ensureFreshSession: true,
      onSuccess: (_data, input) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workGroups.cabinetList })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.workGroups.cabinetDetail(input.workGroupId),
        })
        void queryClient.invalidateQueries({
          queryKey: ['apss', 'work-groups', 'membership-requests'],
        })
        notify.success(
          input.kind === 'join'
            ? 'Заявка на вступление отправлена'
            : 'Заявка на выход отправлена',
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось отправить заявку'),
    },
  )
}

function triggerBrowserDownload(url: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noreferrer'
  anchor.target = '_blank'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function useCabinetDownloadWorkGroupFileMutation() {
  return useMutation({
    mutationFn: async (link: WorkGroupLink) => {
      const url = await cabinetWorkGroupsService.getDownloadUrl(link)
      triggerBrowserDownload(url, link.title)
      return url
    },
    onError: (error) => notify.fromError(toApiError(error), 'Не удалось скачать файл'),
  })
}

export function useCabinetPreviewWorkGroupFileMutation() {
  return useMutation({
    mutationFn: async (link: WorkGroupLink) => {
      return cabinetWorkGroupsService.getDownloadUrl(link)
    },
    onError: (error) => notify.fromError(toApiError(error), 'Не удалось открыть файл'),
  })
}
