import { useQueryClient } from '@tanstack/react-query'

import {
  productCategoriesService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type ProductCategorySuggestionStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateKeys = [
  queryKeys.productCategories.all,
  queryKeys.companyProducts.all,
  queryKeys.directory.all,
]

export function useProductCategories(activeOnly = false) {
  return useSupabaseQuery(
    activeOnly ? queryKeys.productCategories.active : queryKeys.productCategories.all,
    () => productCategoriesService.list(activeOnly),
    { ensureFreshSession: true, staleTime: activeOnly ? 30_000 : 0 },
  )
}

export function useCreateProductCategoryMutation() {
  return useSupabaseMutation((name: string) => productCategoriesService.create(name), {
    ensureFreshSession: true,
    invalidateKeys,
    onSuccess: () => notify.success('Категория создана'),
    onError: (error) => notify.fromError(error, 'Не удалось создать категорию'),
  })
}

export function useUpdateProductCategoryMutation() {
  return useSupabaseMutation(
    (input: { id: string; name?: string; isActive?: boolean }) =>
      productCategoriesService.update(input.id, {
        name: input.name,
        is_active: input.isActive,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys,
      onSuccess: () => notify.success('Категория обновлена'),
      onError: (error) => notify.fromError(error, 'Не удалось обновить категорию'),
    },
  )
}

export function useDeleteProductCategoryMutation() {
  return useSupabaseMutation((id: string) => productCategoriesService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys,
    onSuccess: () => notify.success('Категория удалена'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить категорию'),
  })
}

export function useProposeProductCategoryMutation(companyId: string) {
  const queryClient = useQueryClient()
  return useSupabaseMutation(
    (input: { productId: string; name: string }) =>
      productCategoriesService.propose(input.productId, input.name),
    {
      ensureFreshSession: true,
      invalidateKeys,
      onSuccess: async () => {
        notify.success('Предложение отправлено администратору')
        await queryClient.invalidateQueries({
          queryKey: queryKeys.companyProducts.byCompany(companyId),
        })
      },
      onError: (error) => notify.fromError(error, 'Не удалось отправить предложение'),
    },
  )
}

export function useProductCategorySuggestions(
  status: ProductCategorySuggestionStatus | 'all' = 'pending',
) {
  return useSupabaseQuery(
    queryKeys.productCategories.suggestions(status),
    () => productCategoriesService.listSuggestions(status),
    { ensureFreshSession: true },
  )
}

export function useReviewProductCategorySuggestionMutation() {
  return useSupabaseMutation(
    (input: {
      id: string
      approve: boolean
      categoryId?: string | null
      note?: string | null
    }) =>
      productCategoriesService.review(input.id, input.approve, {
        categoryId: input.categoryId,
        note: input.note,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys: [
        ...invalidateKeys,
        ['apss', 'product-category-suggestions'] as const,
      ],
      onSuccess: (_data, input) =>
        notify.success(input.approve ? 'Категория одобрена' : 'Предложение отклонено'),
      onError: (error) => notify.fromError(error, 'Не удалось обработать предложение'),
    },
  )
}
