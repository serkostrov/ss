import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'

import type { Poll } from '@shared/api'
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

import {
  formatPollDate,
  pollStatusLabel,
  voteModeLabel,
  type PollStatusFilter,
  type PollVoteModeFilter,
} from '../model/schemas'
import { usePolls } from '../model/use-polls'
import { PollFormDialog } from './poll-form-dialog'

export function PollsPanel() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PollStatusFilter>('all')
  const [voteMode, setVoteMode] = useState<PollVoteModeFilter>('all')
  const [formOpen, setFormOpen] = useState(false)

  const query = usePolls({ search, status, voteMode })

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
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as PollStatusFilter),
      options: [
        { value: 'all', label: pollStatusLabel('all') },
        { value: 'draft', label: pollStatusLabel('draft') },
        { value: 'active', label: pollStatusLabel('active') },
        { value: 'closed', label: pollStatusLabel('closed') },
      ],
    },
    {
      id: 'voteMode',
      label: 'Режим',
      type: 'select',
      value: voteMode,
      onChange: (value) => setVoteMode(value as PollVoteModeFilter),
      options: [
        { value: 'all', label: voteModeLabel('all') },
        { value: 'per_company', label: voteModeLabel('per_company') },
        { value: 'per_representative', label: voteModeLabel('per_representative') },
      ],
    },
  ]

  const columns = useMemo<ColumnDef<Poll, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Голосование',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description || 'Без описания'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Статус',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'vote_mode',
        header: 'Режим',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {voteModeLabel(row.original.vote_mode)}
          </span>
        ),
      },
      {
        id: 'period',
        header: 'Период',
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            <p>{formatPollDate(row.original.starts_at)}</p>
            <p>{formatPollDate(row.original.ends_at)}</p>
          </div>
        ),
      },
      {
        id: 'options',
        header: 'Варианты',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.options.length}</span>
        ),
      },
      {
        id: 'levels',
        header: 'Уровни',
        cell: ({ row }) => {
          const levels = row.original.levels
          if (!levels.length) {
            return <span className="text-sm text-muted-foreground">—</span>
          }
          return (
            <div className="flex max-w-[12rem] items-center gap-1 overflow-hidden">
              <Badge variant="outline" className="max-w-full truncate font-normal">
                {levels[0].name}
              </Badge>
              {levels.length > 1 ? (
                <Badge variant="secondary" className="shrink-0 font-normal">
                  +{levels.length - 1}
                </Badge>
              ) : null}
            </div>
          )
        },
      },
      {
        id: 'votes',
        header: 'Голоса',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.votes_count}</span>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Голосования"
        description="Опросы для представителей: варианты, периоды, режимы учёта голосов и доступ по уровням."
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
          setVoteMode('all')
        }}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data ?? []}
          loading={query.isLoading}
          emptyTitle="Голосований пока нет"
          emptyDescription="Создайте первое голосование."
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(routes.admin.poll(row.id))}
        />
      )}

      <PollFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onCreated={(poll) => navigate(routes.admin.poll(poll.id))}
      />
    </div>
  )
}
