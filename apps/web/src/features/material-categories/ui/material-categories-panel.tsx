import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'

import type { MaterialCategory } from '@shared/api'
import {
  Button,
  ConfirmDialog,
  DataTable,
  DeleteDialog,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  SettingsEmbeddedPanel,
  settingsEmbeddedFiltersClassName,
  settingsEmbeddedTableClassName,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import { activeFilterLabel, type MaterialCategoryActiveFilter } from '../model/schemas'
import {
  useDeleteMaterialCategoryMutation,
  useMaterialCategories,
  useMaterialCategoryUsage,
  useMoveMaterialCategoryMutation,
  useToggleMaterialCategoryActiveMutation,
} from '../model/use-material-categories'
import { MaterialCategoryFormDialog } from './material-category-form-dialog'

type MaterialCategoriesPanelProps = {
  embedded?: boolean
}

export type MaterialCategoriesPanelHandle = {
  openCreate: () => void
}

export const MaterialCategoriesPanel = forwardRef<
  MaterialCategoriesPanelHandle,
  MaterialCategoriesPanelProps
>(function MaterialCategoriesPanel({ embedded = false }, ref) {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<MaterialCategoryActiveFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialCategory | null>(null)
  const [deleting, setDeleting] = useState<MaterialCategory | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  useImperativeHandle(ref, () => ({ openCreate }), [])

  const query = useMaterialCategories({ search, active })
  const usageQuery = useMaterialCategoryUsage(deleting?.id ?? null)
  const toggleMutation = useToggleMaterialCategoryActiveMutation()
  const moveMutation = useMoveMaterialCategoryMutation()
  const deleteMutation = useDeleteMaterialCategoryMutation()

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
      onChange: (value) => setActive(value as MaterialCategoryActiveFilter),
      options: [
        { value: 'all', label: activeFilterLabel('all') },
        { value: 'active', label: activeFilterLabel('active') },
        { value: 'hidden', label: activeFilterLabel('hidden') },
      ],
    },
  ]

  const rows = query.data ?? []

  const columns = useMemo<ColumnDef<MaterialCategory, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Категория',
        cell: ({ row }) => <p className="font-medium">{row.original.name}</p>,
      },
      {
        accessorKey: 'is_active',
        header: 'Статус',
        cell: ({ row }) => {
          const category = row.original
          if (category.moderation_status === 'pending') {
            return <StatusBadge status="pending" />
          }
          if (category.moderation_status === 'rejected') {
            return <StatusBadge status="rejected" />
          }
          if (category.is_active) {
            return <StatusBadge status="active" />
          }
          return <StatusBadge status="archived" label="Скрыто" tone="muted" />
        },
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
                onClick={() => moveMutation.mutate({ id: row.original.id, direction: 'up' })}
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
                onClick={() => moveMutation.mutate({ id: row.original.id, direction: 'down' })}
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
          const category = row.original
          return (
            <div className="flex flex-nowrap items-center justify-end gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() =>
                  toggleMutation.mutate({
                    id: category.id,
                    isActive: !category.is_active,
                  })
                }
                disabled={
                  toggleMutation.isPending || category.moderation_status !== 'approved'
                }
                aria-label={category.is_active ? 'Скрыть' : 'Показать'}
              >
                {category.is_active ? (
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
                  setEditing(category)
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
                className="text-destructive size-7"
                onClick={() => setDeleting(category)}
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
    <div className={embedded ? 'space-y-4' : 'space-y-6'}>
      {embedded ? null : (
        <PageHeader
          title="Категории материалов"
          description="Новые категории проходят подтверждение во вкладке «Заявки», затем доступны в справочнике."
          actions={
            <PageHeaderAction type="button" onClick={openCreate}>
              <Plus className="size-4" />
              Добавить
            </PageHeaderAction>
          }
        />
      )}

      {embedded ? (
        <SettingsEmbeddedPanel
          filters={
            <Filters
              fields={filterFields}
              className={settingsEmbeddedFiltersClassName}
              onReset={() => {
                setSearch('')
                setActive('all')
              }}
            />
          }
        >
          {query.isError ? (
            <div className="p-4">
              <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              loading={query.isLoading}
              emptyTitle="Категорий пока нет"
              emptyDescription="Создайте первую категорию материалов."
              getRowId={(row) => row.id}
              compact
              className={settingsEmbeddedTableClassName}
            />
          )}
        </SettingsEmbeddedPanel>
      ) : (
        <>
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
              emptyTitle="Категорий пока нет"
              emptyDescription="Создайте первую категорию материалов."
              getRowId={(row) => row.id}
            />
          )}
        </>
      )}

      <MaterialCategoryFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditing(null)
        }}
        category={editing}
      />

      <DeleteDialog
        open={Boolean(deleting) && !usageQuery.isLoading && !inUse}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        entityName={deleting?.name}
        title="Удалить категорию?"
        description="Категория не используется и будет удалена безвозвратно."
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
            ? 'Проверяем, не используется ли категория в материалах…'
            : `Категория «${deleting?.name ?? ''}» используется в разделах: ${usage?.material_sections ?? 0}. Сначала смените категорию у этих разделов.`
        }
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        loading={usageQuery.isLoading}
        onConfirm={() => setDeleting(null)}
      />
    </div>
  )
})
