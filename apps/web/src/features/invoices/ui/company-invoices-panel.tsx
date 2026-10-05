import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'

import type { Invoice } from '@shared/api'
import { routes } from '@shared/config'
import { notify } from '@shared/lib/notify'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
} from '@shared/ui'

import { formatInvoiceAmount, formatInvoiceDate } from '../model/schemas'
import { openInvoiceFile, useInvoices } from '../model/use-invoices'
import { InvoiceFormDialog } from './invoice-form-dialog'

type CompanyInvoicesPanelProps = {
  companyId: string
  companyName: string
}

export function CompanyInvoicesPanel({ companyId, companyName }: CompanyInvoicesPanelProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const query = useInvoices({ companyId, status: 'all' })
  const invoices = query.data ?? []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Счета</CardTitle>
            <CardDescription>
              Счета компании «{companyName}»
              {query.isSuccess ? ` · ${invoices.length}` : null}
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Выставить счёт
          </Button>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Загрузка счетов">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-3/4" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : invoices.length === 0 ? (
            <EmptyState
              title="Счетов нет"
              description="Выставите счёт — он появится в кабинете участника."
              action={
                <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  Выставить счёт
                </Button>
              }
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {invoices.map((invoice) => (
                <InvoiceRow key={invoice.id} invoice={invoice} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <InvoiceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultCompanyId={companyId}
        lockCompany
        lockedCompanyName={companyName}
      />
    </>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <Link
        to={routes.admin.invoice(invoice.id)}
        className="min-w-0 flex-1 rounded-md outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums">{invoice.number}</span>
          <StatusBadge status={invoice.status} />
        </div>
        <p className="text-muted-foreground mt-0.5 truncate text-sm">{invoice.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {formatInvoiceDate(invoice.issued_at)}
          {invoice.due_date ? ` · до ${formatInvoiceDate(invoice.due_date)}` : null}
        </p>
      </Link>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
        <span className="text-sm font-medium tabular-nums">
          {formatInvoiceAmount(invoice.amount, invoice.currency)}
        </span>
        {invoice.file_url ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2"
            onClick={() => {
              void openInvoiceFile(invoice).catch((error) =>
                notify.fromError(error, 'Не удалось открыть файл'),
              )
            }}
          >
            <Download className="size-3.5" />
            <span className="max-w-[8rem] truncate">{invoice.file_name ?? 'Файл'}</span>
          </Button>
        ) : null}
      </div>
    </li>
  )
}
