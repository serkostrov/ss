import type { DbClient } from '../db.js'
import type { MessengerConfig } from '../config/index.js'
import { markBotChannelInactive, upsertBotChannel } from '../pipeline/channels.js'
import { isBridgeEchoText, runExclusive } from '../pipeline/dedup.js'
import { deleteLinkedByExternalMessageId } from '../pipeline/delete-linked.js'
import { ingestChannelMessage } from '../pipeline/ingest.js'
import { relaySiblingChats, retryUndeliveredRelaysForWorkGroup } from '../pipeline/relay.js'
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
  is_bot?: boolean
}

type MaxChat = {
  chat_id?: number
  type?: string
  title?: string
  link?: string
  dialog_with_user?: MaxUser
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
    user_id?: number
  }
  timestamp?: number
  body?: MaxMessageBody
  link?: unknown
}

export type MaxUpdate = {
  update_type?: string
  timestamp?: number
  chat_id?: number
  user_id?: number
  message_id?: string
  user?: MaxUser
  message?: MaxMessage
  chat?: MaxChat
  /** Present on bot_added / bot_removed — true when the bot was added to a channel. */
  is_channel?: boolean
}

export type MaxAdapterOptions = {
  accessToken?: string | null
  config?: MessengerConfig | null
}

type ResolvedMaxChat = {
  externalChatId: string
  kind: ChatKind
  title: string | null
  username: string | null
  /** Dialog `chat_id` when catalog key is `user_id` — deactivate stale duplicate rows. */
  legacyChatId?: string | null
}

const chatInfoCache = new Map<string, { at: number; value: MaxChat | null }>()
const CHAT_INFO_TTL_MS = 5 * 60 * 1000
const MAX_API = 'https://platform-api2.max.ru'
let cachedBotUserId: number | null | undefined

function maxUpdateDedupeKey(update: MaxUpdate): string {
  const type = (update.update_type ?? '').toLowerCase()
  const mid = String(update.message?.body?.mid ?? update.message_id ?? '').trim()
  if (mid) return `${type}:${mid}`
  const chat = String(update.chat_id ?? update.message?.recipient?.chat_id ?? '')
  const ts = String(update.timestamp ?? update.message?.timestamp ?? '')
  return `${type}:${chat}:${ts}`
}

/** Flatten Max webhook bodies (single update, `{ updates }`, or a batch) and drop exact duplicates. */
export function collectMaxUpdates(body: unknown): MaxUpdate[] {
  const items: MaxUpdate[] = []
  if (body == null) return items
  if (Array.isArray(body)) {
    for (const item of body) {
      if (item && typeof item === 'object') items.push(item as MaxUpdate)
    }
  } else if (typeof body === 'object') {
    const obj = body as MaxUpdate & { updates?: unknown }
    if (Array.isArray(obj.updates) && obj.updates.length > 0) {
      for (const item of obj.updates) {
        if (item && typeof item === 'object') items.push(item as MaxUpdate)
      }
    } else {
      items.push(obj)
    }
  }

  const seen = new Set<string>()
  const unique: MaxUpdate[] = []
  for (const item of items) {
    const key = maxUpdateDedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
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

function userDisplayName(user?: MaxUser | null): string | null {
  if (!user) return null
  const name =
    user.name?.trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.username?.trim() ||
    ''
  return name || null
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
  return {
    name: userDisplayName(sender),
    externalId: sender.user_id != null ? String(sender.user_id) : null,
  }
}

function withOptionalTlsInsecure<T>(fn: () => Promise<T>): Promise<T> {
  const insecure = process.env.MAX_TLS_INSECURE === '1'
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  return fn().finally(() => {
    if (!insecure) return
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous
  })
}

async function maxApiFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = accessToken.replace(/^Bearer\s+/i, '').trim()
  return withOptionalTlsInsecure(() =>
    fetch(`${MAX_API}${path}`, {
      ...init,
      headers: {
        Authorization: token,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    }),
  )
}

async function getMaxBotUserId(accessToken: string | null | undefined): Promise<number | null> {
  if (!accessToken) return null
  if (cachedBotUserId !== undefined) return cachedBotUserId
  try {
    const response = await maxApiFetch(accessToken, '/me')
    if (!response.ok) {
      cachedBotUserId = null
      return null
    }
    const json = (await response.json()) as {
      user_id?: number
      user?: { user_id?: number }
      bot?: { user_id?: number }
    }
    const id = json.user_id ?? json.user?.user_id ?? json.bot?.user_id
    cachedBotUserId = typeof id === 'number' ? id : null
    return cachedBotUserId
  } catch {
    cachedBotUserId = null
    return null
  }
}

async function fetchMaxChat(accessToken: string, chatId: string): Promise<MaxChat | null> {
  const cached = chatInfoCache.get(chatId)
  if (cached && Date.now() - cached.at < CHAT_INFO_TTL_MS) return cached.value

  const token = accessToken.replace(/^Bearer\s+/i, '').trim()
  try {
    const response = await withOptionalTlsInsecure(() =>
      fetch(`https://platform-api2.max.ru/chats/${encodeURIComponent(chatId)}`, {
        method: 'GET',
        headers: { Authorization: token },
      }),
    )
    if (!response.ok) {
      log('warn', 'Max get chat failed', { chatId, status: response.status })
      chatInfoCache.set(chatId, { at: Date.now(), value: null })
      return null
    }
    const json = (await response.json()) as MaxChat
    chatInfoCache.set(chatId, { at: Date.now(), value: json })
    return json
  } catch (error) {
    log('warn', 'Max get chat error', {
      chatId,
      message: error instanceof Error ? error.message : String(error),
    })
    chatInfoCache.set(chatId, { at: Date.now(), value: null })
    return null
  }
}

/**
 * Max dialogs are addressed by user_id (outbound API), while groups/channels use chat_id.
 * bot_started / messages can expose both ids — we catalog DMs by user_id like Telegram.
 */
function resolvePrivateChat(params: {
  userId: number | null | undefined
  dialogChatId: number | null | undefined
  user?: MaxUser | null
  titleHint?: string | null
}): ResolvedMaxChat | null {
  if (params.userId == null || params.userId === 0) return null
  const externalChatId = String(params.userId)
  const dialogChatId =
    params.dialogChatId != null &&
    params.dialogChatId !== 0 &&
    String(params.dialogChatId) !== externalChatId
      ? String(params.dialogChatId)
      : null
  return {
    externalChatId,
    kind: 'private',
    title: params.titleHint?.trim() || userDisplayName(params.user),
    username: params.user?.username ?? null,
    legacyChatId: dialogChatId,
  }
}

function resolveMembershipChat(update: MaxUpdate, eventType: string): ResolvedMaxChat | null {
  if (eventType === 'bot_started' || eventType === 'bot_stopped') {
    return resolvePrivateChat({
      userId: update.user?.user_id,
      dialogChatId: update.chat_id ?? update.chat?.chat_id,
      user: update.user,
      titleHint: update.chat?.title,
    })
  }

  // bot_added / bot_removed — group or channel (never use adder's name as title).
  const chatId = update.chat_id ?? update.chat?.chat_id
  if (chatId == null || chatId === 0) return null

  const kind: ChatKind =
    update.is_channel === true || mapChatKind(update.chat?.type) === 'channel'
      ? 'channel'
      : 'group'

  return {
    externalChatId: String(chatId),
    kind,
    title: update.chat?.title?.trim() || null,
    username: null,
  }
}

function resolveMessageChat(update: MaxUpdate): ResolvedMaxChat | null {
  const message = update.message
  if (!message) return null

  const recipient = message.recipient
  const rawType = (recipient?.chat_type ?? update.chat?.type ?? '').toLowerCase()
  const kind = mapChatKind(rawType)
  const dialogChatId = recipient?.chat_id ?? update.chat_id ?? update.chat?.chat_id

  const sender = message.sender
  const senderId = sender?.user_id
  // Max bots reply with sendMessageToUser(sender.user_id). recipient.user_id is often the bot.
  const senderIsHuman = senderId != null && senderId !== 0 && sender?.is_bot !== true

  const isDialog =
    rawType === 'dialog' ||
    kind === 'private' ||
    dialogChatId === 0 ||
    (senderIsHuman && (kind === 'other' || dialogChatId == null))

  if (isDialog) {
    const peerUserId = senderIsHuman ? senderId : recipient?.user_id
    return resolvePrivateChat({
      userId: peerUserId,
      dialogChatId,
      user: senderIsHuman ? sender : (update.user ?? update.chat?.dialog_with_user),
      titleHint: update.chat?.title,
    })
  }

  if (kind === 'other') {
    return null
  }

  if (dialogChatId == null || dialogChatId === 0) return null

  const groupKind: ChatKind =
    kind === 'channel' || kind === 'supergroup' || kind === 'group' ? kind : 'group'

  return {
    externalChatId: String(dialogChatId),
    kind: groupKind,
    title: update.chat?.title?.trim() || null,
    username: null,
  }
}

async function enrichChatTitle(
  resolved: ResolvedMaxChat,
  accessToken: string | null | undefined,
): Promise<ResolvedMaxChat> {
  if (resolved.title?.trim()) return resolved
  if (!accessToken) return resolved
  if (resolved.kind === 'private') return resolved

  const info = await fetchMaxChat(accessToken, resolved.externalChatId)
  if (!info) return resolved

  const kindFromApi = mapChatKind(info.type)
  return {
    ...resolved,
    kind: kindFromApi !== 'other' ? kindFromApi : resolved.kind,
    title: info.title?.trim() || resolved.title,
  }
}

async function catalogChat(
  db: DbClient,
  resolved: ResolvedMaxChat,
  isActive: boolean,
  accessToken?: string | null,
): Promise<ResolvedMaxChat | null> {
  if (resolved.kind === 'other') return null

  const enriched = isActive ? await enrichChatTitle(resolved, accessToken) : resolved

  if (!isActive) {
    await markBotChannelInactive(db, 'max', enriched.externalChatId)
    if (enriched.legacyChatId) {
      await markBotChannelInactive(db, 'max', enriched.legacyChatId)
    }
    return enriched
  }

  await upsertBotChannel(db, {
    platform: 'max',
    externalChatId: enriched.externalChatId,
    title: enriched.title,
    username: enriched.username,
    chatKind: enriched.kind,
    isActive: true,
  })

  // Drop duplicate dialog rows that were stored under Max dialog chat_id.
  if (enriched.legacyChatId) {
    await markBotChannelInactive(db, 'max', enriched.legacyChatId)
  }

  return enriched
}

async function handleBotMembership(
  db: DbClient,
  update: MaxUpdate,
  eventType: string,
  isActive: boolean,
  accessToken?: string | null,
): Promise<void> {
  const resolved = resolveMembershipChat(update, eventType)
  if (!resolved) {
    log('warn', 'Max membership without resolvable chat', { eventType })
    return
  }

  const cataloged = await catalogChat(db, resolved, isActive, accessToken)
  log('info', 'Max bot membership', {
    chatId: cataloged?.externalChatId ?? resolved.externalChatId,
    kind: cataloged?.kind ?? resolved.kind,
    isActive,
    eventType,
  })
}

async function handleMessageCreated(
  db: DbClient,
  update: MaxUpdate,
  isEdit: boolean,
  options: MaxAdapterOptions = {},
): Promise<void> {
  const message = update.message
  if (!message) return

  const mid = message.body?.mid
  if (!mid) {
    log('warn', 'Max message without mid', {
      chatType: message.recipient?.chat_type ?? update.chat?.type ?? null,
    })
    return
  }

  await runExclusive(`max:${mid}`, async () => {
    const botUserId = await getMaxBotUserId(options.accessToken)
    const senderIsOurBot =
      message.sender?.is_bot === true ||
      (botUserId != null && message.sender?.user_id === botUserId)

    if (senderIsOurBot) {
      log('info', 'Max bot message ignored', {
        mid,
        userId: message.sender?.user_id ?? null,
      })
      return
    }

    const contentType = detectContentType(message)
    const text = resolveText(message, contentType)
    if (isBridgeEchoText(text)) {
      log('info', 'Max bridge echo ignored', { mid })
      return
    }

    const accessToken = options.accessToken ?? null
    const resolved = resolveMessageChat(update)
    if (!resolved) {
      log('warn', 'Max message without resolvable chat', {
        chatType: message.recipient?.chat_type ?? update.chat?.type ?? null,
      })
      return
    }

    const cataloged = await catalogChat(db, resolved, true, accessToken)
    const chatId = cataloged?.externalChatId ?? resolved.externalChatId
    const kind = cataloged?.kind ?? resolved.kind
    const author = resolveAuthor(message)
    const sentAtMs = message.timestamp ?? update.timestamp ?? Date.now()

    const result = await ingestChannelMessage(db, {
      platform: 'max',
      externalChatId: chatId,
      externalMessageId: mid,
      authorName: author.name,
      authorExternalId: author.externalId,
      text,
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

    if (result.status !== 'skipped' && !isEdit && options.config) {
      const workGroups = new Set<string>()
      for (const item of result.items) {
        workGroups.add(item.workGroupId)
        if (item.status !== 'stored') continue
        try {
          await relaySiblingChats(db, options.config, {
            workGroupId: item.workGroupId,
            sourcePlatform: 'max',
            sourceChatId: chatId,
            sourceExternalMessageId: mid,
            messageId: item.messageId,
            text,
            contentType,
            authorName: author.name,
          })
        } catch (relayError) {
          log('warn', 'Max sibling relay failed', {
            message: relayError instanceof Error ? relayError.message : String(relayError),
            workGroupId: item.workGroupId,
          })
        }
      }

      for (const workGroupId of workGroups) {
        try {
          await retryUndeliveredRelaysForWorkGroup(db, options.config, workGroupId)
        } catch (retryError) {
          log('warn', 'Max undelivered relay retry failed', {
            message: retryError instanceof Error ? retryError.message : String(retryError),
            workGroupId,
          })
        }
      }
    }

    log('info', 'Max message processed', {
      chatId,
      kind,
      mid,
      result: result.status,
      isEdit,
      duplicate: result.status === 'duplicate',
    })
  })
}

export async function handleMaxUpdate(
  db: DbClient,
  update: MaxUpdate,
  options: MaxAdapterOptions = {},
): Promise<void> {
  const type = (update.update_type ?? '').toLowerCase()
  const accessToken = options.accessToken ?? null

  if (type === 'bot_added' || type === 'bot_started') {
    await handleBotMembership(db, update, type, true, accessToken)
    return
  }
  if (type === 'bot_removed' || type === 'bot_stopped') {
    await handleBotMembership(db, update, type, false, accessToken)
    return
  }
  if (type === 'message_created') {
    await handleMessageCreated(db, update, false, options)
    return
  }
  if (type === 'message_edited') {
    await handleMessageCreated(db, update, true, options)
    return
  }
  if (type === 'message_removed') {
    const mid = String(update.message_id ?? update.message?.body?.mid ?? '').trim()
    if (!mid) {
      log('warn', 'Max message_removed without message_id')
      return
    }
    if (!options.config) {
      log('warn', 'Max message_removed skipped — no config')
      return
    }
    try {
      await deleteLinkedByExternalMessageId(db, options.config, 'max', mid)
    } catch (error) {
      log('warn', 'Max message_removed cascade failed', {
        mid,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function registerMaxWebhook(
  token: string,
  baseUrl: string,
  secret: string | null,
): Promise<void> {
  const url = `${baseUrl}/webhooks/max`
  const accessToken = token.replace(/^Bearer\s+/i, '').trim()

  try {
    const listResponse = await maxApiFetch(accessToken, '/subscriptions')
    if (listResponse.ok) {
      const listJson = (await listResponse.json()) as
        | Array<{ url?: string }>
        | { subscriptions?: Array<{ url?: string }>; webhooks?: Array<{ url?: string }> }
      const existing = Array.isArray(listJson)
        ? listJson
        : [...(listJson.subscriptions ?? []), ...(listJson.webhooks ?? [])]
      log('info', 'Max subscriptions before register', {
        count: existing.length,
        urls: existing.map((item) => item.url ?? null),
      })
      for (const item of existing) {
        const current = item.url?.trim()
        if (!current) continue
        const deleteResponse = await maxApiFetch(
          accessToken,
          `/subscriptions?url=${encodeURIComponent(current)}`,
          { method: 'DELETE' },
        )
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          log('warn', 'Max subscription delete failed', {
            url: current,
            status: deleteResponse.status,
          })
        }
      }
    } else {
      log('warn', 'Max list subscriptions failed', { status: listResponse.status })
    }
  } catch (error) {
    log('warn', 'Max list/delete subscriptions failed', {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const body: Record<string, unknown> = {
    url,
    update_types: [
      'message_created',
      'message_edited',
      'message_removed',
      'bot_added',
      'bot_removed',
      'bot_started',
      'bot_stopped',
    ],
  }
  if (secret) body.secret = secret

  const insecure = process.env.MAX_TLS_INSECURE === '1'
  if (insecure) {
    log('warn', 'MAX_TLS_INSECURE=1 — TLS verification disabled for Max API')
  }

  const response = await maxApiFetch(accessToken, '/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Max subscriptions failed: ${response.status} ${text}`)
  }

  log('info', 'Max webhook registered', { url })
}
