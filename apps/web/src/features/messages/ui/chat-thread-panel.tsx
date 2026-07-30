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
import { useChatMessagesRealtime } from '../model/use-messages-realtime'
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

function AttachmentBlock({ type, outbound }: { type: MessageContentType; outbound?: boolean }) {
  if (type === 'text') return null
  const Icon = type === 'photo' ? ImageIcon : type === 'video' ? Video : FileText
  return (
    <div
      className={cn(
        'mb-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium',
        outbound
          ? 'bg-primary-foreground/15 text-primary-foreground/90'
          : 'bg-muted/80 text-muted-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{messageContentTypeLabel(type)}</span>
    </div>
  )
}

function authorInitial(name: string | null | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

function isOutboundMessage(message: Message): boolean {
  return Boolean(
    message.payload &&
    typeof message.payload === 'object' &&
    !Array.isArray(message.payload) &&
    (message.payload as { outbound?: boolean }).outbound,
  )
}

function MessageBubble({ message, compactTop }: { message: Message; compactTop?: boolean }) {
  const isOutbound = isOutboundMessage(message)
  const hasMedia = message.content_type !== 'text'
  const textLooksLikePlaceholder = /^\[.+\]$/.test(message.text.trim())
  const showText = Boolean(message.text && !(hasMedia && textLooksLikePlaceholder))
  const showAuthor = Boolean(message.author_name && !isOutbound && !compactTop)

  return (
    <div
      className={cn(
        'flex max-w-[min(92%,22rem)] gap-2 sm:max-w-[min(85%,26rem)]',
        isOutbound ? 'ml-auto flex-row-reverse' : 'mr-auto',
      )}
    >
      {!isOutbound ? (
        <div
          className={cn(
            'mt-auto flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            compactTop ? 'invisible' : 'bg-muted text-muted-foreground ring-border/60 ring-1',
          )}
          aria-hidden={compactTop}
        >
          {authorInitial(message.author_name)}
        </div>
      ) : null}

      <article
        className={cn(
          'w-fit min-w-0 rounded-2xl px-3 py-2 text-sm shadow-xs',
          isOutbound
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-card text-card-foreground ring-border/70 rounded-bl-md ring-1',
        )}
      >
        {showAuthor ? (
          <p className="text-primary mb-0.5 truncate text-[11px] font-semibold tracking-wide">
            {message.author_name}
          </p>
        ) : null}

        {hasMedia ? <AttachmentBlock type={message.content_type} outbound={isOutbound} /> : null}

        {showText ? (
          <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <p className="min-w-0 flex-1 leading-relaxed break-words whitespace-pre-wrap">
              {message.text}
            </p>
            <time
              dateTime={message.sent_at}
              className={cn(
                'ml-auto shrink-0 self-end pb-px text-[10px] leading-none tabular-nums',
                isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {formatMessageTime(message.sent_at)}
            </time>
          </div>
        ) : (
          <div className="flex justify-end">
            <time
              dateTime={message.sent_at}
              className={cn(
                'text-[10px] leading-none tabular-nums',
                isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground',
              )}
            >
              {formatMessageTime(message.sent_at)}
            </time>
          </div>
        )}
      </article>
    </div>
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
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    setChunks(1)
    stickToBottomRef.current = true
  }, [workGroupId, source, externalChatId])

  const pageSize = Math.min(100, chunks * PAGE_CHUNK)
  const query = useMessages({
    workGroupId,
    source,
    externalChatId,
    page: 1,
    pageSize,
  })

  useChatMessagesRealtime({
    workGroupId,
    source,
    externalChatId,
    enabled: Boolean(workGroupId && externalChatId),
  })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const dayGroups = useMemo(() => groupByDay(items), [items])
  const hasMore = items.length < total && pageSize < 100

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || query.isFetching) return
    if (!stickToBottomRef.current) return
    scroller.scrollTop = scroller.scrollHeight
  }, [items.length, query.isFetching, externalChatId, query.dataUpdatedAt])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {!hideHeader ? (
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{channelTitle?.trim() || 'Чат'}</p>
            <p className="text-muted-foreground text-xs">{messageSourceLabel(source)}</p>
          </div>
          <Badge variant="secondary" className="font-normal">
            {total} сообщ.
          </Badge>
        </header>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={() => {
          const scroller = scrollerRef.current
          if (!scroller) return
          const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
          stickToBottomRef.current = distance < 96
        }}
        className={cn(
          'bg-muted/20 min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4',
          !query.isLoading && !query.isError && items.length === 0 && 'flex',
        )}
      >
        {query.isLoading && !query.data ? <LoadingState label="Загрузка сообщений…" /> : null}

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

        <div className="space-y-5">
          {dayGroups.map((group) => (
            <section key={group.key} className="space-y-1">
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="bg-background/95 text-muted-foreground ring-border/50 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 backdrop-blur">
                  {group.label}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map((message, index) => {
                  const prev = group.items[index - 1]
                  const compactTop = Boolean(
                    prev &&
                    !isOutboundMessage(message) &&
                    !isOutboundMessage(prev) &&
                    (prev.author_external_id || prev.author_name) &&
                    (prev.author_external_id ?? prev.author_name) ===
                      (message.author_external_id ?? message.author_name),
                  )
                  return (
                    <MessageBubble key={message.id} message={message} compactTop={compactTop} />
                  )
                })}
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
          onSent={() => {
            stickToBottomRef.current = true
            void query.refetch()
          }}
        />
      ) : null}
    </div>
  )
}
