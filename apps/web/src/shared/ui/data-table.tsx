import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import * as React from 'react'

import { cn } from '@shared/lib/utils'
import { EmptyState } from './empty-state'
import { LoadingState } from './loading-state'
import { Pagination } from './pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  /** When set, entire row is clickable (cursor + keyboard). */
  onRowClick?: (row: TData) => void
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  className?: string
  getRowId?: (row: TData) => string
}

function DataTable<TData>({
  columns,
  data,
  loading = false,
  emptyTitle = 'Нет данных',
  emptyDescription = 'Здесь пока ничего нет.',
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
  getRowId,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting ?? internalSorting,
      rowSelection: rowSelection ?? {},
    },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: total != null,
    enableRowSelection: Boolean(onRowSelectionChange),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  })

  if (loading) {
    return <LoadingState variant="table" rows={6} className={className} />
  }

  if (!data.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSelect = header.column.id === 'select'
                  const metaClassName = (
                    header.column.columnDef.meta as { className?: string } | undefined
                  )?.className
                  return (
                  <TableHead
                    key={header.id}
                    className={cn(isSelect && 'w-10 max-w-10', metaClassName)}
                    style={isSelect ? { width: '2.5rem' } : undefined}
                  >
                    <div className={cn('min-w-0', !isSelect && 'truncate')}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                  </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={
                  onRowClick
                    ? (event) => {
                        const target = event.target as HTMLElement
                        if (
                          target.closest(
                            'button, a, input, label, [role="checkbox"], [role="menuitem"]',
                          )
                        ) {
                          return
                        }
                        onRowClick(row.original)
                      }
                    : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        const target = event.target as HTMLElement
                        if (
                          target !== event.currentTarget &&
                          target.closest('button, a, input, label, [role="checkbox"]')
                        ) {
                          return
                        }
                        event.preventDefault()
                        onRowClick(row.original)
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => {
                  const isSelect = cell.column.id === 'select'
                  const metaClassName = (
                    cell.column.columnDef.meta as { className?: string } | undefined
                  )?.className
                  return (
                  <TableCell
                    key={cell.id}
                    className={cn(isSelect && 'w-10 max-w-10', metaClassName)}
                    style={isSelect ? { width: '2.5rem' } : undefined}
                  >
                    <div className={cn('min-w-0', !isSelect && 'overflow-hidden')}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {page != null && pageSize != null && total != null && onPageChange ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
    </div>
  )
}

export { DataTable }
export type { DataTableProps, ColumnDef }
