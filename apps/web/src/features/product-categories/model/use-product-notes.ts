import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  productNotesService,
  queryKeys,
  useSupabaseQuery,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

export function useProductNotes(activeOnly = false) {
  return useSupabaseQuery(
    activeOnly ? queryKeys.productNotes.active : queryKeys.productNotes.all,
    () => productNotesService.list(activeOnly),
    { ensureFreshSession: true },
  )
}

export function useCreateProductNoteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => withSession(() => productNotesService.create(name)),
    onSuccess: () => notify.success('Примечание добавлено'),
    onError: (error) => notify.fromError(error, 'Не удалось добавить примечание'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.productNotes.all })
    },
  })
}

export function useUpdateProductNoteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; isActive?: boolean }) =>
      withSession(() =>
        productNotesService.update(input.id, {
          name: input.name,
          is_active: input.isActive,
        }),
      ),
    onSuccess: () => notify.success('Примечание сохранено'),
    onError: (error) => notify.fromError(error, 'Не удалось сохранить примечание'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.productNotes.all })
    },
  })
}

export function useDeleteProductNoteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => withSession(() => productNotesService.delete(id)),
    onSuccess: () => notify.success('Примечание удалено'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить примечание'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.productNotes.all })
    },
  })
}
