import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Phone,
  SearchX,
} from 'lucide-react'

import { routes } from '@shared/config'
import { useTargetHighlightFlash } from '@shared/lib/use-target-highlight-flash'
import {
  Badge,
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

function ContactLine({ icon: Icon, children }: { icon: typeof Phone; children: string }) {
  return (
    <span className="text-muted-foreground inline-flex max-w-full items-center gap-1.5 text-xs">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

function RepresentativeRow({ rep }: { rep: DirectoryRepresentative }) {
  const contacts = [
    rep.phone,
    rep.email,
    rep.telegram_username ? `TG @${rep.telegram_username}` : null,
    rep.max_username ? `Max @${rep.max_username}` : null,
  ].filter(Boolean)

  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-medium">{rep.full_name}</span>
        {rep.is_primary ? (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
            основной
          </Badge>
        ) : null}
        {rep.position ? (
          <span className="text-muted-foreground text-xs">{rep.position}</span>
        ) : null}
      </div>
      {contacts.length > 0 ? (
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{contacts.join(' · ')}</p>
      ) : null}
    </li>
  )
}

function CompanyCard({ company }: { company: DirectoryCompany }) {
  const contacts = [
    company.address ? (
      <ContactLine key="address" icon={MapPin}>
        {company.address}
      </ContactLine>
    ) : null,
    company.phone ? (
      <ContactLine key="phone" icon={Phone}>
        {company.phone}
      </ContactLine>
    ) : null,
    company.email ? (
      <ContactLine key="email" icon={Mail}>
        {company.email}
      </ContactLine>
    ) : null,
    company.website ? (
      <ContactLine key="website" icon={Globe}>
        {company.website}
      </ContactLine>
    ) : null,
  ].filter(Boolean)

  return (
    <Link
      id={`company-${company.id}`}
      to={routes.cabinet.directoryCompany(company.id)}
      className="bg-card hover:bg-muted/40 focus-visible:ring-ring block scroll-mt-20 rounded-lg border px-4 py-3 transition-colors outline-none focus-visible:ring-2"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{company.name}</h2>
          {company.participation_level_name ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {company.participation_level_name}
            </Badge>
          ) : null}
        </div>
        {company.inn ? (
          <p className="text-muted-foreground mt-0.5 text-xs">ИНН {company.inn}</p>
        ) : null}
      </div>

      {company.description ? (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-relaxed">
          {company.description}
        </p>
      ) : null}

      {contacts.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">{contacts}</div>
      ) : null}

      {company.representatives.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t pt-2.5">
          {company.representatives.map((rep) => (
            <RepresentativeRow key={rep.id} rep={rep} />
          ))}
        </ul>
      ) : null}
    </Link>
  )
}

export function CabinetDirectoryPanel() {
  const [search, setSearch] = useState('')
  const query = useAssociationDirectory(search)
  useTargetHighlightFlash()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Участники ассоциации"
        description="Активные компании и представители."
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
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
