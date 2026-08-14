import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SearchX, UsersRound } from 'lucide-react'

import {
  useWorkGroupCategories,
  workGroupStatusLabel,
  type WorkGroupStatusFilter,
} from '@features/work-groups'
import { routes } from '@shared/config'
import {
  Badge,
  EmptyState,
  ErrorState,
  Filters,
  PageHeader,
  Skeleton,
  StatusBadge,
  type FilterFieldConfig,
} from '@shared/ui'

import { useCabinetWorkGroupsFiltered } from '../model/use-cabinet-work-groups'

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border p-4">
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/5" />
        </div>
      ))}
    </div>
  )
}

export function CabinetWorkGroupsPanel() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<WorkGroupStatusFilter>('all')
  const [categoryId, setCategoryId] = useState('all')

  const categories = useWorkGroupCategories()
  const query = useCabinetWorkGroupsFiltered({ search, status, categoryId })

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
      id: 'category',
      label: 'Направление',
      type: 'select',
      value: categoryId,
      onChange: setCategoryId,
      options: [
        { value: 'all', label: 'Все направления' },
        ...(categories.data ?? []).map((category) => ({
          value: category.id,
          label: category.name,
        })),
      ],
    },
    {
      id: 'status',
      label: 'Статус',
      type: 'select',
      value: status,
      onChange: (value) => setStatus(value as WorkGroupStatusFilter),
      options: [
        { value: 'all', label: workGroupStatusLabel('all') },
        { value: 'active', label: workGroupStatusLabel('active') },
        { value: 'paused', label: workGroupStatusLabel('paused') },
        { value: 'archived', label: workGroupStatusLabel('archived') },
      ],
    },
  ]

  const emptyAfterFilter = useMemo(
    () => !query.isLoading && !query.isError && query.totalCount > 0 && query.items.length === 0,
    [query.isLoading, query.isError, query.totalCount, query.items.length],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Рабочие группы"
        description="Перечень групп ассоциации и ваш статус участия. Вступление и выход — по заявке через модерацию."
      />

      <Filters
        fields={filterFields}
        onReset={() => {
          setSearch('')
          setStatus('all')
          setCategoryId('all')
        }}
      />

      {query.isLoading ? <ListSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить группы"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Нет рабочих групп"
          description="Когда администратор создаст группы, они появятся здесь."
        />
      ) : null}

      {emptyAfterFilter ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не найдено"
          description="Измените фильтры или поисковый запрос."
        />
      ) : null}

      {query.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {query.items.map((group) => (
            <Link
              key={group.id}
              to={routes.cabinet.workGroup(group.id)}
              className="bg-card hover:bg-accent/40 block rounded-lg border p-4 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">{group.name}</p>
                <div className="flex flex-wrap gap-1">
                  {group.is_responsible ? (
                    <Badge variant="default">Ответственный</Badge>
                  ) : null}
                  {group.pending_request_kind ? (
                    <Badge variant="secondary">
                      {group.pending_request_kind === 'join'
                        ? 'Заявка на вступление'
                        : 'Заявка на выход'}
                    </Badge>
                  ) : group.is_member ? (
                    <Badge variant="default">Участник</Badge>
                  ) : !group.is_responsible ? (
                    <Badge variant="secondary">Не участник</Badge>
                  ) : null}
                  <StatusBadge
                    status={group.status === 'active' ? 'active' : 'pending'}
                    label={
                      group.status === 'active'
                        ? 'Активна'
                        : group.status === 'paused'
                          ? 'На паузе'
                          : group.status === 'archived'
                            ? 'Завершена'
                            : undefined
                    }
                  />
                </div>
              </div>
              {group.category_name ? (
                <p className="text-muted-foreground mt-1 text-xs">{group.category_name}</p>
              ) : null}
              {group.description ? (
                <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">{group.description}</p>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
