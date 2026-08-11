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
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

export function useCabinetWorkGroups() {
  return useSupabaseQuery(
    queryKeys.workGroups.cabinetList,
    () => cabinetWorkGroupsService.list(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCabinetWorkGroupsSearch(search: string) {
  const query = useCabinetWorkGroups()
  const term = search.trim().toLowerCase()

  const items = useMemo(() => {
    const rows = query.data ?? []
    if (!term) return rows
    return rows.filter((row) => {
      const haystack = [row.name, row.description, row.category_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [query.data, term])

  return {
    ...query,
    items,
    totalCount: query.data?.length ?? 0,
  }
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
