import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  documentsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type MaterialDocument,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function documentsKey(sectionId: string) {
  return queryKeys.materials.documents(sectionId)
}

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

export function useMaterialDocuments(sectionId: string | undefined) {
  return useSupabaseQuery(
    documentsKey(sectionId ?? 'none'),
    () => {
      if (!sectionId) return Promise.resolve([] as MaterialDocument[])
      return documentsService.listBySection(sectionId)
    },
    {
      enabled: Boolean(sectionId),
      ensureFreshSession: true,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      meta: { suppressErrorToast: true },
    },
  )
}

export function useUploadMaterialDocumentMutation(sectionId: string) {
  const queryClient = useQueryClient()

  return useSupabaseMutation(
    (input: { file: File; title?: string }) =>
      documentsService.upload({ sectionId, file: input.file, title: input.title }),
    {
      ensureFreshSession: true,
      invalidateKeys: [documentsKey(sectionId), queryKeys.materials.all],
      onSuccess: async () => {
        notify.success('Документ загружен')
        await queryClient.invalidateQueries({ queryKey: documentsKey(sectionId) })
      },
      onError: (error) => notify.fromError(error, 'Не удалось загрузить документ'),
    },
  )
}

export function useDeleteMaterialDocumentMutation(sectionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (documentId: string) => withSession(() => documentsService.delete(documentId)),
    onMutate: async (documentId) => {
      await queryClient.cancelQueries({ queryKey: documentsKey(sectionId) })
      const previous = queryClient.getQueryData<MaterialDocument[]>(documentsKey(sectionId))
      queryClient.setQueryData<MaterialDocument[]>(documentsKey(sectionId), (current) =>
        current?.filter((item) => item.id !== documentId),
      )
      return { previous }
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(documentsKey(sectionId), context.previous)
      }
      notify.fromError(error, 'Не удалось удалить документ')
    },
    onSuccess: () => notify.success('Документ удалён'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsKey(sectionId) })
    },
  })
}

export function useMoveMaterialDocumentMutation(sectionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => documentsService.move(sectionId, input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: documentsKey(sectionId) })
      const previous = queryClient.getQueryData<MaterialDocument[]>(documentsKey(sectionId))
      if (!previous) return { previous }

      const index = previous.findIndex((item) => item.id === id)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index < 0 || target < 0 || target >= previous.length) return { previous }

      const next = [...previous]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      queryClient.setQueryData(
        documentsKey(sectionId),
        next.map((row, sort_order) => ({ ...row, sort_order })),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(documentsKey(sectionId), context.previous)
      }
      notify.fromError(error, 'Не удалось изменить порядок')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsKey(sectionId) })
    },
  })
}

export function useDownloadMaterialDocumentMutation() {
  return useMutation({
    mutationFn: async (document: MaterialDocument) => {
      const url = await withSession(() => documentsService.getDownloadUrl(document))
      triggerBrowserDownload(url, document.title)
      return document
    },
    onSuccess: (document) => notify.success(`Скачивание: ${document.title}`),
    onError: (error) => notify.fromError(error, 'Не удалось скачать документ'),
  })
}

export function usePreviewMaterialDocumentMutation() {
  return useMutation({
    mutationFn: (document: MaterialDocument) =>
      withSession(() => documentsService.getDownloadUrl(document, 60 * 15)),
    onError: (error) => notify.fromError(error, 'Не удалось открыть документ'),
  })
}
