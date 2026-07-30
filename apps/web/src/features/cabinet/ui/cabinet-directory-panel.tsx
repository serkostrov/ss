import { useState } from 'react'
import { Building2, ExternalLink, Package, SearchX, Users } from 'lucide-react'

import { Badge, EmptyState, ErrorState, PageHeader, SearchInput, Skeleton } from '@shared/ui'

import { useAssociationDirectory } from '../model/use-cabinet-company'

function DirectorySkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border p-4">
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
    <div className="space-y-4">
      <PageHeader
        title="Участники ассоциации"
        description="Активные компании, продукция и представители."
      />

      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Поиск по компании, продукции или представителю…"
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
            <article key={company.id} className="bg-card rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-medium">{company.name}</h2>
                  {company.inn ? (
                    <p className="text-muted-foreground text-xs">ИНН {company.inn}</p>
                  ) : null}
                </div>
                {company.participation_level_name ? (
                  <Badge variant="outline">{company.participation_level_name}</Badge>
                ) : null}
              </div>

              {company.description ? (
                <p className="text-muted-foreground mt-2 text-sm">{company.description}</p>
              ) : null}

              <dl className="text-muted-foreground mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {company.address ? (
                  <div>
                    <dt className="text-foreground inline">Адрес: </dt>
                    <dd className="inline">{company.address}</dd>
                  </div>
                ) : null}
                {company.website ? (
                  <div>
                    <dt className="text-foreground inline">Сайт: </dt>
                    <dd className="inline">{company.website}</dd>
                  </div>
                ) : null}
                {company.phone ? (
                  <div>
                    <dt className="text-foreground inline">Телефон: </dt>
                    <dd className="inline">{company.phone}</dd>
                  </div>
                ) : null}
                {company.email ? (
                  <div>
                    <dt className="text-foreground inline">Email: </dt>
                    <dd className="inline">{company.email}</dd>
                  </div>
                ) : null}
              </dl>

              {company.products.length > 0 ? (
                <div className="mt-4 border-t pt-3">
                  <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                    <Package className="size-3.5" />
                    Продукция
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {company.products.map((product) => (
                      <li key={product.id}>
                        {product.url ? (
                          <a
                            href={product.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:border-primary/40 hover:bg-accent/30 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                          >
                            {product.name}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="inline-flex rounded-md border px-2 py-1 text-sm">
                            {product.name}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 border-t pt-3">
                <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <Users className="size-3.5" />
                  Представители
                </p>
                {company.representatives.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Не указаны</p>
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
                        {(rep.phone || rep.email || rep.telegram_username || rep.max_username) && (
                          <p className="text-muted-foreground text-xs">
                            {[
                              rep.phone,
                              rep.email,
                              rep.telegram_username ? `TG @${rep.telegram_username}` : null,
                              rep.max_username ? `Max @${rep.max_username}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
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
