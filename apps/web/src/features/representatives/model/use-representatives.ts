import {
  companiesService,
  queryKeys,
  representativesService,
  useSupabaseMutation,
  useSupabaseQuery,
  type Representative,
  type RepresentativeInput,
  type RepresentativesListFilters,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

function listKey(filters: RepresentativesListFilters) {
  return queryKeys.representatives.list({
    search: filters.search?.trim() || '',
    companyId: filters.companyId ?? 'all',
    active: filters.active ?? 'all',
    primary: filters.primary ?? 'all',
  })
}

const invalidateAll = [
  queryKeys.representatives.all,
  queryKeys.registrations.all,
  queryKeys.companies.all,
]

export function useRepresentatives(filters: RepresentativesListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => representativesService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useRepresentative(id: string | null) {
  return useSupabaseQuery(
    queryKeys.representatives.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return representativesService.getById(id)
    },
    { enabled: Boolean(id), ensureFreshSession: true },
  )
}

export function useRepresentativesByCompany(companyId: string | undefined) {
  return useSupabaseQuery(
    queryKeys.representatives.byCompany(companyId ?? 'none'),
    () => {
      if (!companyId) return Promise.resolve([] as Representative[])
      return representativesService.listByCompany(companyId)
    },
    { enabled: Boolean(companyId), ensureFreshSession: true },
  )
}

export function useCompanyOptionsForReps() {
  return useSupabaseQuery(
    [...queryKeys.companies.all, 'options'] as const,
    () => companiesService.listOptions(),
    { ensureFreshSession: true, staleTime: 60_000 },
  )
}

export function useUpsertRepresentativeMutation() {
  return useSupabaseMutation((input: RepresentativeInput) => representativesService.upsert(input), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: (_data, variables) => {
      notify.success(variables.id ? 'Представитель сохранён' : 'Представитель создан')
    },
    onError: (error) => notify.fromError(error, 'Не удалось сохранить представителя'),
  })
}

export function useSetPrimaryRepresentativeMutation() {
  return useSupabaseMutation((id: string) => representativesService.setPrimary(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Назначен основным представителем'),
    onError: (error) => notify.fromError(error, 'Не удалось назначить основным'),
  })
}

export function useToggleRepresentativeActiveMutation() {
  return useSupabaseMutation(
    (input: { id: string; isActive: boolean }) =>
      representativesService.setActive(input.id, input.isActive),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        notify.success(variables.isActive ? 'Представитель активирован' : 'Представитель деактивирован')
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}

export function useDeleteRepresentativeMutation() {
  return useSupabaseMutation((id: string) => representativesService.delete(id), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Представитель удалён'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить представителя'),
  })
}

export function toRepresentativeInput(
  values: {
    companyId: string
    fullName: string
    position?: string
    phone?: string
    email?: string
    isPrimary: boolean
    isActive: boolean
  },
  id?: string,
): RepresentativeInput {
  return {
    id,
    company_id: values.companyId,
    full_name: values.fullName,
    position: values.position || null,
    phone: values.phone || null,
    email: values.email || null,
    pd_consent: true,
    is_primary: values.isPrimary,
    is_active: values.isActive,
  }
}

export type { Representative }
