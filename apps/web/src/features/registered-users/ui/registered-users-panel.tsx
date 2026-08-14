import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'

import { useAuth } from '@app/providers'
import { routes } from '@shared/config'
import type { RegisteredUser } from '@shared/api'
import {
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Filters,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import {
  formatRegisteredUserDate,
  registeredUserCompanyLabel,
  registeredUserRoleFilterLabel,
  registeredUserRoleLabel,
  registeredUserStatusFilterLabel,
  type RegisteredUserRoleFilter,
  type RegisteredUserStatusFilter,
} from '../model/schemas'
import {
  useDeleteRegisteredUserMutation,
  useRegisteredUsers,
} from '../model/use-registered-users'
import { RegisteredUserFormDialog } from './registered-user-form-dialog'

export function RegisteredUsersPanel() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<RegisteredUserRoleFilter>('all')
  const [status, setStatus] = useState<RegisteredUserStatusFilter>('all')
  const [editing, setEditing] = useState<RegisteredUser | null>(null)
  const [deleting, setDeleting] = useState<RegisteredUser | null>(null)

  const query = useRegisteredUsers({ search, role, status })
  const deleteMutation = useDeleteRegisteredUserMutation()

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
      id: 'role',
      label: 'Роль',
      type: 'select',
      value: role,
      onChange: (value) => setRole(value as RegisteredUserRoleFilter),
      options: [
        { value: 'all', label: registeredUserRoleFilterLabel('all') },
        { value: 'admin', label: registeredUserRoleFilterLabel('admin') },
        { value: 'member', label: registeredUserRoleFilterLabel('member') },
      ],
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as RegisteredUserStatusFilter),
      options: [
        { value: 'all', label: registeredUserStatusFilterLabel('all') },
        { value: 'pending', label: registeredUserStatusFilterLabel('pending') },
        { value: 'confirmed', label: registeredUserStatusFilterLabel('confirmed') },
        { value: 'blocked', label: registeredUserStatusFilterLabel('blocked') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<RegisteredUser, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Пользователь',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.full_name || 'Без имени'}</p>
            <p className="text-muted-foreground truncate text-xs">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Роль',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.role}
            label={registeredUserRoleLabel(row.original.role)}
          />
        ),
        meta: { className: 'w-[9rem] max-w-[9rem]' },
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        meta: { className: 'w-[9rem] max-w-[9rem]' },
      },
      {
        id: 'company',
        header: 'Компания',
        cell: ({ row }) => {
          const companyId = row.original.representative?.company?.id
          const label = registeredUserCompanyLabel(row.original)
          if (companyId && label !== '—') {
            return (
              <Link
                to={routes.admin.company(companyId)}
                className="text-primary line-clamp-2 text-sm underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {label}
              </Link>
            )
          }
          return <span className="text-muted-foreground line-clamp-2 text-sm">{label}</span>
        },
      },
      {
        accessorKey: 'phone',
        header: 'Телефон',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">{row.original.phone || '—'}</span>
        ),
        meta: { className: 'hidden md:table-cell' },
      },
      {
        accessorKey: 'created_at',
        header: 'Регистрация',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatRegisteredUserDate(row.original.created_at)}
          </span>
        ),
        meta: { className: 'hidden lg:table-cell w-[10rem] max-w-[10rem]' },
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
                aria-label="Удалить"
                disabled={isSelf}
                title={isSelf ? 'Нельзя удалить свою учётную запись' : undefined}
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
    [profile?.id],
  )

  const deleteLabel = deleting?.full_name || deleting?.email || 'пользователя'

  return (
    <div className="space-y-4">
      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setRole('all')
          setStatus('all')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Пользователей пока нет"
          emptyDescription="Здесь появятся все зарегистрированные учётные записи."
          getRowId={(row) => row.id}
          onRowClick={(row) => setEditing(row)}
        />
      )}

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
        title="Удалить пользователя?"
        description={`Учётная запись «${deleteLabel}» будет полностью удалена из системы вместе с данными входа. Это действие необратимо.`}
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
