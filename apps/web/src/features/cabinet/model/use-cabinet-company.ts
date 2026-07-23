import {
  companiesService,
  directoryService,
  cabinetPollsMetaService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type Company,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

import type { MemberCompanyFormValues } from './member-company-schema'

export function useOwnCompany(companyId: string | undefined) {
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

export function useUpdateOwnCompanyMutation(companyId: string) {
  return useSupabaseMutation(
    (values: MemberCompanyFormValues) =>
      companiesService.updateOwnProfile(companyId, {
        name: values.name,
        inn: values.inn || null,
        description: values.description || null,
        phone: values.phone || null,
        email: values.email || null,
        website: values.website || null,
        address: values.address || null,
      }),
    {
      ensureFreshSession: true,
      invalidateKeys: [queryKeys.companies.all, queryKeys.auth.all, queryKeys.directory.all],
      onSuccess: () => notify.success('Данные компании сохранены'),
      onError: (error) => notify.fromError(error, 'Не удалось сохранить компанию'),
    },
  )
}

export function useAssociationDirectory(search = '') {
  const query = useSupabaseQuery(
    queryKeys.directory.list,
    () => directoryService.list(),
    { ensureFreshSession: true, staleTime: 30_000 },
  )

  const term = search.trim().toLowerCase()
  const items = (query.data ?? []).filter((company) => {
    if (!term) return true
    const haystack = [
      company.name,
      company.inn,
      company.description,
      company.address,
      ...company.representatives.map((rep) => `${rep.full_name} ${rep.position ?? ''}`),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })

  return { ...query, items, totalCount: query.data?.length ?? 0 }
}

export function useCabinetPollAccessHint(enabled: boolean) {
  return useSupabaseQuery(
    queryKeys.cabinetMeta.pollAccessHint,
    () => cabinetPollsMetaService.getAccessHint(),
    {
      enabled,
      ensureFreshSession: true,
      staleTime: 30_000,
    },
  )
}

export function toMemberCompanyFormValues(company: Company | null | undefined): MemberCompanyFormValues {
  return {
    name: company?.name ?? '',
    inn: company?.inn ?? '',
    description: company?.description ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    website: company?.website ?? '',
    address: company?.address ?? '',
  }
}
