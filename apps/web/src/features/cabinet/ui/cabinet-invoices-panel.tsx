import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Paperclip } from 'lucide-react'

import { useAuth } from '@app/providers'
import {
  formatInvoiceAmount,
  formatInvoiceDate,
  useCabinetInvoices,
} from '@features/invoices'
import { useClearNavNotificationBadges } from '@features/notifications'
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

type CabinetInvoiceFilter = 'issued' | 'paid' | 'all'

function InvoicesSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border" aria-hidden>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-32 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

export function CabinetInvoicesPanel() {
  const { profile } = useAuth()
  const companyId = profile?.membership?.companyId
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CabinetInvoiceFilter>('issued')
  const query = useCabinetInvoices(companyId)
  useClearNavNotificationBadges('invoices', Boolean(companyId))

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (query.data ?? []).filter((invoice) => {
      if (filter !== 'all' && invoice.status !== filter) return false
      if (!needle) return true
      return [invoice.number, invoice.title, invoice.file_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [filter, query.data, search])

  if (!companyId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Счета на оплату" description="Счета вашей компании." />
        <EmptyState
          title="Компания не привязана"
          description="Профиль не связан с компанией. Обратитесь к администратору АПСС."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Счета на оплату" description="Счета, выставленные администратором." />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Номер или название…"
          className="sm:max-w-xs"
        />
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as CabinetInvoiceFilter)}
        >
          <SelectTrigger className="h-9 sm:w-40" aria-label="Фильтр счетов">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="issued">К оплате</SelectItem>
            <SelectItem value="paid">Оплаченные</SelectItem>
            <SelectItem value="all">Все</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? <InvoicesSkeleton /> : null}
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState
          title={filter === 'issued' ? 'Нет счетов к оплате' : 'Счетов нет'}
          description={
            filter === 'issued'
              ? 'Когда администратор выставит счёт, он появится здесь.'
              : 'Измените фильтр или дождитесь новых счетов.'
          }
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y">
            {items.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to={routes.cabinet.invoice(invoice.id)}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium tabular-nums">{invoice.number}</span>
                      <StatusBadge
                        status={invoice.status}
                        className="h-5 px-1.5 text-[10px]"
                      />
                      {invoice.file_url ? (
                        <Paperclip className="size-3 text-muted-foreground" aria-label="Есть файл" />
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {invoice.title}
                      <span className="mx-1.5 text-muted-foreground/50">·</span>
                      {formatInvoiceDate(invoice.issued_at)}
                      {invoice.due_date ? (
                        <>
                          <span className="mx-1.5 text-muted-foreground/50">·</span>
                          до {formatInvoiceDate(invoice.due_date)}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatInvoiceAmount(invoice.amount, invoice.currency)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
