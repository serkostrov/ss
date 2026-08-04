import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ExternalLink, Package, SearchX } from 'lucide-react'

import { useClearNavNotificationBadges } from '@features/notifications'
import { routes } from '@shared/config'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import { cn } from '@shared/lib/utils'
import {
  Badge,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@shared/ui'

import {
  useCabinetProductsCatalog,
  type CabinetCatalogProduct,
} from '../model/use-cabinet-products'

function ProductsSkeleton() {
  return (
    <div className="rounded-lg border" aria-hidden>
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export type CabinetProductsPanelProps = {
  clearNotificationBadges?: boolean
  companyTo?: (companyId: string) => string
  productTo?: (companyId: string, productId: string) => string
}

function SoftLink({
  href,
  className,
  children,
}: {
  href?: string
  className?: string
  children: ReactNode
}) {
  if (!href) return <span className={className}>{children}</span>
  return (
    <Link
      to={href}
      className={cn('hover:text-primary transition-colors', className)}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  )
}

function ProductIdentity({
  code,
  title,
  note,
}: {
  code: string | null
  title: string
  note: string | null
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {code ? (
          <span className="bg-muted/80 text-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-tight">
            {code}
          </span>
        ) : (
          <Badge variant="muted" className="px-1.5 py-0 text-[10px] font-normal">
            без ОКПД
          </Badge>
        )}
        {note && note !== 'отсутствует' ? (
          <Badge variant="secondary" className="max-w-[16rem] truncate px-1.5 py-0 text-[10px] font-normal">
            {note}
          </Badge>
        ) : null}
      </div>
      <p className="text-foreground line-clamp-2 text-sm font-medium leading-snug">{title}</p>
    </div>
  )
}

export function CabinetProductsPanel({
  clearNotificationBadges = true,
  companyTo,
  productTo,
}: CabinetProductsPanelProps = {}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyFromUrl = searchParams.get('company')
  const [search, setSearch] = useState('')
  const [okpdCodeId, setOkpdCodeId] = useState('all')
  const [noteId, setNoteId] = useState('all')
  const [companyId, setCompanyId] = useState(companyFromUrl || 'all')
  useClearNavNotificationBadges('products', clearNotificationBadges)
  useTargetHighlightFlash()

  useEffect(() => {
    if (companyFromUrl) setCompanyId(companyFromUrl)
  }, [companyFromUrl])

  const query = useCabinetProductsCatalog({ search, okpdCodeId, noteId, companyId })
  const rows = query.items

  const hasActiveFilters =
    Boolean(search.trim()) || okpdCodeId !== 'all' || noteId !== 'all' || companyId !== 'all'

  const setCompanyFilter = (value: string) => {
    setCompanyId(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('company')
    else next.set('company', value)
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => {
    setSearch('')
    setOkpdCodeId('all')
    setNoteId('all')
    setCompanyId('all')
    const next = new URLSearchParams(searchParams)
    next.delete('company')
    setSearchParams(next, { replace: true })
  }

  const countLabel = useMemo(() => {
    if (query.isLoading || query.totalCount === 0) return null
    if (hasActiveFilters) return `${rows.length} из ${query.totalCount}`
    return `${query.totalCount} поз.`
  }, [query.isLoading, query.totalCount, rows.length, hasActiveFilters])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Продукция и услуги"
        description="Каталог по ОКПД 2 и примечанию продукции."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Поиск…"
          aria-label="Поиск продукции"
          className="w-full sm:max-w-xs"
        />
        <Select value={okpdCodeId} onValueChange={setOkpdCodeId}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Код ОКПД 2">
            <SelectValue placeholder="ОКПД 2" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Все коды</SelectItem>
            {query.okpdOptions.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={noteId} onValueChange={setNoteId}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Примечание продукции">
            <SelectValue placeholder="Примечание" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все примечания</SelectItem>
            <SelectItem value="none">Без примечания</SelectItem>
            {query.noteOptions.map((note) => (
              <SelectItem key={note.id} value={note.id}>
                {note.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={companyId} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Компания">
            <SelectValue placeholder="Компания" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все компании</SelectItem>
            {query.companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3 sm:ml-auto">
          {countLabel ? <p className="text-muted-foreground text-sm">{countLabel}</p> : null}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Сбросить
            </button>
          ) : null}
        </div>
      </div>

      {query.isLoading && !query.data ? <ProductsSkeleton /> : null}

      {query.isError ? (
        <ErrorState
          title="Не удалось загрузить каталог"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount === 0 ? (
        <EmptyState
          icon={Package}
          title="Пока нет продукции"
          description="Когда компании добавят и модераторы одобрят предложения, они появятся здесь."
        />
      ) : null}

      {!query.isLoading && !query.isError && query.totalCount > 0 && rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Ничего не найдено"
          description="Измените фильтры или поисковый запрос."
          actionLabel="Сбросить фильтры"
          onAction={resetFilters}
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="bg-card overflow-hidden rounded-lg border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[58%] px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                  Продукция
                </TableHead>
                <TableHead className="w-[32%] px-3 py-2 text-[11px] font-medium tracking-wide uppercase">
                  Компания
                </TableHead>
                <TableHead className="w-[10%] px-3 py-2 text-right text-[11px] font-medium tracking-wide uppercase">
                  Ссылка
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((product: CabinetCatalogProduct) => {
                const companyHref = companyTo?.(product.companyId)
                const productHref = productTo?.(product.companyId, product.id)
                const openProduct = () => {
                  if (productHref) navigate(productHref)
                }
                const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (!productHref) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(productHref)
                  }
                }

                return (
                  <TableRow
                    key={product.id}
                    id={`product-${product.id}`}
                    role={productHref ? 'link' : undefined}
                    tabIndex={productHref ? 0 : undefined}
                    onClick={openProduct}
                    onKeyDown={onRowKeyDown}
                    className={cn(
                      'scroll-mt-28',
                      productHref && 'hover:bg-muted/40 cursor-pointer',
                    )}
                  >
                    <TableCell className="px-3 py-2.5 align-middle">
                      <ProductIdentity
                        code={product.okpd_code}
                        title={product.okpd_title ?? product.name}
                        note={product.note_name}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-middle">
                      <div className="min-w-0">
                        <SoftLink
                          href={companyHref}
                          className="block truncate text-sm font-medium"
                        >
                          {product.companyName}
                        </SoftLink>
                        {product.participationLevelName ? (
                          <p className="text-muted-foreground truncate text-[11px]">
                            {product.participationLevelName}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 align-middle text-right">
                      {product.url ? (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-accent inline-flex size-8 items-center justify-center rounded-md border transition-colors"
                          title={product.url}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="size-3.5" />
                          <span className="sr-only">Открыть ссылку</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

export function adminProductsLinks() {
  return {
    companyTo: (companyId: string) => routes.admin.company(companyId),
    productTo: (_companyId: string, productId: string) => routes.admin.product(productId),
  }
}

export function cabinetProductsLinks() {
  return {
    companyTo: (companyId: string) => routes.cabinet.directoryCompany(companyId),
    productTo: (_companyId: string, productId: string) => routes.cabinet.product(productId),
  }
}
