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

import {
  accessStatusLabel,
  balanceFilterLabel,
  formatCompanyBalance,
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
        { value: 'active', label: accessStatusLabel('active') },
        { value: 'suspended', label: accessStatusLabel('suspended') },
        { value: 'archived', label: accessStatusLabel('archived') },
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
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">{row.original.auto_id}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Компания',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
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
          const tone =
            balance > 0
              ? 'text-emerald-700 dark:text-emerald-400'
              : balance < 0
                ? 'text-destructive'
                : 'text-muted-foreground'
          return <span className={`text-sm font-medium tabular-nums ${tone}`}>{formatCompanyBalance(balance)}</span>
        },
      },
      {
        id: 'level',
        header: 'Уровень',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
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
            label={
              row.original.access_status === 'archived'
                ? 'Вышедшая'
                : undefined
            }
          />
        ),
      },
      {
        accessorKey: 'email',
        header: 'Контакты',
        cell: ({ row }) => (
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="truncate">{row.original.email || '—'}</p>
            <p className="truncate">{row.original.phone || ''}</p>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
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
