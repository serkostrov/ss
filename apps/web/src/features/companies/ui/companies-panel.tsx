import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { FileSpreadsheet, Plus } from 'lucide-react'

import type { Company, CompanyBalanceFilter, CompanySortBy } from '@shared/api'
import { routes } from '@shared/config'
import {
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'
import { companyAccessStatusLabel, useCompanyAccessStatuses } from '@features/access-statuses'

import {
  accessStatusLabel,
  balanceFilterLabel,
  formatCompanyAutoId,
  formatCompanyBalance,
  companyBalanceClassName,
  sortByLabel,
  type CompanyAccessFilter,
  type CompanyBalanceFilterValue,
  type CompanySortByValue,
} from '../model/schemas'
import { useActiveLevelsForSelect, useCompanies } from '../model/use-companies'
import { CompanyFormDialog } from './company-form-dialog'
import { CompanyImportDialog } from './company-import-dialog'

export function CompaniesPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [accessStatus, setAccessStatus] = useState<CompanyAccessFilter>('all')
  const [levelId, setLevelId] = useState('all')
  const [balanceFilter, setBalanceFilter] = useState<CompanyBalanceFilterValue>('all')
  const [sortBy, setSortBy] = useState<CompanySortByValue>('name')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const levels = useActiveLevelsForSelect()
  const statusesQuery = useCompanyAccessStatuses(false)
  const statusOptions = statusesQuery.data ?? []
  const query = useCompanies({
    search,
    accessStatus,
    levelId,
    balanceFilter: balanceFilter as CompanyBalanceFilter,
    sortBy: sortBy as CompanySortBy,
  })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'ID, название, ИНН, email…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: accessStatus,
      onChange: (value) => setAccessStatus(value as CompanyAccessFilter),
      options: [
        { value: 'all', label: accessStatusLabel('all') },
        ...statusOptions.map((status) => ({
          value: status.slug,
          label: accessStatusLabel(status.slug, statusOptions),
        })),
      ],
    },
    {
      id: 'level',
      label: 'Уровень',
      type: 'select',
      value: levelId,
      onChange: setLevelId,
      options: [
        { value: 'all', label: 'Все уровни' },
        ...(levels.data ?? []).map((level) => ({
          value: level.id,
          label: level.name,
        })),
      ],
    },
    {
      id: 'balance',
      label: 'Баланс',
      type: 'select',
      value: balanceFilter,
      onChange: (value) => setBalanceFilter(value as CompanyBalanceFilterValue),
      options: [
        { value: 'all', label: balanceFilterLabel('all') },
        { value: 'positive', label: balanceFilterLabel('positive') },
        { value: 'zero', label: balanceFilterLabel('zero') },
        { value: 'negative', label: balanceFilterLabel('negative') },
      ],
    },
    {
      id: 'sort',
      label: 'Сортировка',
      type: 'select',
      value: sortBy,
      onChange: (value) => setSortBy(value as CompanySortByValue),
      options: [
        { value: 'name', label: sortByLabel('name') },
        { value: 'auto_id', label: sortByLabel('auto_id') },
        { value: 'balance_desc', label: sortByLabel('balance_desc') },
        { value: 'balance_asc', label: sortByLabel('balance_asc') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<Company, unknown>[]>(
    () => [
      {
        accessorKey: 'auto_id',
        header: 'ID',
        meta: { className: 'w-[4.75rem] max-w-[4.75rem] pr-3' },
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-sm tabular-nums">
            {formatCompanyAutoId(row.original.auto_id)}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Компания',
        meta: { className: 'pl-2' },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate leading-tight font-medium">{row.original.name}</p>
            <p className="text-muted-foreground truncate text-xs leading-tight">
              {row.original.inn ? `ИНН ${row.original.inn}` : 'ИНН не указан'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'balance',
        header: 'Баланс',
        cell: ({ row }) => {
          const balance = row.original.balance ?? 0
          return (
            <span className={`text-sm font-medium tabular-nums ${companyBalanceClassName(balance)}`}>
              {formatCompanyBalance(balance)}
            </span>
          )
        },
      },
      {
        id: 'level',
        header: 'Уровень',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.participation_level?.name ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'access_status',
        header: 'Статус',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.access_status}
            label={companyAccessStatusLabel(row.original.access_status, statusOptions)}
          />
        ),
      },
      {
        accessorKey: 'email',
        header: 'Контакты',
        cell: ({ row }) => (
          <div className="text-muted-foreground flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="truncate leading-tight">{row.original.email || '—'}</p>
            {row.original.phone ? (
              <p className="truncate leading-tight">{row.original.phone}</p>
            ) : null}
          </div>
        ),
      },
    ],
    [statusOptions],
  )

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Компании"
        description="Организации ассоциации: активные, приостановленные и вышедшие. Можно импортировать из Excel бухгалтерии."
        actions={
          <>
            <PageHeaderAction type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="size-4" />
              Импорт Excel
            </PageHeaderAction>
            <PageHeaderAction type="button" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              Добавить
            </PageHeaderAction>
          </>
        }
      />

      <Filters
        className="gap-2"
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setAccessStatus('all')
          setLevelId('all')
          setBalanceFilter('all')
          setSortBy('name')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          compact
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Компаний нет"
          emptyDescription="Импортируйте Excel или создайте первую компанию."
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.company(row.id))}
        />
      )}

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(created) => navigate(routes.admin.company(created.id))}
      />
      <CompanyImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
