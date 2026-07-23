import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, SearchX } from 'lucide-react'

import { useAuth } from '@app/providers'
import { formatPollDate, voteModeLabel } from '@features/polls'
import { routes } from '@shared/config'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Skeleton,
  StatusBadge,
} from '@shared/ui'

import { useCabinetPollAccessHint } from '../model/use-cabinet-company'
import { useCabinetPollsSearch } from '../model/use-cabinet-polls'

function PollsListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4">
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
      ))}
    </div>
  )
}

function emptyHintDescription(reason: string | undefined, companyName?: string, activeTotal?: number) {
  switch (reason) {
    case 'no_representative':
    case 'no_company':
      return 'Профиль не привязан к компании. Обратитесь к администратору АПСС.'
    case 'company_inactive':
      return `Доступ компании «${companyName ?? ''}» ограничен — голосования скрыты до восстановления.`
    case 'no_level':
      return `Для компании «${companyName ?? ''}» не назначен уровень участия. Попросите администратора указать уровень — после этого активные опросы появятся здесь.`
    case 'level_mismatch':
      return `Сейчас открыто опросов: ${activeTotal ?? 0}, но ни один не доступен уровню вашей компании. Администратор должен добавить ваш уровень в настройки опроса.`
    case 'no_active_polls':
      return 'Нет опросов со статусом «Активен» в текущем периоде голосования.'
    default:
      return 'Сейчас нет опросов в периоде голосования для вашего уровня участия.'
  }
}

export function CabinetPollsPanel() {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const query = useCabinetPollsSearch(search)
  const hintQuery = useCabinetPollAccessHint(query.totalCount === 0 && !query.isLoading)

  const emptyAfterFilter = useMemo(
    () => !query.isLoading && !query.isError && query.totalCount > 0 && query.items.length === 0,
    [query.isLoading, query.isError, query.totalCount, query.items.length],
  )

  const hint = hintQuery.data
  const membership = profile?.membership

  return (
    <div className="space-y-6">
      <PageHeader
        title="Голосования"
        description="Активные опросы, доступные уровню участия вашей компании. Голос учитывается один раз."
      />

      {membership && !membership.participationLevelId ? (
        <Alert>
          <AlertTitle>Не назначен уровень участия</AlertTitle>
          <AlertDescription>
            Без уровня участия опросы не отображаются. Обратитесь к администратору АПСС.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Поиск по названию или описанию…"
          aria-label="Поиск голосований"
          className="w-full sm:max-w-md"
          disabled={query.isLoading && query.totalCount === 0}
        />
        {!query.isLoading && query.totalCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? `Найдено: ${query.items.length} из ${query.totalCount}`
              : `Доступно: ${query.totalCount}`}
          </p>
        ) : null}
      </div>

      {query.isLoading && !query.data ? <PollsListSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить голосования"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount === 0 ? (
        <EmptyState
          title="Нет доступных голосований"
          description={emptyHintDescription(
            hint?.reason,
            hint?.company_name ?? membership?.companyName,
            hint?.active_total,
          )}
        />
      ) : null}

      {emptyAfterFilter ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не найдено"
          description={`По запросу «${search.trim()}» голосований нет.`}
          actionLabel="Сбросить поиск"
          onAction={() => setSearch('')}
        />
      ) : null}

      {query.items.length > 0 ? (
        <div className={`grid gap-3 sm:grid-cols-2 ${query.isFiltering ? 'opacity-80' : ''}`}>
          {query.items.map((poll) => (
            <Link
              key={poll.id}
              to={routes.cabinet.poll(poll.id)}
              className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium leading-snug">{poll.title}</p>
                {poll.hasVoted ? (
                  <StatusBadge status="confirmed" label="Голос учтён" className="shrink-0" />
                ) : (
                  <StatusBadge status="active" label="Открыто" className="shrink-0" />
                )}
              </div>
              {poll.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {poll.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal">
                  {voteModeLabel(poll.vote_mode)}
                </Badge>
                <span>до {formatPollDate(poll.ends_at)}</span>
                {poll.myVote ? (
                  <span className="inline-flex items-center gap-1 text-foreground">
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                    {poll.myVote.optionText}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
