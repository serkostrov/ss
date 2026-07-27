import { z } from 'zod'

import type { BotStatus, MessengerPlatform } from '@shared/api'

export const messengerConnectionFormSchema = z.object({
  platform: z.enum(['telegram', 'max'] satisfies [MessengerPlatform, ...MessengerPlatform[]]),
  chatId: z
    .string({ required_error: 'Выберите канал' })
    .trim()
    .min(1, 'Выберите канал')
    .max(200, 'Слишком длинный идентификатор'),
  chatTitle: z.string().trim().max(300, 'Слишком длинное название').optional().or(z.literal('')),
})

export type MessengerConnectionFormValues = z.infer<typeof messengerConnectionFormSchema>

export function messengerPlatformLabel(platform: MessengerPlatform): string {
  return platform === 'telegram' ? 'Telegram' : 'Max'
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
