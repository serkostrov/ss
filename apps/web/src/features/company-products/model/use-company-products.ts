import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  companyProductsService,
  queryKeys,
  useSupabaseQuery,
  type CompanyProduct,
  type CompanyProductInput,
  type CompanyProductUpdateInput,
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

function productsKey(companyId: string) {
  return queryKeys.companyProducts.byCompany(companyId)
}

export function useCompanyProducts(companyId: string | undefined) {
  return useSupabaseQuery(
    productsKey(companyId ?? 'none'),
    () => {
      if (!companyId) return Promise.resolve([])
      return companyProductsService.listByCompany(companyId)
    },
    { enabled: Boolean(companyId), ensureFreshSession: true },
  )
}

export function useCreateCompanyProductMutation(companyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<CompanyProductInput, 'companyId'>) =>
      withSession(() => companyProductsService.create({ ...input, companyId })),
    onSuccess: () => notify.success('Продукция отправлена на модерацию'),
    onError: (error) => notify.fromError(error, 'Не удалось добавить продукцию'),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKey(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companyProducts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directory.all }),
      ])
    },
  })
}

export function useUpdateCompanyProductMutation(companyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; values: CompanyProductUpdateInput }) =>
      withSession(() => companyProductsService.update(input.id, input.values)),
    onSuccess: () => notify.success('Изменения отправлены на модерацию'),
    onError: (error) => notify.fromError(error, 'Не удалось сохранить продукцию'),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKey(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companyProducts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directory.all }),
      ])
    },
  })
}

export function useCompanyProductsForModeration(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
) {
  return useSupabaseQuery(
    queryKeys.companyProducts.moderation(status),
    () => companyProductsService.listForModeration(status),
    { ensureFreshSession: true },
  )
}

export function useReviewCompanyProductMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; approve: boolean; note?: string | null }) =>
      withSession(() => companyProductsService.review(input.id, input.approve, input.note)),
    onSuccess: (_data, input) =>
      notify.success(input.approve ? 'Продукция одобрена' : 'Продукция отклонена'),
    onError: (error) => notify.fromError(error, 'Не удалось обработать продукцию'),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.companyProducts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directory.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.okpd2Codes.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.productNotes.all }),
      ])
    },
  })
}

export function useDeleteCompanyProductMutation(companyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => withSession(() => companyProductsService.delete(id)),
    onSuccess: () => notify.success('Продукция удалена'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить продукцию'),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKey(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.directory.all }),
      ])
    },
  })
}

export function useMoveCompanyProductMutation(companyId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => companyProductsService.move(companyId, input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: productsKey(companyId) })
      const previous = queryClient.getQueryData<CompanyProduct[]>(productsKey(companyId))

      queryClient.setQueryData<CompanyProduct[]>(productsKey(companyId), (current) => {
        if (!current?.length) return current
        const index = current.findIndex((item) => item.id === id)
        if (index < 0) return current
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= current.length) return current
        const next = [...current]
        const [item] = next.splice(index, 1)
        next.splice(target, 0, item)
        return next.map((row, order) => ({ ...row, sort_order: order }))
      })

      return { previous }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(productsKey(companyId), context.previous)
      }
      notify.fromError(error, 'Не удалось изменить порядок')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: productsKey(companyId) })
    },
  })
}
