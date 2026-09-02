import { useEffect, useMemo, useState } from 'react'

import type { Message, MessageSource } from '@shared/api'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Filters,
  LoadingState,
  PageHeader,
  type FilterFieldConfig,
} from '@shared/ui'
import { cn } from '@shared/lib/utils'

import {
  crmDisplayText,
  dayKey,
  formatMessageDay,
  formatMessageTime,
  messageContentTypeLabel,
  messageSourceLabel,
} from '../model/schemas'
import { useMessages, useWorkGroupsForMessageFilter } from '../model/use-messages'

type MessagesFeedPanelProps = {
  workGroupId?: string
  lockedSource?: MessageSource
  title?: string
  description?: string
  showPageHeader?: boolean
  hideGroupFilter?: boolean
}

type DayGroup = {
  key: string
  label: string
  items: Message[]
}

const PAGE_CHUNK = 40

function groupByDay(items: Message[]): DayGroup[] {
  const chronological = [...items].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
  )
  const map = new Map<string, DayGroup>()
  for (const item of chronological) {
    const key = dayKey(item.sent_at)
    const existing = map.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      map.set(key, { key, label: formatMessageDay(item.sent_at), items: [item] })
    }
  }
  return [...map.values()]
}

function MessageBubble({ message, showGroup }: { message: Message; showGroup: boolean }) {
  const isTelegram = message.source === 'telegram'
  const showAttachmentChip = message.content_type !== 'text'

  return (
    <article
      className={cn(
        'max-w-[min(100%,36rem)] rounded-2xl border px-4 py-3 shadow-sm',
        isTelegram
          ? 'border-sky-200/80 bg-sky-50/80 dark:border-sky-900/50 dark:bg-sky-950/30'
          : 'border-violet-200/80 bg-violet-50/80 dark:border-violet-900/50 dark:bg-violet-950/30',
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-normal">
          {messageSourceLabel(message.source)}
        </Badge>
        {showAttachmentChip ? (
          <Badge variant="outline" className="font-normal">
            {messageContentTypeLabel(message.content_type)}
          </Badge>
        ) : null}
        {showGroup && message.work_group?.name ? (
          <span className="text-muted-foreground text-xs">{message.work_group.name}</span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {formatMessageTime(message.sent_at)}
        </span>
      </div>
      {message.author_name ? (
        <p className="text-foreground/90 mb-1 text-sm font-medium">{message.author_name}</p>
      ) : null}
      <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
        {crmDisplayText(message.text, message.author_name)}
      </p>
    </article>
  )
}

export function MessagesFeedPanel({
  workGroupId,
  lockedSource,
  title = 'Лента сообщений',
  description = 'Посты из привязанных каналов Telegram и Max.',
  showPageHeader = true,
  hideGroupFilter = false,
}: MessagesFeedPanelProps) {
  const [source, setSource] = useState<MessageSource | 'all'>(lockedSource ?? 'all')
  const [groupFilter, setGroupFilter] = useState<string>(workGroupId ?? 'all')
  const [chunks, setChunks] = useState(1)

  const groupsQuery = useWorkGroupsForMessageFilter()

  useEffect(() => {
    setChunks(1)
  }, [source, groupFilter, workGroupId, lockedSource])

  useEffect(() => {
    if (workGroupId) setGroupFilter(workGroupId)
  }, [workGroupId])

  useEffect(() => {
    if (lockedSource) setSource(lockedSource)
  }, [lockedSource])

  const pageSize = Math.min(100, chunks * PAGE_CHUNK)

  const query = useMessages(
    {
      workGroupId: workGroupId ?? groupFilter,
      source: lockedSource ?? source,
      page: 1,
      pageSize,
    },
    { live: true },
  )

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const dayGroups = useMemo(() => groupByDay(items), [items])
  const showGroup = !workGroupId && groupFilter === 'all'
  const hasMore = items.length < total && pageSize < 100

  const filterFields = useMemo<FilterFieldConfig[]>(() => {
    const fields: FilterFieldConfig[] = []

    if (!hideGroupFilter && !workGroupId) {
      fields.push({
        id: 'group',
        type: 'select',
        label: 'Группа',
        value: groupFilter,
        onChange: setGroupFilter,
        options: [
          { value: 'all', label: 'Все группы' },
          ...(groupsQuery.data ?? []).map((group) => ({
            value: group.id,
            label: group.name,
          })),
        ],
      })
    }

    if (!lockedSource) {
      fields.push({
        id: 'source',
        type: 'select',
        label: 'Источник',
        value: source,
        onChange: (value) => setSource(value as MessageSource | 'all'),
        options: [
          { value: 'all', label: 'Все источники' },
          { value: 'telegram', label: 'Telegram' },
          { value: 'max', label: 'Max' },
        ],
      })
    }

    return fields
  }, [hideGroupFilter, workGroupId, groupFilter, groupsQuery.data, lockedSource, source])

  return (
    <div className="space-y-4">
      {showPageHeader ? <PageHeader title={title} description={description} /> : null}

      {filterFields.length > 0 ? <Filters fields={filterFields} /> : null}

      {query.isLoading && !query.data ? <LoadingState label="Загрузка ленты…" /> : null}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <EmptyState
          title="Постов пока нет"
          description="Когда worker получит сообщения из привязанного канала, они появятся здесь."
        />
      ) : null}

      {dayGroups.length > 0 ? (
        <div className="space-y-8">
          {dayGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {group.label}
                </p>
                <div className="bg-border h-px flex-1" />
              </div>
              <div className="flex flex-col gap-3">
                {group.items.map((message) => (
                  <MessageBubble key={message.id} message={message} showGroup={showGroup} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => setChunks((prev) => prev + 1)}
          >
            {query.isFetching ? 'Загрузка…' : 'Ещё сообщения'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
