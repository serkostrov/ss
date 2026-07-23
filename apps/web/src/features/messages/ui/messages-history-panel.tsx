import { useEffect, useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import type { DeliveryStatus, Message, MessageSource } from '@shared/api'
import {
  Badge,
  DataTable,
  ErrorState,
  Filters,
  PageHeader,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import {
  deliveryStatusLabel,
  formatMessageDate,
  messageSourceLabel,
  truncateMessageText,
} from '../model/schemas'
import { useMessages, useWorkGroupsForMessageFilter } from '../model/use-messages'
import { MessageDetailSheet } from './message-detail-sheet'

type MessagesHistoryPanelProps = {
  /** When set, locks filter to this work group and hides group selector. */
  workGroupId?: string
  /** When set, locks filter to this messenger source and hides source selector. */
  lockedSource?: MessageSource
  title?: string
  description?: string
  showPageHeader?: boolean
}

export function MessagesHistoryPanel({
  workGroupId,
  lockedSource,
  title = 'История сообщений',
  description = 'Сообщения рабочих групп из Telegram и Max: источники, статусы, авторы и время.',
  showPageHeader = true,
}: MessagesHistoryPanelProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [source, setSource] = useState<MessageSource | 'all'>(lockedSource ?? 'all')
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus | 'all'>('all')
  const [groupFilter, setGroupFilter] = useState<string>(workGroupId ?? 'all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const groupsQuery = useWorkGroupsForMessageFilter()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, source, deliveryStatus, groupFilter, pageSize, workGroupId])

  useEffect(() => {
    if (workGroupId) setGroupFilter(workGroupId)
  }, [workGroupId])

  useEffect(() => {
    if (lockedSource) setSource(lockedSource)
  }, [lockedSource])

  const query = useMessages({
    search: debouncedSearch,
    workGroupId: workGroupId ?? groupFilter,
    source: lockedSource ?? source,
    deliveryStatus,
    page,
    pageSize,
  })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const selected = items.find((item) => item.id === selectedId) ?? null

  const filterFields: FilterFieldConfig[] = [
    {
      id: 'search',
      label: 'Поиск',
      type: 'search',
      placeholder: 'Текст, автор, ID…',
      value: search,
      onChange: setSearch,
    },
    ...(!workGroupId
      ? [
          {
            id: 'workGroup',
            label: 'Группа',
            type: 'select' as const,
            value: groupFilter,
            onChange: setGroupFilter,
            options: [
              { value: 'all', label: 'Все группы' },
              ...(groupsQuery.data ?? []).map((group) => ({
                value: group.id,
                label: group.name,
              })),
            ],
          },
        ]
      : []),
    ...(!lockedSource
      ? [
          {
            id: 'source',
            label: 'Источник',
            type: 'select' as const,
            value: source,
            onChange: (value: string) => setSource(value as MessageSource | 'all'),
            options: [
              { value: 'all', label: messageSourceLabel('all') },
              { value: 'telegram', label: messageSourceLabel('telegram') },
              { value: 'max', label: messageSourceLabel('max') },
            ],
          },
        ]
      : []),
    {
      id: 'deliveryStatus',
      label: 'Доставка',
      type: 'select',
      value: deliveryStatus,
      onChange: (value) => setDeliveryStatus(value as DeliveryStatus | 'all'),
      options: [
        { value: 'all', label: deliveryStatusLabel('all') },
        { value: 'received', label: deliveryStatusLabel('received') },
        { value: 'stored', label: deliveryStatusLabel('stored') },
        { value: 'relayed', label: deliveryStatusLabel('relayed') },
        { value: 'failed', label: deliveryStatusLabel('failed') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<Message, unknown>[]>(
    () => [
      {
        accessorKey: 'sent_at',
        header: 'Отправлено',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatMessageDate(row.original.sent_at)}
          </span>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Источник',
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {messageSourceLabel(row.original.source)}
          </Badge>
        ),
      },
      {
        id: 'author',
        header: 'Автор',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.author_name?.trim() || 'Без имени'}
            </p>
            {row.original.author_external_id ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {row.original.author_external_id}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'text',
        header: 'Текст',
        cell: ({ row }) => (
          <p className="max-w-[22rem] text-sm text-muted-foreground">
            {truncateMessageText(row.original.text)}
          </p>
        ),
      },
      ...(!workGroupId
        ? [
            {
              id: 'work_group',
              header: 'Группа',
              cell: ({ row }: { row: { original: Message } }) => (
                <span className="text-sm">
                  {row.original.work_group?.name ?? '—'}
                </span>
              ),
            } as ColumnDef<Message, unknown>,
          ]
        : []),
      {
        accessorKey: 'delivery_status',
        header: 'Доставка',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.delivery_status}
            label={deliveryStatusLabel(row.original.delivery_status)}
          />
        ),
      },
      {
        id: 'relays',
        header: 'Релеи',
        cell: ({ row }) => {
          const count = row.original.relays.length
          if (!count) {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          const failed = row.original.relays.filter((item) => item.status === 'failed').length
          return (
            <span className="text-sm text-muted-foreground">
              {count}
              {failed > 0 ? ` · ошибок ${failed}` : ''}
            </span>
          )
        },
      },
    ],
    [workGroupId],
  )

  return (
    <div className="space-y-6">
      {showPageHeader ? (
        <PageHeader title={title} description={description} />
      ) : null}

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setDebouncedSearch('')
          setSource('all')
          setDeliveryStatus('all')
          if (!workGroupId) setGroupFilter('all')
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
          emptyTitle="Сообщений нет"
          emptyDescription="История появится после приёма сообщений worker’ом Telegram / Max."
          getRowId={(row) => row.id}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onRowClick={(row) => setSelectedId(row.id)}
        />
      )}

      <MessageDetailSheet
        messageId={selectedId}
        fallback={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      />
    </div>
  )
}
