import { useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'

import type { AuditLogEntry } from '@shared/api'
import { notify } from '@shared/lib/notify'
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  type FilterFieldConfig,
} from '@shared/ui'

import { auditActorLabel, formatAuditDate, formatAuditPayload } from '../model/schemas'
import {
  exportAuditLogCsv,
  useAuditActionOptions,
  useAuditEntityTypeOptions,
  useAuditLog,
} from '../model/use-audit-log'

export function AuditLogPanel() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [action, setAction] = useState<string>('all')
  const [entityType, setEntityType] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [exporting, setExporting] = useState(false)

  const actionsQuery = useAuditActionOptions()
  const entityTypesQuery = useAuditEntityTypeOptions()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, action, entityType, pageSize])

  const filters = {
    search: debouncedSearch,
    action,
    entityType,
    page,
    pageSize,
  }

  const query = useAuditLog(filters)
  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Действие, тип, ID…',
      value: search,
      onChange: setSearch,
    },
    {
      id: 'action',
      label: 'Действие',
      type: 'select',
      value: action,
      onChange: setAction,
      options: [
        { value: 'all', label: 'Все действия' },
        ...(actionsQuery.data ?? []).map((value) => ({ value, label: value })),
      ],
    },
    {
      id: 'entityType',
      label: 'Сущность',
      type: 'select',
      value: entityType,
      onChange: setEntityType,
      options: [
        { value: 'all', label: 'Все сущности' },
        ...(entityTypesQuery.data ?? []).map((value) => ({ value, label: value })),
      ],
    },
  ]

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Когда',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatAuditDate(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Действие',
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono font-normal">
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: 'entity_type',
        header: 'Сущность',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.entity_type}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {row.original.entity_id ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'actor',
        header: 'Кто',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{auditActorLabel(row.original)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.actor?.email ?? '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'payload',
        header: 'Детали',
        cell: ({ row }) => (
          <p className="max-w-[20rem] truncate font-mono text-xs text-muted-foreground">
            {formatAuditPayload(row.original.payload)}
          </p>
        ),
      },
    ],
    [],
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportAuditLogCsv({
        search: debouncedSearch,
        action,
        entityType,
      })
    } catch (error) {
      notify.fromError(error, 'Не удалось экспортировать журнал')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Журнал действий"
        description="Административные операции: кто, что и когда изменил в системе."
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={exporting || total === 0}
            onClick={() => void handleExport()}
          >
            <Download className="size-4" />
            Экспорт CSV
          </Button>
        }
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setDebouncedSearch('')
          setAction('all')
          setEntityType('all')
          setPage(1)
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          loading={query.isLoading}
          emptyTitle="Записей нет"
          emptyDescription="Журнал появится после административных операций."
          getRowId={(row) => row.id}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}
