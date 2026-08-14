import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  Building2,
  ChevronRight,
  Globe,
  Mail,
  MapPin,
  Phone,
  SearchX,
} from 'lucide-react'

import { routes } from '@shared/config'
import { cn } from '@shared/lib/utils'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Skeleton,
} from '@shared/ui'

import { useAssociationDirectory } from '../model/use-cabinet-company'
import type { DirectoryCompany, DirectoryRepresentative } from '@shared/api'

function DirectorySkeleton() {
  return (
    <div className="grid gap-2" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border px-4 py-3">
          <Skeleton className="mb-2 h-5 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="mt-2 h-3.5 w-2/3" />
        </div>
      ))}
    </div>
  )
}

function externalHref(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function ContactLine({
  icon: Icon,
  href,
  children,
}: {
  icon: typeof Phone
  href?: string | null
  children: string
}) {
  const content = (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1.5 text-xs transition-colors"
        {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
      >
        {content}
      </a>
    )
  }

  return (
    <span className="text-muted-foreground inline-flex max-w-full items-center gap-1.5 text-xs">
      {content}
    </span>
  )
}

function RepresentativeRow({ rep }: { rep: DirectoryRepresentative }) {
  const contacts = [rep.phone, rep.email].filter(Boolean)

  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-medium">{rep.full_name}</span>
        {rep.position ? (
          <span className="text-muted-foreground text-xs">{rep.position}</span>
        ) : null}
        {rep.is_primary ? (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
            основной
          </Badge>
        ) : null}
      </div>
      {contacts.length > 0 ? (
        <p className="text-muted-foreground mt-0.5 text-xs">{contacts.join(' · ')}</p>
      ) : null}
    </li>
  )
}

type CompanyCardProps = {
  company: DirectoryCompany
  expanded: boolean
  onToggle: () => void
}

function CompanyCard({ company, expanded, onToggle }: CompanyCardProps) {
  const website = externalHref(company.website)
  const panelId = `company-panel-${company.id}`

  return (
    <article
      id={`company-${company.id}`}
      className="bg-card scroll-mt-20 rounded-lg border"
    >
      <button
        type="button"
        className="hover:bg-muted/40 focus-visible:ring-ring flex w-full items-start gap-2 rounded-lg px-4 py-3 text-left transition-colors outline-none focus-visible:ring-2"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <ChevronRight
          className={cn(
            'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200',
            expanded && 'rotate-90',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{company.name}</h2>
            {company.participation_level_name ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                {company.participation_level_name}
              </Badge>
            ) : null}
          </div>
          {company.description ? (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{company.description}</p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div id={panelId} className="space-y-3 border-t px-4 pt-2 pb-3">
          {company.inn ? (
            <p className="text-muted-foreground text-xs">ИНН {company.inn}</p>
          ) : null}

          {[company.address, company.phone, company.email, company.website].some(Boolean) ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {company.address ? (
                <ContactLine key="address" icon={MapPin}>
                  {company.address}
                </ContactLine>
              ) : null}
              {company.phone ? (
                <ContactLine key="phone" icon={Phone} href={`tel:${company.phone}`}>
                  {company.phone}
                </ContactLine>
              ) : null}
              {company.email ? (
                <ContactLine key="email" icon={Mail} href={`mailto:${company.email}`}>
                  {company.email}
                </ContactLine>
              ) : null}
              {company.website && website ? (
                <ContactLine key="website" icon={Globe} href={website}>
                  {company.website}
                </ContactLine>
              ) : null}
            </div>
          ) : null}

          {company.representatives.length > 0 ? (
            <ul className="space-y-2.5 border-t pt-2.5">
              {company.representatives.map((rep) => (
                <RepresentativeRow key={rep.id} rep={rep} />
              ))}
            </ul>
          ) : null}

          {company.products.length > 0 ? (
            <div className="flex justify-end border-t pt-2">
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                <Link to={routes.cabinet.directoryCompany(company.id)}>
                  Продукция и услуги ({company.products.length})
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function resolveHighlightCompanyId(
  params: URLSearchParams,
  hash: string,
): string | null {
  const fromQuery = params.get('company')
  if (fromQuery) return fromQuery
  if (hash.startsWith('company-')) return hash.slice('company-'.length)
  return null
}

export function CabinetDirectoryPanel() {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [params] = useSearchParams()
  const location = useLocation()
  const query = useAssociationDirectory(search)
  useTargetHighlightFlash()

  useEffect(() => {
    const companyId = resolveHighlightCompanyId(params, location.hash.replace(/^#/, ''))
    if (!companyId) return
    setExpandedIds((current) => {
      if (current.has(companyId)) return current
      const next = new Set(current)
      next.add(companyId)
      return next
    })
  }, [params, location.hash])

  const toggleCompany = (companyId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(companyId)) next.delete(companyId)
      else next.add(companyId)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Участники ассоциации"
        description="Активные компании и представители. Нажмите на стрелку, чтобы раскрыть карточку."
      />

      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Поиск по компании или представителю…"
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
        <div className="grid gap-2">
          {query.items.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              expanded={expandedIds.has(company.id)}
              onToggle={() => toggleCompany(company.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
