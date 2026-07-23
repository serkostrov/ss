import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'

import type { ParticipationLevel } from '@shared/api'
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

import { activeFilterLabel, type LevelActiveFilter } from '../model/schemas'
import {
  useDeleteLevelMutation,
  useMoveLevelMutation,
  useParticipationLevels,
  useParticipationLevelUsage,
  useToggleLevelActiveMutation,
} from '../model/use-levels'
import { LevelFormDialog } from './level-form-dialog'

type LevelsPanelProps = {
  embedded?: boolean
}

export type LevelsPanelHandle = {
  openCreate: () => void
}

export const LevelsPanel = forwardRef<LevelsPanelHandle, LevelsPanelProps>(
  function LevelsPanel({ embedded = false }, ref) {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<LevelActiveFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ParticipationLevel | null>(null)
  const [deleting, setDeleting] = useState<ParticipationLevel | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  useImperativeHandle(ref, () => ({ openCreate }), [])

  const query = useParticipationLevels({ search, active })
  const usageQuery = useParticipationLevelUsage(deleting?.id ?? null)
  const toggleMutation = useToggleLevelActiveMutation()
  const moveMutation = useMoveLevelMutation()
  const deleteMutation = useDeleteLevelMutation()

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
      id: 'active',
      label: 'Видимость',
      type: 'select',
      value: active,
      onChange: (value) => setActive(value as LevelActiveFilter),
      options: [
        { value: 'all', label: activeFilterLabel('all') },
        { value: 'active', label: activeFilterLabel('active') },
        { value: 'hidden', label: activeFilterLabel('hidden') },
      ],
    },
  ]

  const rows = query.data ?? []

  const columns = useMemo<ColumnDef<ParticipationLevel, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Уровень',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Статус',
        cell: ({ row }) =>
          row.original.is_active ? (
            <StatusBadge status="active" />
          ) : (
            <StatusBadge status="archived" label="Скрыт" tone="muted" />
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
          const level = row.original
          return (
            <div className="flex flex-nowrap items-center justify-end gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() =>
                  toggleMutation.mutate({ id: level.id, isActive: !level.is_active })
                }
                disabled={toggleMutation.isPending}
                aria-label={level.is_active ? 'Скрыть' : 'Показать'}
              >
                {level.is_active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  setEditing(level)
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
                onClick={() => setDeleting(level)}
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
  const usageDescription = usage
    ? [
        usage.companies ? `компаний: ${usage.companies}` : null,
        usage.material_sections ? `разделов материалов: ${usage.material_sections}` : null,
        usage.polls ? `голосований: ${usage.polls}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : null

  return (
    <div className="space-y-6">
      {embedded ? null : (
        <PageHeader
          title="Уровни участия"
          description="Редактор уровней, порядок отображения, скрытие и защита от удаления используемых."
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
          emptyTitle="Уровней пока нет"
          emptyDescription="Создайте первый уровень участия."
          getRowId={(row) => row.id}
        />
      )}

      <LevelFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        level={editing}
      />

      <DeleteDialog
        open={Boolean(deleting) && !usageQuery.isLoading && !inUse}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        entityName={deleting?.name}
        title="Удалить уровень?"
        description="Уровень не используется и будет удалён безвозвратно."
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
            ? 'Проверяем, не используется ли уровень компаниями, материалами или голосованиями…'
            : `Уровень «${deleting?.name ?? ''}» используется (${usageDescription || 'есть привязки'}). Сначала снимите привязки.`
        }
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        loading={usageQuery.isLoading}
        onConfirm={() => setDeleting(null)}
      />
    </div>
  )
})
