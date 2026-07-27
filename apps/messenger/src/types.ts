export type ChatKind = 'channel' | 'group' | 'supergroup' | 'other'
export type MessageContentType = 'text' | 'photo' | 'video' | 'document' | 'other'
export type MessengerPlatform = 'telegram' | 'max'

export type UpsertBotChannelInput = {
  platform: MessengerPlatform
  externalChatId: string
  title?: string | null
  username?: string | null
  chatKind: ChatKind
  isActive: boolean
  lastSeenAt?: string | null
}

export type IngestMessageInput = {
  platform: MessengerPlatform
  externalChatId: string
  externalMessageId: string
  authorName?: string | null
  authorExternalId?: string | null
  text: string
  contentType: MessageContentType
  payload?: Record<string, unknown>
  sentAt: string
  isEdit?: boolean
}

export function contentPlaceholder(type: MessageContentType): string {
  switch (type) {
    case 'photo':
      return '[Фото]'
    case 'video':
      return '[Видео]'
    case 'document':
      return '[Документ]'
    case 'other':
      return '[Вложение]'
    default:
      return ''
  }
}

export function log(level: string, message: string, meta?: Record<string, unknown>) {
  const line = meta ? `${message} ${JSON.stringify(meta)}` : message
  if (level === 'error') console.error(`[messenger] ${line}`)
  else if (level === 'warn') console.warn(`[messenger] ${line}`)
  else console.info(`[messenger] ${line}`)
}
