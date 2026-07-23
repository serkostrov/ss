import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  workGroupCategoriesService,
  queryKeys,
  useSupabaseQuery,
  authService,
  type WorkGroupCategoriesListFilters,
  type WorkGroupCategory,
  type WorkGroupCategoryInput,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function listKey(filters: WorkGroupCategoriesListFilters) {
  return queryKeys.workGroups.categoriesList({
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
    queryClient.invalidateQueries({ queryKey: queryKeys.workGroups.categories }),
    queryClient.invalidateQueries({ queryKey: queryKeys.workGroups.all }),
  ])
}

export function useDirections(filters: WorkGroupCategoriesListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => workGroupCategoriesService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useDirectionUsage(categoryId: string | null) {
  return useSupabaseQuery(
    queryKeys.workGroups.categoryUsage(categoryId ?? 'none'),
    () => {
      if (!categoryId) return Promise.resolve(null)
      return workGroupCategoriesService.getUsage(categoryId)
    },
    { enabled: Boolean(categoryId), ensureFreshSession: true },
  )
}

export function useCreateDirectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: WorkGroupCategoryInput) =>
      withSession(() => workGroupCategoriesService.create(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.workGroups.categories, 'list'] })
      const previous = queryClient.getQueriesData<WorkGroupCategory[]>({
        queryKey: [...queryKeys.workGroups.categories, 'list'],
      })

      const optimistic: WorkGroupCategory = {
        id: `temp-${crypto.randomUUID()}`,
        name: input.name.trim(),
        slug: input.slug?.trim() || input.name.trim().toLowerCase(),
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? Number.MAX_SAFE_INTEGER,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueriesData<WorkGroupCategory[]>(
        { queryKey: [...queryKeys.workGroups.categories, 'list'] },
        (current) => (current ? [...current, optimistic] : [optimistic]),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось создать направление')
    },
    onSuccess: () => notify.success('Направление создано'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useUpdateDirectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; values: WorkGroupCategoryInput }) =>
      withSession(() => workGroupCategoriesService.update(input.id, input.values)),
    onMutate: async ({ id, values }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.workGroups.categories, 'list'] })
      const previous = queryClient.getQueriesData<WorkGroupCategory[]>({
        queryKey: [...queryKeys.workGroups.categories, 'list'],
      })

      queryClient.setQueriesData<WorkGroupCategory[]>(
        { queryKey: [...queryKeys.workGroups.categories, 'list'] },
        (current) =>
          current?.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: values.name.trim(),
                  is_active: values.is_active ?? item.is_active,
                  sort_order: values.sort_order ?? item.sort_order,
                }
              : item,
          ),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось сохранить направление')
    },
    onSuccess: () => notify.success('Направление обновлено'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useToggleDirectionActiveMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      withSession(() => workGroupCategoriesService.setActive(input.id, input.isActive)),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.workGroups.categories, 'list'] })
      const previous = queryClient.getQueriesData<WorkGroupCategory[]>({
        queryKey: [...queryKeys.workGroups.categories, 'list'],
      })

      queryClient.setQueriesData<WorkGroupCategory[]>(
        { queryKey: [...queryKeys.workGroups.categories, 'list'] },
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
      notify.success(variables.isActive ? 'Направление активировано' : 'Направление скрыто')
    },
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}

export function useMoveDirectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => workGroupCategoriesService.move(input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.workGroups.categories, 'list'] })
      const previous = queryClient.getQueriesData<WorkGroupCategory[]>({
        queryKey: [...queryKeys.workGroups.categories, 'list'],
      })

      queryClient.setQueriesData<WorkGroupCategory[]>(
        { queryKey: [...queryKeys.workGroups.categories, 'list'] },
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

export function useDeleteDirectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (categoryId: string) =>
      withSession(() => workGroupCategoriesService.delete(categoryId)),
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({ queryKey: [...queryKeys.workGroups.categories, 'list'] })
      const previous = queryClient.getQueriesData<WorkGroupCategory[]>({
        queryKey: [...queryKeys.workGroups.categories, 'list'],
      })

      queryClient.setQueriesData<WorkGroupCategory[]>(
        { queryKey: [...queryKeys.workGroups.categories, 'list'] },
        (current) => current?.filter((item) => item.id !== categoryId),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось удалить направление')
    },
    onSuccess: () => notify.success('Направление удалено'),
    onSettled: async () => {
      await invalidateCategories(queryClient)
    },
  })
}
