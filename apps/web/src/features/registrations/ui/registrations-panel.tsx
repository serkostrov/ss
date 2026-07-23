import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'

import type { RegistrationApplication } from '@shared/api'
import {
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import {
  formatRegistrationDate,
  statusFilterLabel,
  type RegistrationStatusFilter,
} from '../model/schemas'
import { useRegistrationApplications } from '../model/use-registrations'
import { RegistrationDetailSheet } from './registration-detail-sheet'

export function RegistrationsPanel() {
  const [status, setStatus] = useState<RegistrationStatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const query = useRegistrationApplications({
    status: status === 'all' ? 'all' : status,
    search,
  })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'ФИО, email, телефон, компания…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as RegistrationStatusFilter),
      options: [
        { value: 'pending', label: statusFilterLabel('pending') },
        { value: 'confirmed', label: statusFilterLabel('confirmed') },
        { value: 'blocked', label: statusFilterLabel('blocked') },
        { value: 'all', label: statusFilterLabel('all') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<RegistrationApplication, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Заявитель',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.full_name || 'Без имени'}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: 'company_name_hint',
        header: 'Компания (заявка)',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.company_name_hint ||
              row.original.representative?.company?.name ||
              '—'}
            {row.original.company_inn_hint ? (
              <span className="mt-0.5 block text-xs">ИНН {row.original.company_inn_hint}</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Телефон',
        cell: ({ row }) => row.original.phone || '—',
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'created_at',
        header: 'Создана',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatRegistrationDate(row.original.created_at)}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Заявки на регистрацию"
        description="Очередь участников: подтверждение, отклонение и управление статусами."
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setStatus('pending')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle={status === 'pending' ? 'Нет заявок на рассмотрении' : 'Ничего не найдено'}
          emptyDescription="Измените фильтры или дождитесь новых регистраций."
          getRowId={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
        />
      )}

      <RegistrationDetailSheet
        userId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </div>
  )
}
