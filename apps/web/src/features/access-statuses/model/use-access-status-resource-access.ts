import {
  companyAccessStatusResourceAccessService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type AccessStatusResourceAccessRow,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateKeys = [
  queryKeys.companyAccessStatuses.resourceAccessAll,
  queryKeys.companyAccessStatuses.all,
]

export function useAllAccessStatusResourceAccess() {
  return useSupabaseQuery(
    queryKeys.companyAccessStatuses.resourceAccessAll,
    () => companyAccessStatusResourceAccessService.listGrouped(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useAccessStatusResourceAccess(slug: string | null) {
  return useSupabaseQuery(
    queryKeys.companyAccessStatuses.resourceAccess(slug ?? 'none'),
    () => {
      if (!slug) return Promise.resolve([] as AccessStatusResourceAccessRow[])
      return companyAccessStatusResourceAccessService.getForStatus(slug)
    },
    { enabled: Boolean(slug), ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useSaveAccessStatusResourceAccessMutation(fallbackSlug = '') {
  return useSupabaseMutation(
    (input: { slug?: string; rows: AccessStatusResourceAccessRow[] }) => {
      const slug = input.slug ?? fallbackSlug
      if (!slug) {
        return Promise.reject(new Error('Не указан код статуса'))
      }
      return companyAccessStatusResourceAccessService.saveForStatus(slug, input.rows)
    },
    {
      ensureFreshSession: true,
      invalidateKeys: [
        ...invalidateKeys,
        ...(fallbackSlug
          ? [queryKeys.companyAccessStatuses.resourceAccess(fallbackSlug)]
          : []),
      ],
      onError: (error) => notify.fromError(error, 'Не удалось сохранить возможности статуса'),
    },
  )
}
