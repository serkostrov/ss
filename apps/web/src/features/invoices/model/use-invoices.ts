import {
  authService,
  invoicesService,
  queryKeys,
  useSupabaseMutation,
  useSupabaseQuery,
  type Invoice,
  type InvoiceInput,
  type InvoiceStatus,
  type InvoicesListFilters,
} from '@shared/api'
import { toApiError } from '@shared/lib/errors'
import { notify } from '@shared/lib/notify'

function listKey(filters: InvoicesListFilters) {
  return queryKeys.invoices.list({
    search: filters.search?.trim() || '',
    status: filters.status ?? 'all',
    companyId: filters.companyId ?? '',
  })
}

const invalidateAll = [queryKeys.invoices.all]

async function withSession<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await authService.ensureFreshSession()
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}

export function useInvoices(filters: InvoicesListFilters = {}) {
  return useSupabaseQuery(listKey(filters), () => invoicesService.list(filters), {
    ensureFreshSession: true,
  })
}

export function useInvoice(id: string | undefined) {
  return useSupabaseQuery(
    queryKeys.invoices.detail(id ?? 'none'),
    () => {
      if (!id) return Promise.resolve(null)
      return invoicesService.getById(id)
    },
    { enabled: Boolean(id), ensureFreshSession: true },
  )
}

export function useCabinetInvoices(companyId: string | undefined) {
  return useSupabaseQuery(
    queryKeys.invoices.cabinet(companyId ?? 'none'),
    () => {
      if (!companyId) return Promise.resolve([])
      return invoicesService.listForCabinet(companyId)
    },
    { enabled: Boolean(companyId), ensureFreshSession: true },
  )
}

export function useCreateInvoiceMutation() {
  return useSupabaseMutation(
    (input: InvoiceInput) => withSession(() => invoicesService.create(input)),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: () => notify.success('Счёт выставлен компании'),
      onError: (error) => notify.fromError(error, 'Не удалось создать счёт'),
    },
  )
}

export function useSetInvoiceStatusMutation() {
  return useSupabaseMutation(
    (input: { id: string; status: InvoiceStatus }) =>
      withSession(() => invoicesService.setStatus(input.id, input.status)),
    {
      ensureFreshSession: true,
      invalidateKeys: invalidateAll,
      onSuccess: (_data, variables) => {
        notify.success(
          variables.status === 'paid' ? 'Счёт отмечен оплаченным' : 'Статус: к оплате',
        )
      },
      onError: (error) => notify.fromError(error, 'Не удалось изменить статус счёта'),
    },
  )
}

export function useDeleteInvoiceMutation() {
  return useSupabaseMutation((id: string) => withSession(() => invoicesService.delete(id)), {
    ensureFreshSession: true,
    invalidateKeys: invalidateAll,
    onSuccess: () => notify.success('Счёт удалён'),
    onError: (error) => notify.fromError(error, 'Не удалось удалить счёт'),
  })
}

export async function openInvoiceFile(invoice: Invoice): Promise<void> {
  const url = await withSession(() => invoicesService.getDownloadUrl(invoice))
  window.open(url, '_blank', 'noopener,noreferrer')
}
