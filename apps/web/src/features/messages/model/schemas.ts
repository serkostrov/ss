import type { DeliveryStatus, MessageSource } from '@shared/api'

export function messageSourceLabel(source: MessageSource | 'all'): string {
  switch (source) {
    case 'telegram':
      return 'Telegram'
    case 'max':
      return 'Max'
    default:
      return 'Все источники'
  }
}

export function deliveryStatusLabel(status: DeliveryStatus | 'all'): string {
  switch (status) {
    case 'received':
      return 'Получено'
    case 'stored':
      return 'Сохранено'
    case 'relayed':
      return 'Переслано'
    case 'failed':
      return 'Сбой'
    default:
      return 'Все статусы'
  }
}

export function relayStatusLabel(status: 'pending' | 'sent' | 'failed'): string {
  switch (status) {
    case 'pending':
      return 'Ожидает'
    case 'sent':
      return 'Отправлено'
    case 'failed':
      return 'Сбой'
  }
}

export function formatMessageDate(value: string | null | undefined): string {
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

export function truncateMessageText(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}
