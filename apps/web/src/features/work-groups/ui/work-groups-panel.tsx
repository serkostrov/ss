import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'

import type { WorkGroup } from '@shared/api'
import { routes } from '@shared/config'
import {
  Badge,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import { messengerPlatformLabel } from '@features/messengers'

import {
  workGroupStatusLabel,
  type WorkGroupStatusFilter,
} from '../model/schemas'
import { useWorkGroupCategories, useWorkGroups } from '../model/use-work-groups'
import { WorkGroupFormDialog } from './work-group-form-dialog'

export function WorkGroupsPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WorkGroupStatusFilter>('all')
  const [categoryId, setCategoryId] = useState('all')
  const [formOpen, setFormOpen] = useState(false)

  const categories = useWorkGroupCategories()
  const query = useWorkGroups({ search, status, categoryId })

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Название или описание…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'category',
      label: 'Направление',
      type: 'select',
      value: categoryId,
      onChange: setCategoryId,
      options: [
        { value: 'all', label: 'Все направления' },
        ...(categories.data ?? []).map((category) => ({
          value: category.id,
          label: category.name,
        })),
      ],
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as WorkGroupStatusFilter),
      options: [
        { value: 'all', label: workGroupStatusLabel('all') },
        { value: 'active', label: workGroupStatusLabel('active') },
        { value: 'paused', label: workGroupStatusLabel('paused') },
        { value: 'archived', label: workGroupStatusLabel('archived') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<WorkGroup, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Группа',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description || 'Без описания'}
            </p>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Направление',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.category?.name ?? '—'}
          </span>
        ),
      },
      {
        id: 'responsible',
        header: 'Ответственный',
        cell: ({ row }) => {
          const rep = row.original.responsible
          if (!rep) return <span className="text-sm text-muted-foreground">Не назначен</span>
          return (
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{rep.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {rep.company?.name ?? '—'}
              </p>
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            label={
              row.original.status === 'archived'
                ? 'Завершена'
                : row.original.status === 'paused'
                  ? 'Пауза'
                  : undefined
            }
          />
        ),
      },
      {
        id: 'members',
        header: 'Участники',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.members_count}</span>
        ),
      },
      {
        id: 'messengers',
        header: 'Каналы',
        cell: ({ row }) => {
          const connections = row.original.messenger_connections
          if (!connections.length) {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {connections.map((item) => (
                <Badge
                  key={item.id}
                  variant={item.bot_status === 'connected' ? 'secondary' : 'outline'}
                  className="font-normal"
                >
                  {messengerPlatformLabel(item.platform)}
                </Badge>
              ))}
            </div>
          )
        },
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Рабочие группы"
        description="Группы по направлениям (технические, мероприятия, правление и др.) со статусом и каналами."
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
          setStatus('all')
          setCategoryId('all')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Групп пока нет"
          emptyDescription="Создайте первую рабочую группу."
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.workGroup(row.id))}
        />
      )}

      <WorkGroupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(group) => navigate(routes.admin.workGroup(group.id))}
      />
    </div>
  )
}
