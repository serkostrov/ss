import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCheck,
  ChevronRight,
  Mail,
  PackageCheck,
  PackageX,
  Receipt,
  ReceiptText,
} from 'lucide-react'

import { useAuth } from '@app/providers'
import type { AppNotification, NotificationType } from '@shared/api'
import { appConfig } from '@shared/config'
import { cn } from '@shared/lib/utils'
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Switch,
} from '@shared/ui'

import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotifications,
  useSetEmailNotificationsMutation,
} from '../model/use-notifications'

type Filter = 'all' | 'unread'

const TYPE_META: Record<
  NotificationType,
  { label: string; icon: typeof Receipt; tone: string }
> = {
  invoice_issued: {
    label: 'Счёт',
    icon: Receipt,
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  invoice_paid: {
    label: 'Оплата',
    icon: ReceiptText,
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  product_approved: {
    label: 'Продукция',
    icon: PackageCheck,
    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
  product_rejected: {
    label: 'Продукция',
    icon: PackageX,
    tone: 'bg-destructive/10 text-destructive',
  },
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat(appConfig.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-xl border px-3 py-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CabinetNotificationsPanel() {
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const query = useNotifications(false)
  const markRead = useMarkNotificationReadMutation()
  const markAll = useMarkAllNotificationsReadMutation()
  const emailToggle = useSetEmailNotificationsMutation(() => refreshProfile())
  const emailEnabled = profile?.emailNotificationsEnabled !== false

  const items = useMemo(() => {
    const rows = query.data ?? []
    if (filter === 'unread') return rows.filter((row) => row.read_at == null)
    return rows
  }, [filter, query.data])

  const unreadCount = (query.data ?? []).filter((row) => row.read_at == null).length

  const openNotification = async (item: AppNotification) => {
    if (!item.read_at) {
      try {
        await markRead.mutateAsync(item.id)
      } catch {
        // Error toast is handled in the mutation.
      }
    }
    if (item.link) {
      navigate(item.link)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Уведомления"
        description="События по вашей компании: счета, модерация продукции и другое."
        actions={
          unreadCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {markAll.isPending ? <Spinner size="sm" className="text-current" /> : <CheckCheck className="size-4" />}
              Прочитать все
            </Button>
          ) : null
        }
      />

      <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Mail className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Уведомления на email</p>
            <p className="text-muted-foreground text-xs leading-snug">
              Дублировать события на {profile?.email || 'вашу почту'}.
            </p>
          </div>
        </div>
        <Switch
          checked={emailEnabled}
          disabled={emailToggle.isPending}
          onCheckedChange={(checked) => emailToggle.mutate(checked)}
          aria-label="Уведомления на email"
        />
      </div>

      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <SelectTrigger className="w-45">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="unread">Непрочитанные</SelectItem>
          </SelectContent>
        </Select>
        {unreadCount > 0 ? (
          <p className="text-muted-foreground text-sm">Непрочитанных: {unreadCount}</p>
        ) : null}
      </div>

      {query.isLoading && !query.data ? <NotificationsSkeleton /> : null}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState
          title={filter === 'unread' ? 'Нет непрочитанных' : 'Уведомлений пока нет'}
          description={
            filter === 'unread'
              ? 'Все уведомления уже прочитаны.'
              : 'Когда администратор выставит счёт или рассмотрит продукцию, здесь появится запись.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const meta = TYPE_META[item.type]
            const Icon = meta.icon
            const unread = item.read_at == null
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'hover:bg-muted/40 flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                    unread && 'border-primary/25 bg-primary/3',
                  )}
                  onClick={() => void openNotification(item)}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      meta.tone,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm font-medium', unread && 'font-semibold')}>
                        {item.title}
                      </span>
                      {unread ? (
                        <span className="bg-primary size-1.5 rounded-full" aria-label="Непрочитано" />
                      ) : null}
                      <span className="text-muted-foreground text-xs">{meta.label}</span>
                    </span>
                    {item.body ? (
                      <span className="text-muted-foreground mt-0.5 block text-sm">{item.body}</span>
                    ) : null}
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {formatNotificationDate(item.created_at)}
                    </span>
                  </span>
                  {item.link ? (
                    <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
