import { CanAccess } from '@features/auth/ui/can-access'
import { permissions } from '@features/auth/model/permissions'
import { InvoicesPanel } from '@features/invoices'
import { ErrorState } from '@shared/ui'

export function AdminInvoicesPage() {
  return (
    <CanAccess
      permission={permissions['admin.invoices']}
      fallback={
        <ErrorState title="Нет доступа" description="Недостаточно прав для управления счетами." />
      }
    >
      <InvoicesPanel />
    </CanAccess>
  )
}
