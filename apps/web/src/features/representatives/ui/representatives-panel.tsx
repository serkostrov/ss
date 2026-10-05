import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Pencil, Plus, Star, Trash2 } from 'lucide-react'

import { useAuth } from '@app/providers'
import type { RegisteredUser, Representative } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'
import {
  formatRegisteredUserDate,
  RegisteredUserFormDialog,
  registeredUserCompanyLabel,
  registeredUserStatusFilterLabel,
  useDeleteRegisteredUserMutation,
  useRegisteredUsers,
  type RegisteredUserStatusFilter,
} from '@features/registered-users'

import {
  representativeActiveFilterLabel,
  representativePrimaryFilterLabel,
  type RepresentativeActiveFilter,
  type RepresentativePrimaryFilter,
} from '../model/schemas'
import { useCompanyOptionsForReps, useRepresentatives } from '../model/use-representatives'
import { RepresentativeFormDialog } from './representative-form-dialog'

const UNASSIGNED_COMPANY = 'none'
const BLOCKED_ACCOUNTS = 'blocked'

type AccountMode = 'unassigned' | 'blocked' | null

function resolveAccountMode(companyId: string): AccountMode {
  if (companyId === UNASSIGNED_COMPANY) return 'unassigned'
  if (companyId === BLOCKED_ACCOUNTS) return 'blocked'
  return null
}

export function RepresentativesPanel() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('all')
  const [accountStatus, setAccountStatus] = useState<RegisteredUserStatusFilter>('all')
  const [active, setActive] = useState<RepresentativeActiveFilter>('all')
  const [primary, setPrimary] = useState<RepresentativePrimaryFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RegisteredUser | null>(null)
  const [deleting, setDeleting] = useState<RegisteredUser | null>(null)

  const accountMode = resolveAccountMode(companyId)
  const showAccounts = accountMode != null

  const companies = useCompanyOptionsForReps()
  const repsQuery = useRepresentatives(
    {
      search,
      companyId: showAccounts ? 'all' : companyId,
      active,
      primary,
    },
    { enabled: !showAccounts },
  )
  const accountsQuery = useRegisteredUsers(
    {
      search,
      companyLink: accountMode === 'unassigned' ? 'without' : 'all',
      status: accountMode === 'blocked' ? 'blocked' : accountStatus,
    },
    { enabled: showAccounts },
  )
  const deleteMutation = useDeleteRegisteredUserMutation()

  const query = showAccounts ? accountsQuery : repsQuery

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: showAccounts
        ? 'ФИО, email, телефон…'
        : 'ФИО, email, телефон, username…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'company',
      label: 'Компания',
      type: 'select',
      value: companyId,
      onChange: (value) => {
        setCompanyId(value)
        if (value !== UNASSIGNED_COMPANY) setAccountStatus('all')
      },
      options: [
        { value: 'all', label: 'Все компании' },
        { value: UNASSIGNED_COMPANY, label: 'Без компании' },
        { value: BLOCKED_ACCOUNTS, label: 'Заблокированные' },
        ...(companies.data ?? []).map((company) => ({
          value: company.id,
          label: company.name,
        })),
      ],
    },
    ...(accountMode === 'unassigned'
      ? [
          {
            id: 'accountStatus',
            label: 'Статус',
            type: 'select' as const,
            value: accountStatus,
            onChange: (value: string) => setAccountStatus(value as RegisteredUserStatusFilter),
            options: [
              { value: 'all', label: registeredUserStatusFilterLabel('all') },
              { value: 'pending', label: registeredUserStatusFilterLabel('pending') },
              { value: 'confirmed', label: registeredUserStatusFilterLabel('confirmed') },
              { value: 'blocked', label: registeredUserStatusFilterLabel('blocked') },
            ],
          },
        ]
      : []),
    ...(!showAccounts
      ? [
          {
            id: 'active',
            label: 'Активность',
            type: 'select' as const,
            value: active,
            onChange: (value: string) => setActive(value as RepresentativeActiveFilter),
            options: [
              { value: 'all', label: representativeActiveFilterLabel('all') },
              { value: 'active', label: representativeActiveFilterLabel('active') },
              { value: 'inactive', label: representativeActiveFilterLabel('inactive') },
            ],
          },
          {
            id: 'primary',
            label: 'Роль',
            type: 'select' as const,
            value: primary,
            onChange: (value: string) => setPrimary(value as RepresentativePrimaryFilter),
            options: [
              { value: 'all', label: representativePrimaryFilterLabel('all') },
              { value: 'primary', label: representativePrimaryFilterLabel('primary') },
              { value: 'secondary', label: representativePrimaryFilterLabel('secondary') },
            ],
          },
        ]
      : []),
  ]

  const repColumns = useMemo<ColumnDef<Representative, unknown>[]>(
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
            <p className="text-muted-foreground truncate text-xs">
              {row.original.position || 'Должность не указана'}
            </p>
          </div>
        ),
      },
      {
        id: 'company',
        header: 'Компания',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{row.original.company?.name ?? '—'}</span>
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
          <div className="text-muted-foreground min-w-0 text-sm">
            <p className="truncate">{row.original.email || '—'}</p>
            <p className="truncate">{row.original.phone || ''}</p>
            {row.original.telegram_username ? (
              <p className="text-muted-foreground truncate">
                TG @{row.original.telegram_username}
              </p>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  )

  const accountColumns = useMemo<ColumnDef<RegisteredUser, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Участник',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.full_name || 'Без имени'}</p>
            <p className="text-muted-foreground truncate text-xs">{row.original.email}</p>
          </div>
        ),
      },
      {
        id: 'company',
        header: accountMode === 'blocked' ? 'Компания' : 'Указано при регистрации',
        cell: ({ row }) => {
          const label = registeredUserCompanyLabel(row.original)
          const text =
            accountMode === 'blocked'
              ? row.original.representative?.company?.name
                ? label
                : 'Без компании'
              : label === '—'
                ? 'Без компании'
                : label
          return <span className="text-muted-foreground line-clamp-2 text-sm">{text}</span>
        },
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'created_at',
        header: 'Регистрация',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatRegisteredUserDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const isSelf = profile?.id === row.original.id
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Редактировать"
                onClick={(event) => {
                  event.stopPropagation()
                  setEditing(row.original)
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                aria-label="Удалить аккаунт"
                disabled={isSelf}
                title={isSelf ? 'Нельзя удалить свою учётную запись' : 'Удалить аккаунт'}
                onClick={(event) => {
                  event.stopPropagation()
                  setDeleting(row.original)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        },
        meta: { className: 'w-[5.5rem] max-w-[5.5rem]' },
      },
    ],
    [accountMode, profile?.id],
  )

  const deleteLabel = deleting?.full_name || deleting?.email || 'участника'

  const pageDescription =
    accountMode === 'unassigned'
      ? 'Учётные записи без привязки к компании. Можно изменить статус или удалить.'
      : accountMode === 'blocked'
        ? 'Заблокированные учётные записи. Можно разблокировать, изменить данные или удалить.'
        : 'Контакты компаний: основной представитель и активность.'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Представители"
        description={pageDescription}
        actions={
          showAccounts ? undefined : (
            <PageHeaderAction type="button" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              Добавить
            </PageHeaderAction>
          )
        }
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setCompanyId('all')
          setAccountStatus('all')
          setActive('all')
          setPrimary('all')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : showAccounts ? (
        <DataTable
          columns={accountColumns}
          data={accountsQuery.data ?? []}
          loading={accountsQuery.isLoading}
          emptyTitle={
            accountMode === 'blocked'
              ? 'Заблокированных участников нет'
              : 'Участников без компании нет'
          }
          emptyDescription={
            accountMode === 'blocked'
              ? 'Нет учётных записей со статусом «Заблокирован».'
              : 'Все учётные записи привязаны к компаниям.'
          }
          getRowId={(row) => row.id}
          onRowClick={(row) => setEditing(row)}
        />
      ) : (
        <DataTable
          columns={repColumns}
          data={repsQuery.data ?? []}
          loading={repsQuery.isLoading}
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

      <RegisteredUserFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        user={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Удалить аккаунт?"
        description={`Учётная запись «${deleteLabel}» будет полностью удалена из системы. Это действие необратимо.`}
        confirmLabel="Удалить"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleting) return
          await deleteMutation.mutateAsync(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}
