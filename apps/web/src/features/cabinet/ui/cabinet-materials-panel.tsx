import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'

import { routes } from '@shared/config'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
} from '@shared/ui'
import { useActiveMaterialCategories } from '@features/material-categories'

import {
  useCabinetMaterialsSearch,
  usePrefetchCabinetMaterial,
} from '../model/use-cabinet-materials'

function MaterialsListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border p-4">
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
  const [categoryId, setCategoryId] = useState('all')
  const query = useCabinetMaterialsSearch(search)
  const categories = useActiveMaterialCategories()
  const prefetch = usePrefetchCabinetMaterial()

  const items = useMemo(() => {
    if (categoryId === 'all') return query.items
    if (categoryId === 'none') {
      return query.items.filter((item) => !item.category_id)
    }
    return query.items.filter((item) => item.category_id === categoryId)
  }, [query.items, categoryId])

  const emptyAfterFilter = useMemo(
    () => !query.isLoading && !query.isError && query.totalCount > 0 && items.length === 0,
    [query.isLoading, query.isError, query.totalCount, items.length],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Материалы"
        description="Разделы, разрешённые уровню участия вашей компании."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-row">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Поиск по названию или описанию…"
            aria-label="Поиск материалов"
            className="w-full"
            disabled={query.isLoading && query.totalCount === 0}
          />
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Категория">
              <SelectValue placeholder="Категория" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все категории</SelectItem>
              <SelectItem value="none">Без категории</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!query.isLoading && query.totalCount > 0 ? (
          <p className="text-muted-foreground text-sm">
            {search.trim() || categoryId !== 'all'
              ? `Найдено: ${items.length} из ${query.totalCount}`
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
          description={
            search.trim()
              ? `По запросу «${search.trim()}» разделов нет.`
              : 'В выбранной категории разделов нет.'
          }
          actionLabel="Сбросить фильтры"
          onAction={() => {
            setSearch('')
            setCategoryId('all')
          }}
        />
      ) : null}

      {items.length > 0 ? (
        <div className={`grid gap-3 sm:grid-cols-2 ${query.isFiltering ? 'opacity-80' : ''}`}>
          {items.map((section) => {
            const href = routes.cabinet.material(section.slug || section.id)
            return (
              <Link
                key={section.id}
                to={href}
                onMouseEnter={() => prefetch(section.slug)}
                onFocus={() => prefetch(section.slug)}
                className="bg-card hover:border-primary/40 hover:bg-accent/30 focus-visible:ring-ring rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 leading-snug font-medium">{section.title}</p>
                  <StatusBadge status="active" label="Доступно" className="shrink-0" />
                </div>
                {section.category?.name ? (
                  <p className="text-muted-foreground mt-1 text-xs">{section.category.name}</p>
                ) : null}
                {section.description ? (
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                    {section.description}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-2 text-sm">Без описания</p>
                )}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
