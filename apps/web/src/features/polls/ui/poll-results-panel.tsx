import { useDeferredValue, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { type ColumnDef } from '@tanstack/react-table'
import { Download, RefreshCw, BarChart3 } from 'lucide-react'

import type { PollVoteRow } from '@shared/api'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
} from '@shared/ui'
import { notify } from '@shared/lib/notify'
import { cn } from '@shared/lib/utils'

import { formatPollDate, voteModeLabel } from '../model/schemas'
import {
  exportPollResultsCsv,
  formatPercent,
  usePollResults,
  usePollVotes,
} from '../model/use-poll-results'

const CHART_COLORS = [
  '#0f766e',
  '#0369a1',
  '#b45309',
  '#15803d',
  '#be123c',
  '#4338ca',
  '#a16207',
  '#0e7490',
]

type PollResultsPanelProps = {
  pollId: string
  pollTitle?: string
  className?: string
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function PollResultsPanel({ pollId, className }: PollResultsPanelProps) {
  const resultsQuery = usePollResults(pollId)
  const votesQuery = usePollVotes(pollId)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)

  const results = resultsQuery.data
  const votes = votesQuery.data ?? []

  const filteredVotes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!q) return votes
    return votes.filter((vote) => {
      const haystack = [
        vote.representative_name,
        vote.representative_email ?? '',
        vote.company_name,
        vote.option_text,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [votes, deferredSearch])

  const chartData = useMemo(
    () =>
      (results?.options ?? []).map((option) => ({
        id: option.id,
        name:
          option.text.length > 28 ? `${option.text.slice(0, 28)}…` : option.text,
        fullName: option.text,
        votes: option.votes_count,
        share: option.share,
      })),
    [results?.options],
  )

  const columns = useMemo<ColumnDef<PollVoteRow, unknown>[]>(
    () => [
      {
        accessorKey: 'voted_at',
        header: 'Когда',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatPollDate(row.original.voted_at)}
          </span>
        ),
      },
      {
        accessorKey: 'representative_name',
        header: 'Представитель',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.representative_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.representative_email || '—'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'company_name',
        header: 'Компания',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.company_name}</span>
        ),
      },
      {
        accessorKey: 'option_text',
        header: 'Вариант',
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-normal">
            {row.original.option_text}
          </Badge>
        ),
      },
    ],
    [],
  )

  const loading = resultsQuery.isLoading || votesQuery.isLoading
  const error = resultsQuery.isError ? resultsQuery.error : votesQuery.error

  const refresh = () => {
    void resultsQuery.refetch()
    void votesQuery.refetch()
  }

  const handleExport = () => {
    if (!results) return
    try {
      exportPollResultsCsv(results, votes)
      notify.success('Файл CSV скачан')
    } catch (err) {
      notify.fromError(err, 'Не удалось экспортировать результаты')
    }
  }

  if (loading && !results) {
    return <LoadingState label="Загрузка результатов…" />
  }

  if (error) {
    return (
      <ErrorState
        title="Не удалось загрузить результаты"
        error={error}
        onRetry={refresh}
      />
    )
  }

  if (!results) {
    return (
      <EmptyState
        title="Результаты недоступны"
        description="Не удалось получить агрегированные данные голосования."
      />
    )
  }

  const eligibleHint =
    results.vote_mode === 'per_company'
      ? 'активные компании с доступом'
      : 'активные представители с доступом'

  return (
    <div className={cn('space-y-4', className)}>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4" />
                Результаты
              </CardTitle>
              <CardDescription>
                Сводка и распределение голосов · {voteModeLabel(results.vote_mode)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="size-4" />
                Обновить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={results.votes_total === 0 && votes.length === 0}
              >
                <Download className="size-4" />
                Экспорт CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Всего голосов" value={String(results.votes_total)} />
            <StatTile
              label="Компаний"
              value={String(results.companies_voted)}
              hint="уникальных по голосам"
            />
            <StatTile
              label="Имеют право"
              value={String(results.eligible_total)}
              hint={eligibleHint}
            />
            <StatTile
              label="Явка"
              value={formatPercent(results.turnout_share)}
              hint={
                results.first_voted_at
                  ? `${formatPollDate(results.first_voted_at)} — ${formatPollDate(results.last_voted_at)}`
                  : 'голосов пока нет'
              }
            />
          </div>

          {results.votes_total === 0 ? (
            <EmptyState
              title="Голосов пока нет"
              description="Графики и список появятся после первых ответов участников."
              className="py-10"
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-medium">Распределение (столбцы)</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={56}
                      />
                      <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => [`${value ?? 0}`, 'Голосов']}
                        labelFormatter={(_, payload) =>
                          (payload?.[0]?.payload as { fullName?: string } | undefined)
                            ?.fullName ?? ''
                        }
                      />
                      <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={entry.id}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-medium">Доли вариантов</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="votes"
                        nameKey="fullName"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={entry.id}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, item) => {
                          const share =
                            (item?.payload as { share?: number } | undefined)?.share ?? 0
                          return [`${value ?? 0} (${formatPercent(share)})`, 'Голосов']
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {results.options.map((option, index) => (
                    <li
                      key={option.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                        <span className="truncate">{option.text}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {option.votes_count} · {formatPercent(option.share)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Проголосовавшие</CardTitle>
              <CardDescription>
                {votes.length
                  ? `Записей: ${filteredVotes.length}${deferredSearch.trim() ? ` из ${votes.length}` : ''}`
                  : 'Список голосов по представителям и компаниям'}
              </CardDescription>
            </div>
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Поиск по ФИО, компании, варианту…"
              aria-label="Поиск по проголосовавшим"
              className="w-full sm:max-w-sm"
              disabled={votes.length === 0}
            />
          </div>
        </CardHeader>
        <CardContent>
          {votes.length === 0 ? (
            <EmptyState
              title="Список пуст"
              description="Когда участники проголосуют, здесь появятся их ответы."
              className="py-10"
            />
          ) : (
            <DataTable
              columns={columns}
              data={filteredVotes}
              loading={votesQuery.isFetching && !votesQuery.data}
              emptyTitle="Ничего не найдено"
              emptyDescription="Измените поисковый запрос."
              getRowId={(row) => row.id}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
