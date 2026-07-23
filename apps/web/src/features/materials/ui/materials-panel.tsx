import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Plus, Shield } from 'lucide-react'

import type { MaterialSection } from '@shared/api'
import { routes } from '@shared/config'
import {
  Button,
  Checkbox,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  PageHeaderAction,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'
import {
  BulkMaterialAccessDialog,
  MaterialAccessBadges,
} from '@features/material-access'

import {
  materialStatusFilterLabel,
  type MaterialStatusFilter,
} from '../model/schemas'
import {
  useLevelsForMaterialAcl,
  useMaterialSections,
  useMoveMaterialSectionMutation,
  usePublishMaterialSectionMutation,
} from '../model/use-materials'
import { MaterialSectionCreateDialog } from './material-section-create-dialog'

export function MaterialsPanel() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MaterialStatusFilter>('all')
  const [levelId, setLevelId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const navigate = useNavigate()

  const levels = useLevelsForMaterialAcl()
  const query = useMaterialSections({
    search,
    status,
    levelId: levelId || undefined,
  })
  const moveMutation = useMoveMaterialSectionMutation()
  const publishMutation = usePublishMaterialSectionMutation()

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  )

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Название, slug, описание…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as MaterialStatusFilter),
      options: [
        { value: 'all', label: materialStatusFilterLabel('all') },
        { value: 'draft', label: materialStatusFilterLabel('draft') },
        { value: 'published', label: materialStatusFilterLabel('published') },
      ],
    },
    {
      id: 'levelId',
      label: 'Уровень доступа',
      type: 'select',
      value: levelId,
      onChange: setLevelId,
      options: [
        { value: '', label: 'Все уровни' },
        ...(levels.data ?? []).map((level) => ({
          value: level.id,
          label: level.is_active ? level.name : `${level.name} (скрыт)`,
        })),
      ],
    },
  ]

  const columns = useMemo<ColumnDef<MaterialSection, unknown>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
            aria-label="Выбрать все"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
            aria-label="Выбрать раздел"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'title',
        header: 'Раздел',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.slug || 'без slug'}
            </p>
          </div>
        ),
      },
      {
        id: 'levels',
        header: 'Доступ',
        cell: ({ row }) => <MaterialAccessBadges levels={row.original.levels} />,
      },
      {
        accessorKey: 'is_published',
        header: 'Статус',
        cell: ({ row }) =>
          row.original.is_published ? (
            <StatusBadge status="active" label="Опубликован" />
          ) : (
            <StatusBadge status="draft" />
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
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={publishMutation.isPending}
            onClick={() =>
              publishMutation.mutate({
                id: row.original.id,
                isPublished: !row.original.is_published,
              })
            }
          >
            {row.original.is_published ? 'В черновик' : 'Опубликовать'}
          </Button>
        ),
        meta: { className: 'w-[8.5rem] max-w-[8.5rem]' },
      },
    ],
    [moveMutation, publishMutation],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Материалы"
        description="Разделы для кабинета: Markdown, черновики, публикация и доступ по уровням."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={selectedIds.length === 0}
              onClick={() => setBulkOpen(true)}
            >
              <Shield className="size-4" />
              Доступ ({selectedIds.length})
            </Button>
            <PageHeaderAction type="button" onClick={() => setCreateOpen(true)}>
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
          setStatus('all')
          setLevelId('')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Разделов нет"
          emptyDescription="Создайте первый раздел материалов."
          getRowId={(row) => row.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={(row) => navigate(routes.admin.material(row.id))}
        />
      )}

      <MaterialSectionCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BulkMaterialAccessDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        sectionIds={selectedIds}
        onSuccess={() => setRowSelection({})}
      />
    </div>
  )
}
