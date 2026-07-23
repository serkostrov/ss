import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'

import { routes } from '@shared/config'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Skeleton,
  StatusBadge,
} from '@shared/ui'

import {
  useCabinetMaterialsSearch,
  usePrefetchCabinetMaterial,
} from '../model/use-cabinet-materials'

function MaterialsListSkeleton() {
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

export function CabinetMaterialsPanel() {
  const [search, setSearch] = useState('')
  const query = useCabinetMaterialsSearch(search)
  const prefetch = usePrefetchCabinetMaterial()

  const emptyAfterFilter = useMemo(
    () => !query.isLoading && !query.isError && query.totalCount > 0 && query.items.length === 0,
    [query.isLoading, query.isError, query.totalCount, query.items.length],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Материалы"
        description="Разделы, разрешённые уровню участия вашей компании."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Поиск по названию или описанию…"
          aria-label="Поиск материалов"
          className="w-full sm:max-w-md"
          disabled={query.isLoading && query.totalCount === 0}
        />
        {!query.isLoading && query.totalCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? `Найдено: ${query.items.length} из ${query.totalCount}`
              : `Разделов: ${query.totalCount}`}
          </p>
        ) : null}
      </div>

      {query.isLoading && !query.data ? <MaterialsListSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить материалы"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount === 0 ? (
        <EmptyState
          title="Нет доступных материалов"
          description="Либо разделы ещё не опубликованы для вашего уровня, либо доступ компании ограничен."
        />
      ) : null}

      {emptyAfterFilter ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не найдено"
          description={`По запросу «${search.trim()}» разделов нет. Измените поисковую фразу.`}
          actionLabel="Сбросить поиск"
          onAction={() => setSearch('')}
        />
      ) : null}

      {query.items.length > 0 ? (
        <div
          className={`grid gap-3 sm:grid-cols-2 ${query.isFiltering ? 'opacity-80' : ''}`}
        >
          {query.items.map((section) => {
            const href = routes.cabinet.material(section.slug || section.id)
            return (
              <Link
                key={section.id}
                to={href}
                onMouseEnter={() => prefetch(section.slug)}
                onFocus={() => prefetch(section.slug)}
                className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium leading-snug">{section.title}</p>
                  <StatusBadge status="active" label="Доступно" className="shrink-0" />
                </div>
                {section.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Без описания</p>
                )}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
