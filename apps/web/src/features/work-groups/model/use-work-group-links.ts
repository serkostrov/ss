import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  workGroupLinksService,
  type WorkGroupLink,
  type WorkGroupLinkUpdateInput,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function linksKey(workGroupId: string) {
  return queryKeys.workGroups.links(workGroupId)
}

const invalidate = (workGroupId: string) => [
  linksKey(workGroupId),
  queryKeys.workGroups.detail(workGroupId),
]

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
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

export function useWorkGroupLinks(workGroupId: string | undefined) {
  return useSupabaseQuery(
    linksKey(workGroupId ?? 'none'),
    () => {
      if (!workGroupId) return Promise.resolve([] as WorkGroupLink[])
      return workGroupLinksService.listByGroup(workGroupId)
    },
    {
      enabled: Boolean(workGroupId),
      ensureFreshSession: true,
      staleTime: 30_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useCreateWorkGroupExternalLinkMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: { title: string; url: string; description?: string }) =>
      workGroupLinksService.createExternal({
        workGroupId,
        title: input.title,
        url: input.url,
        description: input.description,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidate(workGroupId),
      onSuccess: () => notify.success('Ссылка добавлена'),
      onError: (error) => notify.fromError(error, 'Не удалось добавить ссылку'),
    },
  )
}

export function useUploadWorkGroupFileMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: { file: File; title?: string; description?: string }) =>
      workGroupLinksService.uploadFile({
        workGroupId,
        file: input.file,
        title: input.title,
        description: input.description,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidate(workGroupId),
      onSuccess: () => notify.success('Файл загружен'),
      onError: (error) => notify.fromError(error, 'Не удалось загрузить файл'),
    },
  )
}

export function useUpdateWorkGroupLinkMutation(workGroupId: string) {
  return useSupabaseMutation(
    (input: { id: string; values: WorkGroupLinkUpdateInput }) =>
      workGroupLinksService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidate(workGroupId),
      onSuccess: () => notify.success('Запись сохранена'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить'),
    },
  )
}

export function useDeleteWorkGroupLinkMutation(workGroupId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (linkId: string) => withSession(() => workGroupLinksService.delete(linkId)),
    onMutate: async (linkId) => {
      await queryClient.cancelQueries({ queryKey: linksKey(workGroupId) })
      const previous = queryClient.getQueryData<WorkGroupLink[]>(linksKey(workGroupId))
      queryClient.setQueryData<WorkGroupLink[]>(linksKey(workGroupId), (current) =>
        current?.filter((item) => item.id !== linkId),
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(linksKey(workGroupId), context.previous)
      notify.fromError(error, 'Не удалось удалить')
    },
    onSuccess: () => notify.success('Удалено'),
    onSettled: async () => {
      await Promise.all(
        invalidate(workGroupId).map((key) => queryClient.invalidateQueries({ queryKey: key })),
      )
    },
  })
}

export function useMoveWorkGroupLinkMutation(workGroupId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => workGroupLinksService.move(workGroupId, input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: linksKey(workGroupId) })
      const previous = queryClient.getQueryData<WorkGroupLink[]>(linksKey(workGroupId))
      if (!previous) return { previous }

      const index = previous.findIndex((item) => item.id === id)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || target < 0 || target >= previous.length) return { previous }

      const next = [...previous]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      queryClient.setQueryData(
        linksKey(workGroupId),
        next.map((row, sort_order) => ({ ...row, sort_order })),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(linksKey(workGroupId), context.previous)
      notify.fromError(error, 'Не удалось изменить порядок')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: linksKey(workGroupId) })
    },
  })
}

export function useDownloadWorkGroupFileMutation() {
  return useMutation({
    mutationFn: async (link: WorkGroupLink) => {
      const url = await withSession(() => workGroupLinksService.getDownloadUrl(link))
      triggerBrowserDownload(url, link.title)
      return link
    },
    onSuccess: (link) => notify.success(`Скачивание: ${link.title}`),
    onError: (error) => notify.fromError(error, 'Не удалось скачать файл'),
  })
}

export function usePreviewWorkGroupFileMutation() {
  return useMutation({
    mutationFn: (link: WorkGroupLink) =>
      withSession(() => workGroupLinksService.getDownloadUrl(link, 60 * 15)),
    onError: (error) => notify.fromError(error, 'Не удалось открыть файл'),
  })
}

export type { WorkGroupLink }
