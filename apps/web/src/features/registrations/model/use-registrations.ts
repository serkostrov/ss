import {
  queryKeys,
  registrationsService,
  rpcService,
  useSupabaseMutation,
  useSupabaseQuery,
  type CreateRepresentativePayload,
  type RegistrationApplication,
  type RegistrationListFilters,
  type DbUserStatus,
} from '@shared/api'
import { notify } from '@shared/lib/notify'

import type { ConfirmRegistrationFormValues } from './schemas'

export function useRegistrationApplications(filters: RegistrationListFilters) {
  return useSupabaseQuery(
    queryKeys.registrations.list({
      status: filters.status ?? 'all',
      search: filters.search?.trim() || '',
    }),
    () => registrationsService.list(filters),
    { ensureFreshSession: true },
  )
}

export function useRegistrationApplication(userId: string | null) {
  return useSupabaseQuery(
    queryKeys.registrations.detail(userId ?? 'none'),
    () => {
      if (!userId) return Promise.resolve(null)
      return registrationsService.getById(userId)
    },
    {
      enabled: Boolean(userId),
      ensureFreshSession: true,
    },
  )
}

export function useRepresentativeOptions(search = '') {
  return useSupabaseQuery(
    queryKeys.registrations.representatives(search),
    () => registrationsService.listRepresentatives(search),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

export function useCompanyOptions(search = '') {
  return useSupabaseQuery(
    queryKeys.registrations.companies(search),
    () => registrationsService.listCompanies(search),
    { ensureFreshSession: true, staleTime: 30_000 },
  )
}

const invalidateAll = [queryKeys.registrations.all]

function buildCreatePayload(
  values: ConfirmRegistrationFormValues,
  application: RegistrationApplication,
): CreateRepresentativePayload {
  return {
    company_id: values.companyMode === 'existing' ? values.companyId || null : null,
    company_name: values.companyMode === 'new' ? values.companyName || null : null,
    company_inn:
      values.companyMode === 'new'
        ? values.companyInn || application.company_inn_hint || null
        : null,
    full_name: values.fullName || application.full_name || application.email,
    position: values.position || null,
    phone: values.phone || application.phone || null,
    email: values.email || application.email || null,
    pd_consent: true,
    is_primary: values.isPrimary,
  }
}

export function useConfirmRegistrationMutation() {
  return useSupabaseMutation(
    async (input: {
      application: RegistrationApplication
      values: ConfirmRegistrationFormValues
    }) => {
      if (input.values.mode === 'link') {
        return rpcService.confirmRegistration({
          userId: input.application.id,
          representativeId: input.values.representativeId,
        })
      }

      return rpcService.confirmRegistration({
        userId: input.application.id,
        createRepresentative: buildCreatePayload(input.values, input.application),
      })
    },
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Заявка подтверждена'),
      onError: (error) => notify.fromError(error, 'Не удалось подтвердить заявку'),
    },
  )
}

export function useRejectRegistrationMutation() {
  return useSupabaseMutation((userId: string) => rpcService.rejectRegistration(userId), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Заявка отклонена'),
    onError: (error) => notify.fromError(error, 'Не удалось отклонить заявку'),
  })
}

export function useSetUserStatusMutation() {
  return useSupabaseMutation(
    (input: { userId: string; status: Extract<DbUserStatus, 'confirmed' | 'blocked'> }) =>
      rpcService.setUserStatus(input.userId, input.status),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        notify.success(
          variables.status === 'blocked' ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус'),
    },
  )
}
