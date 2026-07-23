import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { FileSpreadsheet, Plus } from 'lucide-react'

import type { Company } from '@shared/api'
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

import { accessStatusLabel, type CompanyAccessFilter } from '../model/schemas'
import { useActiveLevelsForSelect, useCompanies } from '../model/use-companies'
import { CompanyFormDialog } from './company-form-dialog'
import { CompanyImportDialog } from './company-import-dialog'

export function CompaniesPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [accessStatus, setAccessStatus] = useState<CompanyAccessFilter>('all')
  const [levelId, setLevelId] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const levels = useActiveLevelsForSelect()
  const query = useCompanies({
    search,
    accessStatus,
    levelId,
  })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Название, ИНН, email, телефон…',
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
  ]

  const columns = useMemo<ColumnDef<Company, unknown>[]>(
    () => [
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
