import { z } from 'zod'

import type { BotStatus, MessengerChatKind, MessengerPlatform } from '@shared/api'

export const messengerConnectionFormSchema = z.object({
  platform: z.enum(['telegram', 'max'] satisfies [MessengerPlatform, ...MessengerPlatform[]]),
  chatId: z
    .string({ required_error: 'Выберите чат' })
    .trim()
    .min(1, 'Выберите чат')
    .max(200, 'Слишком длинный идентификатор')
    .refine((value) => value !== '0', 'Некорректный чат Max (id 0). Выберите ЛС или группу заново'),
  chatTitle: z.string().trim().max(300, 'Слишком длинное название').optional().or(z.literal('')),
})

export type MessengerConnectionFormValues = z.infer<typeof messengerConnectionFormSchema>

export function messengerPlatformLabel(platform: MessengerPlatform): string {
  return platform === 'telegram' ? 'Telegram' : 'Max'
}

export function messengerChatKindLabel(
  kind: MessengerChatKind | string | null | undefined,
): string {
  switch (kind) {
    case 'channel':
      return 'Канал'
    case 'group':
      return 'Группа'
    case 'supergroup':
      return 'Супергруппа'
    case 'private':
      return 'Личные'
    default:
      return 'Чат'
  }
}

export function botStatusLabel(status: BotStatus): string {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'connected':
      return 'Подключено'
    case 'error':
      return 'Ошибка'
  }
}

export function formatMessengerDate(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

/** Best-effort “last update” from available timestamps. */
export function connectionLastUpdate(connection: {
  connected_at: string | null
  created_at: string
}): string {
  return connection.connected_at ?? connection.created_at
}

/** Radix Select forbids item values that start with `-` (Telegram group/channel ids). */
const CHAT_SELECT_PREFIX = 'chat:'

export function toMessengerChatSelectValue(chatId: string): string {
  return `${CHAT_SELECT_PREFIX}${chatId}`
}

export function fromMessengerChatSelectValue(value: string): string {
  return value.startsWith(CHAT_SELECT_PREFIX) ? value.slice(CHAT_SELECT_PREFIX.length) : value
}
