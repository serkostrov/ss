import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Star } from 'lucide-react'

import type { Representative } from '@shared/api'
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
  representativeActiveFilterLabel,
  representativePrimaryFilterLabel,
  type RepresentativeActiveFilter,
  type RepresentativePrimaryFilter,
} from '../model/schemas'
import {
  useCompanyOptionsForReps,
  useRepresentatives,
} from '../model/use-representatives'
import { RepresentativeFormDialog } from './representative-form-dialog'

export function RepresentativesPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('all')
  const [active, setActive] = useState<RepresentativeActiveFilter>('all')
  const [primary, setPrimary] = useState<RepresentativePrimaryFilter>('all')
  const [formOpen, setFormOpen] = useState(false)

  const companies = useCompanyOptionsForReps()
  const query = useRepresentatives({
    search,
    companyId,
    active,
    primary,
  })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'ФИО, email, телефон…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'company',
      label: 'Компания',
      type: 'select',
      value: companyId,
      onChange: setCompanyId,
      options: [
        { value: 'all', label: 'Все компании' },
        ...(companies.data ?? []).map((company) => ({
          value: company.id,
          label: company.name,
        })),
      ],
    },
    {
      id: 'active',
      label: 'Активность',
      type: 'select',
      value: active,
      onChange: (value) => setActive(value as RepresentativeActiveFilter),
      options: [
        { value: 'all', label: representativeActiveFilterLabel('all') },
        { value: 'active', label: representativeActiveFilterLabel('active') },
        { value: 'inactive', label: representativeActiveFilterLabel('inactive') },
      ],
    },
    {
      id: 'primary',
      label: 'Роль',
      type: 'select',
      value: primary,
      onChange: (value) => setPrimary(value as RepresentativePrimaryFilter),
      options: [
        { value: 'all', label: representativePrimaryFilterLabel('all') },
        { value: 'primary', label: representativePrimaryFilterLabel('primary') },
        { value: 'secondary', label: representativePrimaryFilterLabel('secondary') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<Representative, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Представитель',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium">
              {row.original.is_primary ? (
                <Star className="size-3.5 shrink-0 text-amber-500" aria-label="Основной" />
              ) : null}
              {row.original.full_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.position || 'Должность не указана'}
            </p>
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
        accessorKey: 'is_active',
        header: 'Статус',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.is_active ? 'active' : 'archived'}
            label={row.original.is_active ? 'Активен' : 'Неактивен'}
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
        title="Представители"
        description="Контакты компаний: основной представитель и активность."
        actions={
          <PageHeaderAction type="button" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            Добавить
          </PageHeaderAction>
        }
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setCompanyId('all')
          setActive('all')
          setPrimary('all')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Представителей нет"
          emptyDescription="Создайте контакт или измените фильтры."
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.representative(row.id))}
        />
      )}

      <RepresentativeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(created) => navigate(routes.admin.representative(created.id))}
      />
    </div>
  )
}
