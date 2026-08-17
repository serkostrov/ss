import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { markBotChannelInactive, upsertBotChannel } from '../pipeline/channels.js'
import { ingestChannelMessage } from '../pipeline/ingest.js'
import { relaySiblingChats, retryUndeliveredRelaysForWorkGroup } from '../pipeline/relay.js'
import {
  contentPlaceholder,
  log,
  type ChatKind,
  type MessageContentType,
} from '../types.js'

type TelegramChat = {
  id: number
  type: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

type TelegramMessage = {
  message_id: number
  date: number
  chat: TelegramChat
  text?: string
  caption?: string
  photo?: unknown[]
  video?: unknown
  document?: unknown
  animation?: unknown
  voice?: unknown
  audio?: unknown
  sticker?: unknown
  author_signature?: string
  sender_chat?: TelegramChat
  from?: TelegramUser
  edit_date?: number
}

type TelegramChatMemberUpdated = {
  chat: TelegramChat
  new_chat_member: {
    status: string
    user: TelegramUser
  }
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
  my_chat_member?: TelegramChatMemberUpdated
}

function mapChatKind(type: string): ChatKind {
  if (type === 'channel') return 'channel'
  if (type === 'group') return 'group'
  if (type === 'supergroup') return 'supergroup'
  if (type === 'private') return 'private'
  return 'other'
}

function chatTitle(chat: TelegramChat): string | null {
  if (chat.title?.trim()) return chat.title.trim()
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim()
  if (name) return name
  if (chat.username?.trim()) return `@${chat.username.trim()}`
  return null
}

function detectContentType(message: TelegramMessage): MessageContentType {
  if (message.photo?.length) return 'photo'
  if (message.video || message.animation) return 'video'
  if (message.document) return 'document'
  if (message.text || message.caption) return 'text'
  return 'other'
}

function resolveText(message: TelegramMessage, contentType: MessageContentType): string {
  const body = (message.text ?? message.caption ?? '').trim()
  if (body) return body
  return contentPlaceholder(contentType) || '[Сообщение]'
}

function resolveAuthor(message: TelegramMessage): {
  name: string | null
  externalId: string | null
} {
  if (message.author_signature) {
    return { name: message.author_signature, externalId: null }
  }
  if (message.sender_chat) {
    return {
      name: message.sender_chat.title ?? message.sender_chat.username ?? null,
      externalId: String(message.sender_chat.id),
    }
  }
  if (message.from) {
    const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ')
    return {
      name: name || message.from.username || null,
      externalId: String(message.from.id),
    }
  }
  return { name: chatTitle(message.chat), externalId: String(message.chat.id) }
}

async function handleIncomingMessage(
  db: DbClient,
  config: MessengerConfig,
  message: TelegramMessage,
  isEdit: boolean,
): Promise<void> {
  const kind = mapChatKind(message.chat.type)
  if (kind === 'other') return

  // Never relay/echo our own bot messages (prevents loops).
  if (message.from?.is_bot) {
    log('info', 'Telegram bot message ignored', {
      chatId: message.chat.id,
      messageId: message.message_id,
    })
    return
  }

  const chatId = String(message.chat.id)
  await upsertBotChannel(db, {
    platform: 'telegram',
    externalChatId: chatId,
    title: chatTitle(message.chat),
    username: message.chat.username ?? null,
    chatKind: kind,
    isActive: true,
  })

  const contentType = detectContentType(message)
  const author = resolveAuthor(message)
  const result = await ingestChannelMessage(db, {
    platform: 'telegram',
    externalChatId: chatId,
    externalMessageId: String(message.message_id),
    authorName: author.name,
    authorExternalId: author.externalId,
    text: resolveText(message, contentType),
    contentType,
    payload: {
      telegram: {
        chat_kind: kind,
        has_photo: Boolean(message.photo?.length),
        has_video: Boolean(message.video || message.animation),
        has_document: Boolean(message.document),
      },
    },
    sentAt: new Date((message.edit_date ?? message.date) * 1000).toISOString(),
    isEdit,
  })

  if (result.status !== 'skipped' && !isEdit) {
    const workGroups = new Set<string>()
    for (const item of result.items) {
      workGroups.add(item.workGroupId)
      try {
        await relaySiblingChats(db, config, {
          workGroupId: item.workGroupId,
          sourcePlatform: 'telegram',
          sourceChatId: chatId,
          messageId: item.messageId,
          text: resolveText(message, contentType),
          contentType,
          authorName: author.name,
        })
      } catch (relayError) {
        log('warn', 'Telegram sibling relay failed', {
          message: relayError instanceof Error ? relayError.message : String(relayError),
          workGroupId: item.workGroupId,
        })
      }
    }

    for (const workGroupId of workGroups) {
      try {
        await retryUndeliveredRelaysForWorkGroup(db, config, workGroupId)
      } catch (retryError) {
        log('warn', 'Telegram undelivered relay retry failed', {
          message: retryError instanceof Error ? retryError.message : String(retryError),
          workGroupId,
        })
      }
    }
  }

  log('info', 'Telegram message processed', {
    chatId,
    kind,
    messageId: message.message_id,
    result: result.status,
    isEdit,
  })
}

async function handleMyChatMember(
  db: DbClient,
  update: TelegramChatMemberUpdated,
): Promise<void> {
  const kind = mapChatKind(update.chat.type)
  const chatId = String(update.chat.id)
  const status = update.new_chat_member.status

  if (kind === 'other') {
    log('info', 'Telegram my_chat_member ignored', { chatId, kind, status })
    return
  }

  // Private: user opened/restarted the bot; groups/channels: member/admin/restricted.
  const isActive =
    kind === 'private'
      ? status !== 'kicked' && status !== 'left'
      : status === 'member' || status === 'administrator' || status === 'restricted'

  if (isActive) {
    await upsertBotChannel(db, {
      platform: 'telegram',
      externalChatId: chatId,
      title: chatTitle(update.chat),
      username: update.chat.username ?? null,
      chatKind: kind,
      isActive: true,
    })
  } else {
    await markBotChannelInactive(db, 'telegram', chatId)
  }

  log('info', 'Telegram my_chat_member', { chatId, kind, status, active: isActive })
}

export async function handleTelegramUpdate(
  db: DbClient,
  update: TelegramUpdate,
  config: MessengerConfig,
): Promise<void> {
  if (update.message) {
    await handleIncomingMessage(db, config, update.message, false)
    return
  }
  if (update.edited_message) {
    await handleIncomingMessage(db, config, update.edited_message, true)
    return
  }
  if (update.channel_post) {
    await handleIncomingMessage(db, config, update.channel_post, false)
    return
  }
  if (update.edited_channel_post) {
    await handleIncomingMessage(db, config, update.edited_channel_post, true)
    return
  }
  if (update.my_chat_member) {
    await handleMyChatMember(db, update.my_chat_member)
  }
}

export async function registerTelegramWebhook(
  token: string,
  baseUrl: string,
  secret: string | null,
): Promise<void> {
  const url = `${baseUrl}/webhooks/telegram`
  const body: Record<string, unknown> = {
    url,
    allowed_updates: [
      'message',
      'edited_message',
      'channel_post',
      'edited_channel_post',
      'my_chat_member',
    ],
    drop_pending_updates: false,
  }
  if (secret) body.secret_token = secret

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await response.json()) as { ok?: boolean; description?: string }
  if (!response.ok || !json.ok) {
    throw new Error(`Telegram setWebhook failed: ${json.description ?? response.statusText}`)
  }
  log('info', 'Telegram webhook registered', { url })

  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const infoJson = (await infoRes.json()) as {
      ok?: boolean
      result?: {
        url?: string
        pending_update_count?: number
        last_error_message?: string
        last_error_date?: number
      }
    }
    if (infoJson.ok && infoJson.result) {
      log('info', 'Telegram webhook info', {
        url: infoJson.result.url,
        pending: infoJson.result.pending_update_count ?? 0,
        lastError: infoJson.result.last_error_message ?? null,
      })
    }
  } catch (error) {
    log('warn', 'Telegram getWebhookInfo failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
