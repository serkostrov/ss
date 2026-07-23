import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'

import type { WorkGroupCategory } from '@shared/api'
import {
  Button,
  ConfirmDialog,
  DataTable,
  DeleteDialog,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import { activeFilterLabel, type DirectionActiveFilter } from '../model/schemas'
import {
  useDeleteDirectionMutation,
  useDirectionUsage,
  useDirections,
  useMoveDirectionMutation,
  useToggleDirectionActiveMutation,
} from '../model/use-directions'
import { DirectionFormDialog } from './direction-form-dialog'

type DirectionsPanelProps = {
  embedded?: boolean
}

export type DirectionsPanelHandle = {
  openCreate: () => void
}

export const DirectionsPanel = forwardRef<DirectionsPanelHandle, DirectionsPanelProps>(
  function DirectionsPanel({ embedded = false }, ref) {
    const [search, setSearch] = useState('')
    const [active, setActive] = useState<DirectionActiveFilter>('all')
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<WorkGroupCategory | null>(null)
    const [deleting, setDeleting] = useState<WorkGroupCategory | null>(null)

    const openCreate = () => {
      setEditing(null)
      setFormOpen(true)
    }

    useImperativeHandle(ref, () => ({ openCreate }), [])

    const query = useDirections({ search, active })
    const usageQuery = useDirectionUsage(deleting?.id ?? null)
    const toggleMutation = useToggleDirectionActiveMutation()
    const moveMutation = useMoveDirectionMutation()
    const deleteMutation = useDeleteDirectionMutation()

    const filterFields: FilterFieldConfig[] = [
      {
        id: 'search',
        label: 'Поиск',
        type: 'search',
        placeholder: 'Название…',
        value: search,
        onChange: setSearch,
      },
      {
        id: 'active',
        label: 'Видимость',
        type: 'select',
        value: active,
        onChange: (value) => setActive(value as DirectionActiveFilter),
        options: [
          { value: 'all', label: activeFilterLabel('all') },
          { value: 'active', label: activeFilterLabel('active') },
          { value: 'hidden', label: activeFilterLabel('hidden') },
        ],
      },
    ]

    const rows = query.data ?? []

    const columns = useMemo<ColumnDef<WorkGroupCategory, unknown>[]>(
      () => [
        {
          accessorKey: 'name',
          header: 'Направление',
          cell: ({ row }) => <p className="font-medium">{row.original.name}</p>,
        },
        {
          accessorKey: 'is_active',
          header: 'Статус',
          cell: ({ row }) =>
            row.original.is_active ? (
              <StatusBadge status="active" />
            ) : (
              <StatusBadge status="archived" label="Скрыто" tone="muted" />
            ),
        },
        {
          accessorKey: 'sort_order',
          header: 'Порядок',
          cell: ({ row, table }) => {
            const index = table.getRowModel().rows.findIndex((item) => item.id === row.id)
            const isFirst = index <= 0
            const isLast = index >= table.getRowModel().rows.length - 1
            return (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={isFirst || moveMutation.isPending}
                  aria-label="Выше"
                  onClick={() =>
                    moveMutation.mutate({ id: row.original.id, direction: 'up' })
                  }
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={isLast || moveMutation.isPending}
                  aria-label="Ниже"
                  onClick={() =>
                    moveMutation.mutate({ id: row.original.id, direction: 'down' })
                  }
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
            )
          },
          meta: { className: 'w-[5.5rem] max-w-[5.5rem]' },
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => {
            const direction = row.original
            return (
              <div className="flex flex-nowrap items-center justify-end gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() =>
                    toggleMutation.mutate({
                      id: direction.id,
                      isActive: !direction.is_active,
                    })
                  }
                  disabled={toggleMutation.isPending}
                  aria-label={direction.is_active ? 'Скрыть' : 'Показать'}
                >
                  {direction.is_active ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => {
                    setEditing(direction)
                    setFormOpen(true)
                  }}
                  aria-label="Редактировать"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  onClick={() => setDeleting(direction)}
                  aria-label="Удалить"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          },
          meta: { className: 'w-[6.5rem] max-w-[6.5rem]' },
        },
      ],
      [moveMutation, toggleMutation],
    )

    const usage = usageQuery.data
    const inUse = (usage?.total ?? 0) > 0

    return (
      <div className="space-y-6">
        {embedded ? null : (
          <PageHeader
            title="Направления"
            description="Справочник направлений для рабочих групп: порядок, скрытие и защита от удаления используемых."
            actions={
              <PageHeaderAction type="button" onClick={openCreate}>
                <Plus className="size-4" />
                Добавить
              </PageHeaderAction>
            }
          />
        )}

        <Filters
          fields={filterFields}
          onReset={() => {
            setSearch('')
            setActive('all')
          }}
        />

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            loading={query.isLoading}
            emptyTitle="Направлений пока нет"
            emptyDescription="Создайте первое направление."
            getRowId={(row) => row.id}
          />
        )}

        <DirectionFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
          direction={editing}
        />

        <DeleteDialog
          open={Boolean(deleting) && !usageQuery.isLoading && !inUse}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          entityName={deleting?.name}
          title="Удалить направление?"
          description="Направление не используется и будет удалено безвозвратно."
          loading={deleteMutation.isPending}
          onConfirm={async () => {
            if (!deleting) return
            await deleteMutation.mutateAsync(deleting.id)
            setDeleting(null)
          }}
        />

        <ConfirmDialog
          open={Boolean(deleting) && (usageQuery.isLoading || inUse)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title={inUse ? 'Удаление невозможно' : 'Проверка использования'}
          description={
            usageQuery.isLoading
              ? 'Проверяем, не используется ли направление в рабочих группах…'
              : `Направление «${deleting?.name ?? ''}» используется в группах: ${usage?.work_groups ?? 0}. Сначала смените направление у этих групп.`
          }
          confirmLabel="Понятно"
          cancelLabel="Закрыть"
          loading={usageQuery.isLoading}
          onConfirm={() => setDeleting(null)}
        />
      </div>
    )
  },
)
