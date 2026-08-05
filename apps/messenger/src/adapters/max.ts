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
  user?: MaxUser
  message?: MaxMessage
  chat?: MaxChat
  /** Present on bot_added / bot_removed — true when the bot was added to a channel. */
  is_channel?: boolean
}

export type MaxAdapterOptions = {
  accessToken?: string | null
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
  const rawType = recipient?.chat_type ?? update.chat?.type
  const kind = mapChatKind(rawType)
  const dialogChatId = recipient?.chat_id ?? update.chat_id ?? update.chat?.chat_id
  // Peer for DMs is recipient.user_id — do NOT use sender.user_id (that breaks groups).
  const peerUserId = recipient?.user_id

  // Max DMs: chat_id is often 0; type may be dialog/private/omitted/"chat".
  const looksLikeDialog =
    peerUserId != null &&
    peerUserId !== 0 &&
    (kind === 'private' ||
      kind === 'other' ||
      dialogChatId == null ||
      dialogChatId === 0)

  if (looksLikeDialog) {
    return resolvePrivateChat({
      userId: peerUserId,
      dialogChatId,
      user: message.sender ?? update.user ?? update.chat?.dialog_with_user,
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
  accessToken?: string | null,
): Promise<void> {
  const message = update.message
  if (!message) return

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
    await handleMessageCreated(db, update, false, accessToken)
    return
  }
  if (type === 'message_edited') {
    await handleMessageCreated(db, update, true, accessToken)
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
