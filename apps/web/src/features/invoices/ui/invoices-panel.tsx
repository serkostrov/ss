import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Download, Plus } from 'lucide-react'

import type { Invoice } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'
import { notify } from '@shared/lib/notify'

import {
  formatInvoiceAmount,
  formatInvoiceDate,
  invoiceStatusFilterLabel,
  type InvoiceStatusFilter,
} from '../model/schemas'
import { openInvoiceFile, useInvoices } from '../model/use-invoices'
import { InvoiceFormDialog } from './invoice-form-dialog'

export function InvoicesPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<InvoiceStatusFilter>('issued')
  const [createOpen, setCreateOpen] = useState(false)

  const query = useInvoices({
    search,
    status: status === 'all' ? 'all' : status,
  })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Номер, название…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as InvoiceStatusFilter),
      options: [
        { value: 'issued', label: invoiceStatusFilterLabel('issued') },
        { value: 'paid', label: invoiceStatusFilterLabel('paid') },
        { value: 'all', label: invoiceStatusFilterLabel('all') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: 'number',
        header: 'Номер',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium tabular-nums">{row.original.number}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'company',
        header: 'Компания',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.company?.name ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Сумма',
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatInvoiceAmount(row.original.amount, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: 'issued_at',
        header: 'Выставлен',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatInvoiceDate(row.original.issued_at)}
          </span>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Срок',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatInvoiceDate(row.original.due_date)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'file',
        header: 'Файл',
        cell: ({ row }) =>
          row.original.file_url ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2"
              onClick={(event) => {
                event.stopPropagation()
                void openInvoiceFile(row.original).catch((error) =>
                  notify.fromError(error, 'Не удалось открыть файл'),
                )
              }}
            >
              <Download className="size-3.5" />
              <span className="max-w-[7rem] truncate">{row.original.file_name ?? 'Скачать'}</span>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Счета"
        description="Выставление счетов компаниям. Статус меняется только в карточке счёта."
        actions={
          <PageHeaderAction type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Выставить счёт
          </PageHeaderAction>
        }
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setStatus('issued')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Счетов нет"
          emptyDescription="Создайте счёт для компании — он появится в кабинете участника."
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.invoice(row.id))}
        />
      )}

      <InvoiceFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
