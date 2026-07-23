import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  levelsService,
  queryKeys,
  useSupabaseQuery,
  authService,
  type LevelsListFilters,
  type ParticipationLevel,
  type ParticipationLevelInput,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function listKey(filters: LevelsListFilters) {
  return queryKeys.levels.list({
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

export function useParticipationLevels(filters: LevelsListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => levelsService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useParticipationLevelUsage(levelId: string | null) {
  return useSupabaseQuery(
    queryKeys.levels.usage(levelId ?? 'none'),
    () => {
      if (!levelId) return Promise.resolve(null)
      return levelsService.getUsage(levelId)
    },
    { enabled: Boolean(levelId), ensureFreshSession: true },
  )
}

export function useCreateLevelMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ParticipationLevelInput) => withSession(() => levelsService.create(input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.levels.all })
      const previous = queryClient.getQueriesData<ParticipationLevel[]>({
        queryKey: queryKeys.levels.all,
      })

      const optimistic: ParticipationLevel = {
        id: `temp-${crypto.randomUUID()}`,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? Number.MAX_SAFE_INTEGER,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueriesData<ParticipationLevel[]>(
        { queryKey: queryKeys.levels.all },
        (current) => (current ? [...current, optimistic] : [optimistic]),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось создать уровень')
    },
    onSuccess: () => notify.success('Уровень создан'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.levels.all })
    },
  })
}

export function useUpdateLevelMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; values: ParticipationLevelInput }) =>
      withSession(() => levelsService.update(input.id, input.values)),
    onMutate: async ({ id, values }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.levels.all })
      const previous = queryClient.getQueriesData<ParticipationLevel[]>({
        queryKey: queryKeys.levels.all,
      })

      queryClient.setQueriesData<ParticipationLevel[]>(
        { queryKey: queryKeys.levels.all },
        (current) =>
          current?.map((item) =>
            item.id === id
              ? {
                  ...item,
                  name: values.name.trim(),
                  description: values.description?.trim() || null,
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
      notify.fromError(error, 'Не удалось сохранить уровень')
    },
    onSuccess: () => notify.success('Уровень обновлён'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.levels.all })
    },
  })
}

export function useToggleLevelActiveMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      withSession(() => levelsService.setActive(input.id, input.isActive)),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.levels.all })
      const previous = queryClient.getQueriesData<ParticipationLevel[]>({
        queryKey: queryKeys.levels.all,
      })

      queryClient.setQueriesData<ParticipationLevel[]>(
        { queryKey: queryKeys.levels.all },
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
      notify.success(variables.isActive ? 'Уровень активирован' : 'Уровень скрыт')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.levels.all })
    },
  })
}

export function useMoveLevelMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => levelsService.move(input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.levels.all })
      const previous = queryClient.getQueriesData<ParticipationLevel[]>({
        queryKey: queryKeys.levels.all,
      })

      queryClient.setQueriesData<ParticipationLevel[]>(
        { queryKey: queryKeys.levels.all },
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.levels.all })
    },
  })
}

export function useDeleteLevelMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (levelId: string) => withSession(() => levelsService.delete(levelId)),
    onMutate: async (levelId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.levels.all })
      const previous = queryClient.getQueriesData<ParticipationLevel[]>({
        queryKey: queryKeys.levels.all,
      })

      queryClient.setQueriesData<ParticipationLevel[]>(
        { queryKey: queryKeys.levels.all },
        (current) => current?.filter((item) => item.id !== levelId),
      )

      return { previous }
    },
    onError: (error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      notify.fromError(error, 'Не удалось удалить уровень')
    },
    onSuccess: () => notify.success('Уровень удалён'),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.levels.all })
    },
  })
}
