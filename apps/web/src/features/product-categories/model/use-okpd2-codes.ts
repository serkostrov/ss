import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  okpd2CodesService,
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

export function useOkpd2Codes(activeOnly = false) {
  return useSupabaseQuery(
    activeOnly ? queryKeys.okpd2Codes.active : queryKeys.okpd2Codes.all,
    () => okpd2CodesService.list(activeOnly),
    { ensureFreshSession: true },
  )
}

export function useCreateOkpd2CodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { code: string; title: string; parentId?: string | null }) =>
      withSession(() => okpd2CodesService.create(input)),
    onSuccess: () => notify.success('Код ОКПД 2 добавлен'),
    onError: (error) => notify.fromError(error, 'Не удалось добавить код'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.okpd2Codes.all })
    },
  })
}

export function useUpdateOkpd2CodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      code?: string
      title?: string
      isActive?: boolean
    }) =>
      withSession(() =>
        okpd2CodesService.update(input.id, {
          code: input.code,
          title: input.title,
          is_active: input.isActive,
        }),
      ),
    onSuccess: () => notify.success('Код ОКПД 2 сохранён'),
    onError: (error) => notify.fromError(error, 'Не удалось сохранить код'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.okpd2Codes.all })
    },
  })
}

export function useDeleteOkpd2CodeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => withSession(() => okpd2CodesService.delete(id)),
    onSuccess: () => notify.success('Код ОКПД 2 удалён'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить код'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.okpd2Codes.all })
    },
  })
}
