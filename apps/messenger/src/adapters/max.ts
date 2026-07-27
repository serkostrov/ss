import type { DbClient } from '../db.js'
import { markBotChannelInactive, upsertBotChannel } from '../pipeline/channels.js'
import { ingestChannelMessage } from '../pipeline/ingest.js'
import {
  contentPlaceholder,
  log,
  type ChatKind,
  type MessageContentType,
} from '../types.js'

type MaxUser = {
  user_id?: number
  name?: string
  username?: string
  first_name?: string
  last_name?: string
}

type MaxChat = {
  chat_id?: number
  type?: string
  title?: string
  link?: string
}

type MaxAttachment = {
  type?: string
}

type MaxMessageBody = {
  mid?: string
  text?: string
  attachments?: MaxAttachment[]
}

type MaxMessage = {
  sender?: MaxUser
  recipient?: {
    chat_id?: number
    chat_type?: string
  }
  timestamp?: number
  body?: MaxMessageBody
  link?: unknown
}

export type MaxUpdate = {
  update_type?: string
  timestamp?: number
  chat_id?: number
  user?: MaxUser
  message?: MaxMessage
  chat?: MaxChat
}

function mapChatKind(type: string | undefined): ChatKind {
  const normalized = (type ?? '').toLowerCase()
  if (normalized === 'channel') return 'channel'
  if (normalized === 'chat' || normalized === 'group') return 'group'
  if (normalized === 'supergroup') return 'supergroup'
  if (
    normalized === 'dialog' ||
    normalized === 'private' ||
    normalized === 'user' ||
    normalized === 'dm'
  ) {
    return 'private'
  }
  return 'other'
}

function detectContentType(message: MaxMessage): MessageContentType {
  const attachments = message.body?.attachments ?? []
  const types = attachments.map((item) => (item.type ?? '').toLowerCase())
  if (types.some((t) => t.includes('image') || t === 'photo')) return 'photo'
  if (types.some((t) => t.includes('video'))) return 'video'
  if (types.some((t) => t.includes('file') || t === 'document')) return 'document'
  if ((message.body?.text ?? '').trim()) return 'text'
  if (attachments.length) return 'other'
  return 'text'
}

function resolveText(message: MaxMessage, contentType: MessageContentType): string {
  const body = (message.body?.text ?? '').trim()
  if (body) return body
  return contentPlaceholder(contentType) || '[Сообщение]'
}

function resolveAuthor(message: MaxMessage): { name: string | null; externalId: string | null } {
  const sender = message.sender
  if (!sender) return { name: null, externalId: null }
  const name =
    sender.name ||
    [sender.first_name, sender.last_name].filter(Boolean).join(' ') ||
    sender.username ||
    null
  return {
    name,
    externalId: sender.user_id != null ? String(sender.user_id) : null,
  }
}

function chatIdFromUpdate(update: MaxUpdate): string | null {
  const fromMessage = update.message?.recipient?.chat_id
  if (fromMessage != null) return String(fromMessage)
  if (update.chat_id != null) return String(update.chat_id)
  if (update.chat?.chat_id != null) return String(update.chat.chat_id)
  return null
}

function chatTypeFromUpdate(update: MaxUpdate): string | undefined {
  return update.message?.recipient?.chat_type ?? update.chat?.type
}

async function handleBotMembership(
  db: DbClient,
  update: MaxUpdate,
  isActive: boolean,
): Promise<void> {
  const chatId = chatIdFromUpdate(update)
  if (!chatId) return

  const kind = mapChatKind(chatTypeFromUpdate(update))
  if (!isActive) {
    await markBotChannelInactive(db, 'max', chatId)
    log('info', 'Max bot membership', { chatId, kind, isActive: false })
    return
  }

  await upsertBotChannel(db, {
    platform: 'max',
    externalChatId: chatId,
    title: update.chat?.title ?? update.user?.name ?? update.user?.username ?? null,
    username: update.user?.username ?? null,
    chatKind: kind,
    isActive: true,
  })

  log('info', 'Max bot membership', { chatId, kind, isActive: true })
}

async function handleMessageCreated(db: DbClient, update: MaxUpdate, isEdit: boolean): Promise<void> {
  const message = update.message
  if (!message) return

  const chatId = chatIdFromUpdate(update)
  if (!chatId) return

  const kind = mapChatKind(chatTypeFromUpdate(update))
  const title =
    update.chat?.title ??
    message.sender?.name ??
    message.sender?.username ??
    null

  await upsertBotChannel(db, {
    platform: 'max',
    externalChatId: chatId,
    title,
    username: message.sender?.username ?? null,
    chatKind: kind,
    isActive: true,
  })

  const mid = message.body?.mid
  if (!mid) {
    log('warn', 'Max message without mid', { chatId })
    return
  }

  const contentType = detectContentType(message)
  const author = resolveAuthor(message)
  const sentAtMs = message.timestamp ?? update.timestamp ?? Date.now()

  const result = await ingestChannelMessage(db, {
    platform: 'max',
    externalChatId: chatId,
    externalMessageId: mid,
    authorName: author.name,
    authorExternalId: author.externalId,
    text: resolveText(message, contentType),
    contentType,
    payload: {
      max: {
        chat_kind: kind,
        attachment_types: (message.body?.attachments ?? []).map((item) => item.type ?? null),
      },
    },
    sentAt: new Date(sentAtMs).toISOString(),
    isEdit,
  })

  log('info', 'Max message processed', { chatId, kind, mid, result, isEdit })
}

export async function handleMaxUpdate(db: DbClient, update: MaxUpdate): Promise<void> {
  const type = (update.update_type ?? '').toLowerCase()

  if (type === 'bot_added' || type === 'bot_started') {
    await handleBotMembership(db, update, true)
    return
  }
  if (type === 'bot_removed' || type === 'bot_stopped') {
    await handleBotMembership(db, update, false)
    return
  }
  if (type === 'message_created') {
    await handleMessageCreated(db, update, false)
    return
  }
  if (type === 'message_edited') {
    await handleMessageCreated(db, update, true)
  }
}

export async function registerMaxWebhook(
  token: string,
  baseUrl: string,
  secret: string | null,
): Promise<void> {
  const url = `${baseUrl}/webhooks/max`
  const body: Record<string, unknown> = {
    url,
    update_types: [
      'message_created',
      'message_edited',
      'bot_added',
      'bot_removed',
      'bot_started',
      'bot_stopped',
    ],
  }
  if (secret) body.secret = secret

  // Max expects the raw access token in Authorization — not "Bearer …".
  // Prefer platform-api2.max.ru (platform-api.max.ru is being retired).
  const accessToken = token.replace(/^Bearer\s+/i, '').trim()
  const insecure = process.env.MAX_TLS_INSECURE === '1'
  const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    log('warn', 'MAX_TLS_INSECURE=1 — TLS verification disabled for Max API')
  }

  let response: Response
  try {
    response = await fetch('https://platform-api2.max.ru/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } finally {
    if (insecure) {
      if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls
    }
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Max subscriptions failed: ${response.status} ${text}`)
  }

  log('info', 'Max webhook registered', { url })
}
