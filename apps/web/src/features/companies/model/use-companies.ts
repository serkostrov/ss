import {
  authService,
  companiesService,
  levelsService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type CompaniesListFilters,
  type Company,
  type CompanyAccessStatus,
  type CompanyInput,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

function listKey(filters: CompaniesListFilters) {
  return queryKeys.companies.list({
    search: filters.search?.trim() || '',
    accessStatus: filters.accessStatus ?? 'all',
    levelId: filters.levelId ?? 'all',
  })
}

const invalidateAll = [queryKeys.companies.all, queryKeys.registrations.all]

export function useCompanies(filters: CompaniesListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => companiesService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useCompany(companyId: string | undefined) {
  return useSupabaseQuery(
    queryKeys.companies.detail(companyId ?? 'none'),
    () => {
      if (!companyId) return Promise.resolve(null)
      return companiesService.getById(companyId)
    },
    {
      enabled: Boolean(companyId),
      ensureFreshSession: true,
    },
  )
}

export function useActiveLevelsForSelect() {
  return useSupabaseQuery(
    queryKeys.levels.list({ search: '', active: 'active' }),
    () => levelsService.list({ active: 'active' }),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCreateCompanyMutation() {
  return useSupabaseMutation((input: CompanyInput) => companiesService.create(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Компания создана'),
    onError: (error) => notify.fromError(error, 'Не удалось создать компанию'),
  })
}

export function useUpdateCompanyMutation() {
  return useSupabaseMutation(
    (input: { id: string; values: CompanyInput }) => companiesService.update(input.id, input.values),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Компания сохранена'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить компанию'),
    },
  )
}

export function useSetCompanyStatusMutation() {
  return useSupabaseMutation(
    (input: { id: string; status: CompanyAccessStatus }) =>
      companiesService.setAccessStatus(input.id, input.status),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        const labels: Record<CompanyAccessStatus, string> = {
          active: 'Компания активирована',
          suspended: 'Доступ приостановлен',
          archived: 'Компания в архиве',
        }
        notify.success(labels[variables.status])
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}

export function useDeleteCompanyMutation() {
  return useSupabaseMutation((id: string) => companiesService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Компания удалена'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить компанию'),
  })
}

export function toCompanyInput(values: {
  name: string
  inn?: string
  description?: string
  phone?: string
  email?: string
  website?: string
  address?: string
  participationLevelId?: string
  accessStatus: CompanyAccessStatus
  notes?: string
}): CompanyInput {
  return {
    name: values.name,
    inn: values.inn || null,
    description: values.description || null,
    phone: values.phone || null,
    email: values.email || null,
    website: values.website || null,
    address: values.address || null,
    participation_level_id: values.participationLevelId || null,
    access_status: values.accessStatus,
    notes: values.notes || null,
  }
}

/** Prefetch helper for detail navigation */
export async function prefetchCompany(id: string) {
  await authService.ensureFreshSession()
  return companiesService.getById(id)
}

export type { Company }
