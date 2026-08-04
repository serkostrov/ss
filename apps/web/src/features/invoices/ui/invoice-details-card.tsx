import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Download, RotateCcw, Trash2 } from 'lucide-react'

import { routes } from '@shared/config'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DeleteDialog,
  ErrorState,
  LoadingState,
  PageDetailHeader,
  StatusBadge,
} from '@shared/ui'
import { notify } from '@shared/lib/notify'

import { formatInvoiceAmount, formatInvoiceDate } from '../model/schemas'
import {
  openInvoiceFile,
  useDeleteInvoiceMutation,
  useInvoice,
  useSetInvoiceStatusMutation,
} from '../model/use-invoices'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}

export function InvoiceDetailsCard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const query = useInvoice(id)
  const statusMutation = useSetInvoiceStatusMutation()
  const deleteMutation = useDeleteInvoiceMutation()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [markUnpaidOpen, setMarkUnpaidOpen] = useState(false)

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
        description="Запись удалена или идентификатор неверен."
        action={
          <Button asChild variant="outline">
            <Link to={routes.admin.invoices}>К списку</Link>
          </Button>
        }
      />
    )
  }

  const isPaid = invoice.status === 'paid'

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.admin.invoices}
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
            Файл
          </Button>
        ) : null}
        {!isPaid ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={statusMutation.isPending}
            onClick={() => setMarkPaidOpen(true)}
          >
            <CheckCircle2 className="size-4" />
            Отметить оплаченным
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={statusMutation.isPending}
            onClick={() => setMarkUnpaidOpen(true)}
          >
            <RotateCcw className="size-4" />
            Вернуть к оплате
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Удалить
        </Button>
      </PageDetailHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Данные счёта</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Компания" value={invoice.company?.name ?? '—'} />
          <Field label="Название" value={invoice.title} />
          <Field label="Номер счёта" value={<span className="tabular-nums">{invoice.number}</span>} />
          <Field
            label="Сумма"
            value={
              <span className="font-medium tabular-nums">
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

      <ConfirmDialog
        open={markPaidOpen}
        onOpenChange={setMarkPaidOpen}
        title="Отметить счёт оплаченным?"
        description="Статус станет «Оплачен», дата оплаты проставится автоматически."
        confirmLabel="Оплачен"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          await statusMutation.mutateAsync({ id: invoice.id, status: 'paid' })
          setMarkPaidOpen(false)
        }}
      />

      <ConfirmDialog
        open={markUnpaidOpen}
        onOpenChange={setMarkUnpaidOpen}
        title="Вернуть счёт к оплате?"
        description="Статус станет «К оплате», дата оплаты будет очищена."
        confirmLabel="К оплате"
        loading={statusMutation.isPending}
        onConfirm={async () => {
          await statusMutation.mutateAsync({ id: invoice.id, status: 'issued' })
          setMarkUnpaidOpen(false)
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityName={invoice.number}
        title="Удалить счёт?"
        description="Счёт и прикреплённый файл будут удалены."
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          await deleteMutation.mutateAsync(invoice.id)
          navigate(routes.admin.invoices, { replace: true })
        }}
      />
    </div>
  )
}
