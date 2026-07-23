import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  authService,
  levelsService,
  materialsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type MaterialSection,
  type MaterialSectionInput,
  type MaterialsListFilters,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function listKey(filters: MaterialsListFilters) {
  return queryKeys.materials.list({
    search: filters.search?.trim() || '',
    status: filters.status ?? 'all',
    levelId: filters.levelId?.trim() || '',
  })
}

const invalidateAll = [queryKeys.materials.all]

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

export function useMaterialSections(filters: MaterialsListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => materialsService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useMaterialSection(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.materials.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return materialsService.getById(id)
    },
    { enabled: Boolean(id), ensureFreshSession: true },
  )
}

export function useMaterialSectionBySlug(slug: string | undefined) {
  return useSupabaseQuery(
    queryKeys.materials.bySlug(slug ?? 'none'),
    () => {
      if (!slug) return Promise.resolve(null)
      return materialsService.getBySlug(slug)
    },
    { enabled: Boolean(slug), ensureFreshSession: true },
  )
}

export function useLevelsForMaterialAcl() {
  return useSupabaseQuery(
    queryKeys.levels.list({ search: '', active: 'all' }),
    () => levelsService.list({ active: 'all' }),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCreateMaterialSectionMutation() {
  return useSupabaseMutation((input: MaterialSectionInput) => materialsService.create(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Раздел создан'),
    onError: (error) => notify.fromError(error, 'Не удалось создать раздел'),
  })
}

export function useUpdateMaterialSectionMutation() {
  return useSupabaseMutation(
    (input: { id: string; values: MaterialSectionInput }) =>
      materialsService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Раздел сохранён'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить раздел'),
    },
  )
}

export function usePublishMaterialSectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; isPublished: boolean }) =>
      withSession(() => materialsService.setPublished(input.id, input.isPublished)),
    onMutate: async ({ id, isPublished }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.materials.all })
      const previous = queryClient.getQueriesData<MaterialSection[]>({
        queryKey: queryKeys.materials.all,
      })
      queryClient.setQueriesData<MaterialSection[]>(
        { queryKey: queryKeys.materials.all },
        (current) =>
          current?.map((item) => (item.id === id ? { ...item, is_published: isPublished } : item)),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notify.fromError(error, 'Не удалось изменить статус публикации')
    },
    onSuccess: (_data, variables) => {
      notify.success(variables.isPublished ? 'Раздел опубликован' : 'Раздел снят с публикации')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.materials.all })
    },
  })
}

export function useMoveMaterialSectionMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; direction: 'up' | 'down' }) =>
      withSession(() => materialsService.move(input.id, input.direction)),
    onMutate: async ({ id, direction }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.materials.all })
      const previous = queryClient.getQueriesData<MaterialSection[]>({
        queryKey: queryKeys.materials.all,
      })
      queryClient.setQueriesData<MaterialSection[]>(
        { queryKey: queryKeys.materials.all },
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
    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      notify.fromError(error, 'Не удалось изменить порядок')
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.materials.all })
    },
  })
}

export function useDeleteMaterialSectionMutation() {
  return useSupabaseMutation((id: string) => materialsService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Раздел удалён'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить раздел'),
  })
}

export function toMaterialSectionInput(values: {
  title: string
  slug?: string
  description?: string
  content?: string
  isPublished: boolean
  levelIds: string[]
}): MaterialSectionInput {
  return {
    title: values.title,
    slug: values.slug || null,
    description: values.description || null,
    content: values.content || null,
    is_published: values.isPublished,
    level_ids: values.levelIds,
  }
}

export type { MaterialSection }
