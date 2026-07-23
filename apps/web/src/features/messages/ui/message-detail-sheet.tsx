import {
  Badge,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@shared/ui'
import type { Message } from '@shared/api'
import { messengerPlatformLabel } from '@features/messengers'

import {
  deliveryStatusLabel,
  formatMessageDate,
  messageSourceLabel,
  relayStatusLabel,
} from '../model/schemas'
import { useMessage } from '../model/use-messages'

type MessageDetailSheetProps = {
  messageId: string | null
  fallback?: Message | null
  onOpenChange: (open: boolean) => void
}

export function MessageDetailSheet({
  messageId,
  fallback,
  onOpenChange,
}: MessageDetailSheetProps) {
  const query = useMessage(messageId ?? undefined)
  const message = query.data ?? fallback

  return (
    <Sheet open={Boolean(messageId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Сообщение</SheetTitle>
          <SheetDescription>
            Источник, статус доставки и детали пересылки
          </SheetDescription>
        </SheetHeader>

        {message ? (
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{messageSourceLabel(message.source)}</Badge>
              <StatusBadge
                status={message.delivery_status}
                label={deliveryStatusLabel(message.delivery_status)}
              />
            </div>

            <div>
              <p className="text-muted-foreground">Рабочая группа</p>
              <p className="font-medium">{message.work_group?.name ?? '—'}</p>
            </div>

            <div>
              <p className="text-muted-foreground">Автор</p>
              <p className="font-medium">{message.author_name?.trim() || 'Без имени'}</p>
              {message.author_external_id ? (
                <p className="font-mono text-xs text-muted-foreground">
                  ID: {message.author_external_id}
                </p>
              ) : null}
            </div>

            <div>
              <p className="text-muted-foreground">Отправлено</p>
              <p className="font-medium">{formatMessageDate(message.sent_at)}</p>
            </div>

            <div>
              <p className="mb-1 text-muted-foreground">Текст</p>
              <p className="whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2">
                {message.text}
              </p>
            </div>

            <Separator />

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Внешний ID: {message.external_message_id}</p>
              <p>Чат: {message.external_chat_id}</p>
              <p>Сохранено: {formatMessageDate(message.created_at)}</p>
            </div>

            <div>
              <p className="mb-2 font-medium">Пересылки</p>
              {message.relays.length === 0 ? (
                <p className="text-muted-foreground">Релеев пока нет</p>
              ) : (
                <ul className="space-y-2">
                  {message.relays.map((relay) => (
                    <li
                      key={relay.id}
                      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          → {messengerPlatformLabel(relay.target_platform)}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {relay.target_chat_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMessageDate(relay.relayed_at)}
                        </p>
                      </div>
                      <StatusBadge
                        status={relay.status}
                        label={relayStatusLabel(relay.status)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>
        )}
      </SheetContent>
    </Sheet>
  )
}
