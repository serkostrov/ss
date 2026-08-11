import { type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink, Package, Users } from 'lucide-react'

import { routes } from '@shared/config'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  LoadingState,
  PageDetailHeader,
} from '@shared/ui'

import { useDirectoryCompany } from '../model/use-cabinet-company'

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-sm break-words">{value || '—'}</dd>
    </div>
  )
}

function externalHref(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function CabinetDirectoryCompanyPanel() {
  const { id } = useParams<{ id: string }>()
  const query = useDirectoryCompany(id)
  const company = query.company
  useTargetHighlightFlash()

  if (query.isLoading && !query.data) {
    return <LoadingState label="Загрузка компании…" />
  }

  if (query.isError) {
    return (
      <ErrorState
        title="Не удалось загрузить компанию"
        error={query.error}
        onRetry={() => void query.refetch()}
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.directory}>К участникам</Link>
          </Button>
        }
      />
    )
  }

  if (!company) {
    return (
      <ErrorState
        title="Компания не найдена"
        description="Компания скрыта или отсутствует в справочнике ассоциации."
        action={
          <Button asChild variant="outline">
            <Link to={routes.cabinet.directory}>К участникам</Link>
          </Button>
        }
      />
    )
  }

  const website = externalHref(company.website)

  return (
    <div className="space-y-6">
      <PageDetailHeader
        backTo={routes.cabinet.directory}
        title={company.name}
        description={
          company.participation_level_name
            ? `Участник ассоциации · ${company.participation_level_name}`
            : 'Участник ассоциации'
        }
      >
        {null}
      </PageDetailHeader>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
              {company.name}
            </CardTitle>
            {company.description ? (
              <p className="text-muted-foreground text-sm leading-relaxed">{company.description}</p>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Field label="ИНН" value={company.inn} />
              <Field label="Уровень участия" value={company.participation_level_name} />
              <Field label="Телефон" value={company.phone} />
              <Field
                label="Email"
                value={
                  company.email ? (
                    <a
                      href={`mailto:${company.email}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {company.email}
                    </a>
                  ) : null
                }
              />
              <Field label="Адрес" value={company.address} />
              <Field
                label="Сайт"
                value={
                  website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 break-all underline-offset-4 hover:underline"
                    >
                      {company.website}
                      <ExternalLink className="size-3.5 shrink-0" />
                    </a>
                  ) : null
                }
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Представители
            </CardTitle>
          </CardHeader>
          <CardContent>
            {company.representatives.length === 0 ? (
              <p className="text-muted-foreground text-sm">Не указаны</p>
            ) : (
              <ul className="space-y-4">
                {company.representatives.map((rep) => {
                  const contacts = [
                    rep.phone,
                    rep.email,
                    rep.telegram_username ? `TG @${rep.telegram_username}` : null,
                    rep.max_username ? `Max @${rep.max_username}` : null,
                  ].filter(Boolean)

                  return (
                    <li key={rep.id} className="min-w-0 border-b pb-4 last:border-b-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rep.full_name}</p>
                        {rep.is_primary ? (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                            основной
                          </Badge>
                        ) : null}
                      </div>
                      {rep.position ? (
                        <p className="text-muted-foreground mt-0.5 text-sm">{rep.position}</p>
                      ) : null}
                      {contacts.length > 0 ? (
                        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                          {contacts.join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {company.products.length > 0 ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-4" />
              Продукция и услуги
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to={`${routes.cabinet.products}?company=${company.id}`}>Все позиции</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border">
              {company.products.map((product) => (
                <li key={product.id} id={`product-${product.id}`} className="scroll-mt-28">
                  <Link
                    to={routes.cabinet.product(product.id)}
                    className="hover:bg-muted/40 flex flex-col gap-0.5 px-3 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {product.okpd_code ? (
                          <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                            {product.okpd_code}
                          </span>
                        ) : null}
                        {product.note_name && product.note_name !== 'отсутствует' ? (
                          <Badge
                            variant="secondary"
                            className="max-w-[14rem] truncate px-1.5 py-0 text-[10px] font-normal"
                          >
                            {product.note_name}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-medium">
                        {product.name}
                      </p>
                      {product.okpd_title ? (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                          {product.okpd_title}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">Подробнее</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
