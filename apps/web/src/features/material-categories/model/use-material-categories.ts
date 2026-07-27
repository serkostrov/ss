import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  materialCategoriesService,
  queryKeys,
  useSupabaseQuery,
  authService,
  type MaterialCategoriesListFilters,
  type MaterialCategory,
  type MaterialCategoryInput,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function listKey(filters: MaterialCategoriesListFilters) {
  return queryKeys.materials.categoriesList({
    search: filters.search?.trim() || '',
    active: filters.active ?? 'all',
  })
}

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

async function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.materials.categories }),
    queryClient.invalidateQueries({ queryKey: queryKeys.materials.all }),
  ])
}

export function useMaterialCategories(filters: MaterialCategoriesListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => materialCategoriesService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useActiveMaterialCategories() {
  return useSupabaseQuery(
    queryKeys.materials.categories,
    () => materialCategoriesService.listActive(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useMaterialCategoryUsage(categoryId: string | null) {
  return useSupabaseQuery(
    queryKeys.materials.categoryUsage(categoryId ?? 'none'),
    () => {
      if (!categoryId) return Promise.resolve(null)
      return materialCategoriesService.getUsage(categoryId)
    },
    { enabled: Boolean(categoryId), ensureFreshSession: true },
  )
}

export function useCreateMaterialCategoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: MaterialCategoryInput) =>
      withSession(() => materialCategoriesService.create(input)),
    onError: (error) => notify.fromError(error, 'Не удалось создать категорию'),
    onSuccess: () => notify.success('Категория создана'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useUpdateMaterialCategoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; values: MaterialCategoryInput }) =>
      withSession(() => materialCategoriesService.update(input.id, input.values)),
    onError: (error) => notify.fromError(error, 'Не удалось сохранить категорию'),
    onSuccess: () => notify.success('Категория обновлена'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useToggleMaterialCategoryActiveMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      withSession(() => materialCategoriesService.setActive(input.id, input.isActive)),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.materials.categories, 'list'] })
      const previous = queryClient.getQueriesData<MaterialCategory[]>({
        queryKey: [...queryKeys.materials.categories, 'list'],
      })

      queryClient.setQueriesData<MaterialCategory[]>(
        { queryKey: [...queryKeys.materials.categories, 'list'] },
        (current) =>
          current?.map((item) => (item.id === id ? { ...item, is_active: isActive } : item)),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось изменить видимость')
    },
    onSuccess: (_data, variables) => {
      notify.success(variables.isActive ? 'Категория активирована' : 'Категория скрыта')
    },
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useMoveMaterialCategoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => materialCategoriesService.move(input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.materials.categories, 'list'] })
      const previous = queryClient.getQueriesData<MaterialCategory[]>({
        queryKey: [...queryKeys.materials.categories, 'list'],
      })

      queryClient.setQueriesData<MaterialCategory[]>(
        { queryKey: [...queryKeys.materials.categories, 'list'] },
        (current) => {
          if (!current?.length) return current
          const index = current.findIndex((item) => item.id === id)
          if (index < 0) return current
          const target = direction === 'up' ? index - 1 : index + 1
          if (target < 0 || target >= current.length) return current

          const next = [...current]
          const [item] = next.splice(index, 1)
          next.splice(target, 0, item)
          return next.map((row, order) => ({ ...row, sort_order: order }))
        },
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось изменить порядок')
    },
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useDeleteMaterialCategoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (categoryId: string) =>
      withSession(() => materialCategoriesService.delete(categoryId)),
    onError: (error) => notify.fromError(error, 'Не удалось удалить категорию'),
    onSuccess: () => notify.success('Категория удалена'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}
