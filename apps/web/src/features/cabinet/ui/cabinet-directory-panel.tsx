import { useState } from 'react'
import { Building2, SearchX, Users } from 'lucide-react'

import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Skeleton,
} from '@shared/ui'

import { useAssociationDirectory } from '../model/use-cabinet-company'

function DirectorySkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4">
          <Skeleton className="mb-3 h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
  )
}

export function CabinetDirectoryPanel() {
  const [search, setSearch] = useState('')
  const query = useAssociationDirectory(search)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Участники ассоциации"
        description="Активные компании, их описание и представители."
      />

      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Поиск по компании, ИНН или представителю…"
        aria-label="Поиск по справочнику"
        className="w-full sm:max-w-md"
      />

      {query.isLoading && !query.data ? <DirectorySkeleton /> : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить справочник"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount === 0 ? (
        <EmptyState
          icon={Building2}
          title="Пока нет компаний"
          description="Справочник появится после подтверждения участников."
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount > 0 && query.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не найдено"
          description={`По запросу «${search.trim()}» совпадений нет.`}
          actionLabel="Сбросить поиск"
          onAction={() => setSearch('')}
        />
      ) : null}

      {query.items.length > 0 ? (
        <div className="grid gap-3">
          {query.items.map((company) => (
            <article key={company.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-medium">{company.name}</h2>
                  {company.inn ? (
                    <p className="text-xs text-muted-foreground">ИНН {company.inn}</p>
                  ) : null}
                </div>
                {company.participation_level_name ? (
                  <Badge variant="outline">{company.participation_level_name}</Badge>
                ) : null}
              </div>

              {company.description ? (
                <p className="mt-2 text-sm text-muted-foreground">{company.description}</p>
              ) : null}

              <dl className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {company.address ? (
                  <div>
                    <dt className="inline text-foreground">Адрес: </dt>
                    <dd className="inline">{company.address}</dd>
                  </div>
                ) : null}
                {company.website ? (
                  <div>
                    <dt className="inline text-foreground">Сайт: </dt>
                    <dd className="inline">{company.website}</dd>
                  </div>
                ) : null}
                {company.phone ? (
                  <div>
                    <dt className="inline text-foreground">Телефон: </dt>
                    <dd className="inline">{company.phone}</dd>
                  </div>
                ) : null}
                {company.email ? (
                  <div>
                    <dt className="inline text-foreground">Email: </dt>
                    <dd className="inline">{company.email}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-4 border-t pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <Users className="size-3.5" />
                  Представители
                </p>
                {company.representatives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Не указаны</p>
                ) : (
                  <ul className="space-y-2">
                    {company.representatives.map((rep) => (
                      <li key={rep.id} className="text-sm">
                        <span className="font-medium">{rep.full_name}</span>
                        {rep.is_primary ? (
                          <Badge variant="secondary" className="ml-2 font-normal">
                            основной
                          </Badge>
                        ) : null}
                        {rep.position ? (
                          <span className="text-muted-foreground"> · {rep.position}</span>
                        ) : null}
                        {(rep.phone || rep.email) && (
                          <p className="text-xs text-muted-foreground">
                            {[rep.phone, rep.email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
