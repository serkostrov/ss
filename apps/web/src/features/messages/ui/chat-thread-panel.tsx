import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImageIcon, Video } from 'lucide-react'

import type { Message, MessageContentType, MessageSource } from '@shared/api'
import { Badge, Button, EmptyState, ErrorState, LoadingState, Spinner } from '@shared/ui'
import { cn } from '@shared/lib/utils'

import {
  dayKey,
  formatMessageDay,
  formatMessageTime,
  messageContentTypeLabel,
  messageSourceLabel,
} from '../model/schemas'
import { useMessages } from '../model/use-messages'
import { ChatComposer } from './chat-composer'

type ChatThreadPanelProps = {
  workGroupId: string
  source: MessageSource
  externalChatId: string
  channelTitle?: string | null
  className?: string
  /** When true, omit the built-in header (parent provides chrome). */
  hideHeader?: boolean
  /** Show message composer at the bottom (admin outbound). */
  showComposer?: boolean
}

type DayGroup = {
  key: string
  label: string
  items: Message[]
}

const PAGE_CHUNK = 50

function groupByDay(items: Message[]): DayGroup[] {
  const chronological = [...items].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
  )
  const map = new Map<string, DayGroup>()
  for (const item of chronological) {
    const key = dayKey(item.sent_at)
    const existing = map.get(key)
    if (existing) existing.items.push(item)
    else map.set(key, { key, label: formatMessageDay(item.sent_at), items: [item] })
  }
  return [...map.values()]
}

function AttachmentBlock({ type }: { type: MessageContentType }) {
  if (type === 'text') return null
  const Icon = type === 'photo' ? ImageIcon : type === 'video' ? Video : FileText
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed bg-background/60 px-3 py-2 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      <span>{messageContentTypeLabel(type)}</span>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = Boolean(
    message.payload &&
      typeof message.payload === 'object' &&
      !Array.isArray(message.payload) &&
      (message.payload as { outbound?: boolean }).outbound,
  )
  const isTelegram = message.source === 'telegram'
  const hasMedia = message.content_type !== 'text'
  const textLooksLikePlaceholder = /^\[.+\]$/.test(message.text.trim())

  return (
    <article
      className={cn(
        'max-w-[min(100%,28rem)] rounded-2xl px-3.5 py-2.5 shadow-sm',
        isOutbound
          ? 'ml-auto rounded-br-md bg-primary text-primary-foreground'
          : isTelegram
            ? 'rounded-bl-md bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-50'
            : 'rounded-bl-md bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-50',
      )}
    >
      {message.author_name ? (
        <p className={cn('mb-1 text-xs font-semibold', isOutbound ? 'opacity-90' : 'opacity-80')}>
          {message.author_name}
        </p>
      ) : null}
      {hasMedia ? <AttachmentBlock type={message.content_type} /> : null}
      {message.text && !(hasMedia && textLooksLikePlaceholder) ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
      ) : null}
      <div className="mt-1 flex items-center justify-end gap-2">
        <span className={cn('text-[10px] tabular-nums', isOutbound ? 'opacity-80' : 'opacity-60')}>
          {formatMessageTime(message.sent_at)}
        </span>
      </div>
    </article>
  )
}

export function ChatThreadPanel({
  workGroupId,
  source,
  externalChatId,
  channelTitle,
  className,
  hideHeader = false,
  showComposer = true,
}: ChatThreadPanelProps) {
  const [chunks, setChunks] = useState(1)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setChunks(1)
  }, [workGroupId, source, externalChatId])

  const pageSize = Math.min(100, chunks * PAGE_CHUNK)
  const query = useMessages({
    workGroupId,
    source,
    externalChatId,
    page: 1,
    pageSize,
  })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const dayGroups = useMemo(() => groupByDay(items), [items])
  const hasMore = items.length < total && pageSize < 100

  useEffect(() => {
    if (!query.isFetching) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [items.length, query.isFetching, externalChatId])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {!hideHeader ? (
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{channelTitle?.trim() || 'Чат'}</p>
            <p className="text-xs text-muted-foreground">{messageSourceLabel(source)}</p>
          </div>
          <Badge variant="secondary" className="font-normal">
            {total} сообщ.
          </Badge>
        </header>
      ) : null}

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto bg-muted/20 px-3 py-4 sm:px-4',
          !query.isLoading && !query.isError && items.length === 0 && 'flex',
        )}
      >
        {query.isLoading && !query.data ? (
          <LoadingState label="Загрузка сообщений…" />
        ) : null}

        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : null}

        {!query.isLoading && !query.isError && items.length === 0 ? (
          <EmptyState
            title="Пока нет сообщений"
            className="m-auto border-0 bg-transparent py-0 shadow-none"
          />
        ) : null}

        {hasMore ? (
          <div className="mb-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => setChunks((prev) => prev + 1)}
            >
              {query.isFetching ? <Spinner size="sm" /> : null}
              Ранее
            </Button>
          </div>
        ) : null}

        <div className="space-y-6">
          {dayGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex justify-center">
                <span className="rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {showComposer ? (
        <ChatComposer
          workGroupId={workGroupId}
          platform={source}
          chatId={externalChatId}
          onSent={() => void query.refetch()}
        />
      ) : null}
    </div>
  )
}
