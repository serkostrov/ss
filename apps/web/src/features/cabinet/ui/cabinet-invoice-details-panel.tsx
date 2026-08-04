import { type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download } from 'lucide-react'

import {
  formatInvoiceAmount,
  formatInvoiceDate,
  openInvoiceFile,
  useInvoice,
} from '@features/invoices'
import { routes } from '@shared/config'
import { notify } from '@shared/lib/notify'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  PageDetailHeader,
  StatusBadge,
} from '@shared/ui'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}

export function CabinetInvoiceDetailsPanel() {
  const { id } = useParams<{ id: string }>()
  const query = useInvoice(id)

  if (query.isLoading) {
    return <LoadingState label="Загрузка счёта…" />
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const invoice = query.data
  if (!invoice) {
    return (
      <ErrorState
        title="Счёт не найден"
        description="Счёт удалён или недоступен для вашей компании."
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.invoices}>К списку</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.cabinet.invoices}
        title={invoice.number}
        description={invoice.title}
        status={<StatusBadge status={invoice.status} />}
      >
        {invoice.file_url ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              void openInvoiceFile(invoice).catch((error) =>
                notify.fromError(error, 'Не удалось открыть файл'),
              )
            }}
          >
            <Download className="size-4" />
            Скачать файл
          </Button>
        ) : (
          <span />
        )}
      </PageDetailHeader>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Данные счёта</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Название" value={invoice.title} />
          <Field label="Номер счёта" value={<span className="tabular-nums">{invoice.number}</span>} />
          <Field
            label="Сумма"
            value={
              <span className="text-base font-semibold tabular-nums">
                {formatInvoiceAmount(invoice.amount, invoice.currency)}
              </span>
            }
          />
          <Field label="Статус" value={<StatusBadge status={invoice.status} />} />
          <Field label="Дата выставления" value={formatInvoiceDate(invoice.issued_at)} />
          <Field label="Срок оплаты" value={formatInvoiceDate(invoice.due_date)} />
          <Field label="Дата оплаты" value={formatInvoiceDate(invoice.paid_at)} />
          <Field
            label="Файл"
            value={
              invoice.file_url ? (
                <button
                  type="button"
                  className="text-left text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    void openInvoiceFile(invoice).catch((error) =>
                      notify.fromError(error, 'Не удалось открыть файл'),
                    )
                  }}
                >
                  {invoice.file_name ?? 'Открыть файл'}
                </button>
              ) : (
                'Не прикреплён'
              )
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
