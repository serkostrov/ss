import {
  companyAccessStatusesService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type CompanyAccessStatusInput,
  type CompanyAccessStatusRecord,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

const invalidateKeys = [
  queryKeys.companyAccessStatuses.all,
  queryKeys.companyAccessStatuses.resourceAccessAll,
  queryKeys.companies.all,
]

export function useCompanyAccessStatuses(includeInactive = true) {
  return useSupabaseQuery(
    queryKeys.companyAccessStatuses.list(includeInactive),
    () => companyAccessStatusesService.list(includeInactive),
    { ensureFreshSession: true, staleTime: 60_000 },
  )
}

export function useCompanyAccessStatusUsage(slug: string | null) {
  return useSupabaseQuery(
    queryKeys.companyAccessStatuses.usage(slug ?? 'none'),
    () => {
      if (!slug) return Promise.resolve({ companies: 0 })
      return companyAccessStatusesService.getUsage(slug)
    },
    { enabled: Boolean(slug), ensureFreshSession: true },
  )
}

export function useCreateCompanyAccessStatusMutation() {
  return useSupabaseMutation(
    (input: CompanyAccessStatusInput) => companyAccessStatusesService.create(input),
    {
      ensureFreshSession: true,
      invalidateKeys,
      onSuccess: () => notify.success('Статус доступа добавлен'),
      onError: (error) => notify.fromError(error, 'Не удалось добавить статус'),
    },
  )
}

export function useUpdateCompanyAccessStatusMutation() {
  return useSupabaseMutation(
    (input: {
      slug: string
      values: Partial<CompanyAccessStatusInput> & { isDefault?: boolean }
    }) => companyAccessStatusesService.update(input.slug, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys,
      onSuccess: () => notify.success('Статус доступа сохранён'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить статус'),
    },
  )
}

export function useDeleteCompanyAccessStatusMutation() {
  return useSupabaseMutation((slug: string) => companyAccessStatusesService.delete(slug), {
    ensureFreshSession: true,
    invalidateKeys,
    onSuccess: () => notify.success('Статус доступа удалён'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить статус'),
  })
}

export function useMoveCompanyAccessStatusMutation() {
  return useSupabaseMutation(
    (orderedSlugs: string[]) => companyAccessStatusesService.reorder(orderedSlugs),
    {
      ensureFreshSession: true,
      invalidateKeys,
      onError: (error) => notify.fromError(error, 'Не удалось изменить порядок'),
    },
  )
}

export function companyAccessStatusLabel(
  slug: string,
  statuses?: CompanyAccessStatusRecord[] | null,
): string {
  const row = statuses?.find((item) => item.slug === slug)
  if (row) return row.name
  switch (slug) {
    case 'active':
      return 'Активна'
    case 'suspended':
      return 'Приостановлена'
    case 'archived':
      return 'Вышедшая'
    default:
      return slug
  }
}

export function companyAccessStatusMemberLabel(
  slug: string,
  statuses?: CompanyAccessStatusRecord[] | null,
): string {
  return companyAccessStatusLabel(slug, statuses)
}

export type { CompanyAccessStatusRecord }
