import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { markBotChannelInactive, upsertBotChannel } from '../pipeline/channels.js'
import { ingestChannelMessage } from '../pipeline/ingest.js'
import { log, type MessageContentType } from '../types.js'

export type OutboundFile = {
  name: string
  mime: string
  buffer: Buffer
}

export type OutboundSendInput = {
  platform: 'telegram' | 'max'
  chatId: string
  workGroupId: string
  text: string
  files: OutboundFile[]
  authorName?: string | null
  /** Optional hint from web / catalog — Max DMs must use user_id. */
  chatKind?: string | null
}

function detectContentType(files: OutboundFile[], text: string): MessageContentType {
  if (files.some((file) => file.mime.startsWith('image/'))) return 'photo'
  if (files.some((file) => file.mime.startsWith('video/'))) return 'video'
  if (files.length) return 'document'
  if (text.trim()) return 'text'
  return 'other'
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

async function assertConnection(
  db: DbClient,
  input: Pick<OutboundSendInput, 'platform' | 'chatId' | 'workGroupId'>,
): Promise<void> {
  const { data, error } = await db
    .from('messenger_connections')
    .select('id')
    .eq('work_group_id', input.workGroupId)
    .eq('platform', input.platform)
    .eq('chat_id', input.chatId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const err = new Error('chat_not_bound')
    ;(err as Error & { status: number }).status = 400
    throw err
  }
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
  files: OutboundFile[],
): Promise<{ externalMessageId: string }> {
  const base = `https://api.telegram.org/bot${token}`

  if (!files.length) {
    const response = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    })
    const json = (await response.json()) as {
      ok?: boolean
      description?: string
      result?: { message_id?: number }
    }
    if (!response.ok || !json.ok || json.result?.message_id == null) {
      throw new Error(json.description ?? 'Telegram sendMessage failed')
    }
    return { externalMessageId: String(json.result.message_id) }
  }

  let lastId: string | null = null
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!
    const isImage = file.mime.startsWith('image/')
    const method = isImage ? 'sendPhoto' : 'sendDocument'
    const field = isImage ? 'photo' : 'document'
    const form = new FormData()
    form.set('chat_id', chatId)
    if (index === 0 && text.trim()) form.set('caption', text)
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mime || 'application/octet-stream',
    })
    form.set(field, blob, file.name || (isImage ? 'photo.jpg' : 'file.bin'))

    const response = await fetch(`${base}/${method}`, { method: 'POST', body: form })
    const json = (await response.json()) as {
      ok?: boolean
      description?: string
      result?: { message_id?: number }
    }
    if (!response.ok || !json.ok || json.result?.message_id == null) {
      throw new Error(json.description ?? `Telegram ${method} failed`)
    }
    lastId = String(json.result.message_id)
  }

  return { externalMessageId: lastId ?? `out-${Date.now()}` }
}

type MaxAddressMode = 'user_id' | 'chat_id'

function maxAddressModes(chatKind: string | null): MaxAddressMode[] {
  // Always try both: catalog kind is often wrong for Max DMs (chat_id=0 / type=chat).
  if (chatKind === 'channel' || chatKind === 'group' || chatKind === 'supergroup') {
    return ['chat_id', 'user_id']
  }
  // private / unknown → DM first
  return ['user_id', 'chat_id']
}

function isRetryableMaxAddressError(status: number, body: string): boolean {
  if (status !== 403 && status !== 400 && status !== 404) return false
  const lower = body.toLowerCase()
  return (
    lower.includes('invalid chatid: 0') ||
    lower.includes('chat.denied') ||
    lower.includes('chat.not.found') ||
    lower.includes('chat not found') ||
    lower.includes('not.found')
  )
}

async function lookupMaxChatKind(
  db: DbClient,
  chatId: string,
): Promise<string | null> {
  const { data: catalog } = await db
    .from('messenger_bot_channels')
    .select('chat_kind')
    .eq('platform', 'max')
    .eq('external_chat_id', chatId)
    .maybeSingle()

  if (catalog?.chat_kind) return catalog.chat_kind as string

  const { data: msg } = await db
    .from('messages')
    .select('payload')
    .eq('source', 'max')
    .eq('external_chat_id', chatId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const kind = (msg?.payload as { max?: { chat_kind?: string } } | null)?.max?.chat_kind
  return kind ?? null
}

/**
 * Latest human author on an inbound Max thread.
 * Bound chat_id was often recipient.user_id (bot) — author_external_id is the real peer.
 */
async function resolveMaxDmPeerUserId(
  db: DbClient,
  workGroupId: string,
  boundChatId: string,
): Promise<string | null> {
  const { data: rows } = await db
    .from('messages')
    .select('author_external_id, payload')
    .eq('work_group_id', workGroupId)
    .eq('source', 'max')
    .eq('external_chat_id', boundChatId)
    .not('author_external_id', 'is', null)
    .neq('author_external_id', '0')
    .order('sent_at', { ascending: false })
    .limit(30)

  for (const row of rows ?? []) {
    const payload = row.payload as { outbound?: boolean } | null
    if (payload?.outbound) continue
    const id = String(row.author_external_id ?? '').trim()
    if (id && id !== '0') return id
  }
  return null
}

async function rebindMaxConnectionChatId(
  db: DbClient,
  workGroupId: string,
  fromChatId: string,
  toChatId: string,
): Promise<void> {
  if (!toChatId || toChatId === '0' || fromChatId === toChatId) return

  const { error: connErr } = await db
    .from('messenger_connections')
    .update({ chat_id: toChatId, last_error: null, bot_status: 'connected' })
    .eq('work_group_id', workGroupId)
    .eq('platform', 'max')
    .eq('chat_id', fromChatId)

  if (connErr) {
    log('warn', 'Failed to rebind Max connection', {
      workGroupId,
      fromChatId,
      toChatId,
      message: connErr.message,
    })
  } else {
    log('info', 'Rebound Max connection to peer user_id', {
      workGroupId,
      fromChatId,
      toChatId,
    })
  }

  await db
    .from('messages')
    .update({ external_chat_id: toChatId })
    .eq('work_group_id', workGroupId)
    .eq('source', 'max')
    .eq('external_chat_id', fromChatId)

  await upsertBotChannel(db, {
    platform: 'max',
    externalChatId: toChatId,
    title: null,
    username: null,
    chatKind: 'private',
    isActive: true,
  })

  if (fromChatId && fromChatId !== '0') {
    await markBotChannelInactive(db, 'max', fromChatId)
  }
}

/**
 * Old Max dialogs were sometimes stored as chat_id "0". Recover user_id from inbound
 * messages and rewrite the work-group binding so future sends work.
 */
async function healMaxChatIdZero(
  db: DbClient,
  workGroupId: string,
): Promise<{ chatId: string; chatKind: string } | null> {
  const { data: msg } = await db
    .from('messages')
    .select('author_external_id')
    .eq('work_group_id', workGroupId)
    .eq('source', 'max')
    .eq('external_chat_id', '0')
    .not('author_external_id', 'is', null)
    .neq('author_external_id', '0')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let userId = msg?.author_external_id?.trim() || null

  if (!userId || userId === '0') return null

  const { error: updErr } = await db
    .from('messenger_connections')
    .update({ chat_id: userId, last_error: null, bot_status: 'connected' })
    .eq('work_group_id', workGroupId)
    .eq('platform', 'max')
    .eq('chat_id', '0')

  if (updErr) {
    log('warn', 'Failed to heal Max connection chat_id=0', {
      workGroupId,
      userId,
      message: updErr.message,
    })
  } else {
    log('info', 'Healed Max connection chat_id 0 → user_id', { workGroupId, userId })
  }

  // Move thread history under the real user_id so the UI stays on one chat.
  await db
    .from('messages')
    .update({ external_chat_id: userId })
    .eq('work_group_id', workGroupId)
    .eq('source', 'max')
    .eq('external_chat_id', '0')

  return { chatId: userId, chatKind: 'private' }
}

async function sendMax(
  token: string,
  chatId: string,
  text: string,
  files: OutboundFile[],
  chatKind: string | null,
): Promise<{ externalMessageId: string }> {
  if (files.length) {
    const err = new Error('max_attachments_unsupported')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  const trimmedId = chatId.trim()
  if (!trimmedId || trimmedId === '0') {
    const err = new Error(
      'invalid_max_chat_id: привяжите чат заново (ЛС — user_id, группа/канал — chat_id)',
    )
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  const accessToken = token.replace(/^Bearer\s+/i, '').trim()
  const modes = maxAddressModes(chatKind)
  let lastFailure = ''

  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i]!
    const query =
      mode === 'user_id'
        ? `user_id=${encodeURIComponent(trimmedId)}`
        : `chat_id=${encodeURIComponent(trimmedId)}`

    log('info', 'Max outbound address', {
      chatId: trimmedId,
      chatKind,
      mode,
      attempt: i + 1,
    })

    const response = await withOptionalTlsInsecure(() =>
      fetch(`https://platform-api2.max.ru/messages?${query}`, {
        method: 'POST',
        headers: {
          Authorization: accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }),
    )

    const bodyText = await response.text()
    if (response.ok) {
      let mid = `out-${Date.now()}`
      try {
        const json = JSON.parse(bodyText) as { message?: { body?: { mid?: string } } }
        if (json.message?.body?.mid) mid = json.message.body.mid
      } catch {
        // ignore parse errors — message may still be sent
      }
      return { externalMessageId: mid }
    }

    lastFailure = `Max send failed (${mode}=${trimmedId}, kind=${chatKind ?? 'unknown'}): ${response.status} ${bodyText}`
    const canRetry =
      i < modes.length - 1 && isRetryableMaxAddressError(response.status, bodyText)
    if (!canRetry) break

    log('warn', 'Max outbound retry with alternate address mode', {
      chatId: trimmedId,
      from: mode,
      to: modes[i + 1],
      status: response.status,
    })
  }

  if (lastFailure.toLowerCase().includes('chat.not.found')) {
    const err = new Error(
      'max_chat_not_found: чат Max не найден. Для ЛС пользователь должен написать боту; удалите привязку и выберите чат «Личные» заново. Группа/канал — id чата, не user_id.',
    )
    ;(err as Error & { status: number }).status = 404
    throw err
  }

  throw new Error(lastFailure || 'Max send failed')
}

export async function sendOutboundMessage(
  db: DbClient,
  config: MessengerConfig,
  input: OutboundSendInput,
): Promise<{ externalMessageId: string }> {
  const text = input.text.trim()
  if (!text && input.files.length === 0) {
    const err = new Error('empty_message')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  let chatId = input.chatId.trim()
  let chatKind: string | null = input.chatKind?.trim() || null

  if (input.platform === 'max' && chatId === '0') {
    const healed = await healMaxChatIdZero(db, input.workGroupId)
    if (!healed) {
      const err = new Error(
        'invalid_max_chat_id: привязка Max с id 0. Удалите привязку, напишите боту в ЛС и выберите чат «Личные» (user_id).',
      )
      ;(err as Error & { status: number }).status = 400
      throw err
    }
    chatId = healed.chatId
    chatKind = healed.chatKind
  }

  await assertConnection(db, { ...input, chatId })

  if (input.platform === 'max' && !chatKind) {
    chatKind = await lookupMaxChatKind(db, chatId)
  }

  // If an active private catalog row exists under this id, force DM addressing.
  if (input.platform === 'max' && chatKind !== 'private' && chatId !== '0') {
    const { data: privateRow } = await db
      .from('messenger_bot_channels')
      .select('chat_kind')
      .eq('platform', 'max')
      .eq('external_chat_id', chatId)
      .eq('chat_kind', 'private')
      .eq('is_active', true)
      .maybeSingle()
    if (privateRow) chatKind = 'private'
  }

  // Bound id was often Max recipient.user_id (bot). Send to inbound author (human).
  if (
    input.platform === 'max' &&
    (chatKind === 'private' || chatKind === 'other' || !chatKind)
  ) {
    const peer = await resolveMaxDmPeerUserId(db, input.workGroupId, chatId)
    if (peer) {
      if (peer !== chatId) {
        await rebindMaxConnectionChatId(db, input.workGroupId, chatId, peer)
        chatId = peer
      }
      chatKind = 'private'
    }
  }

  let result: { externalMessageId: string }

  if (input.platform === 'telegram') {
    if (!config.telegramBotToken) {
      const err = new Error('telegram_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    result = await sendTelegram(config.telegramBotToken, chatId, text, input.files)
  } else {
    if (!config.maxBotToken) {
      const err = new Error('max_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    result = await sendMax(config.maxBotToken, chatId, text, input.files, chatKind)
  }

  const contentType = detectContentType(input.files, text)
  const displayText =
    text ||
    (contentType === 'photo'
      ? '[Фото]'
      : contentType === 'video'
        ? '[Видео]'
        : contentType === 'document'
          ? '[Документ]'
          : '[Сообщение]')

  await ingestChannelMessage(db, {
    platform: input.platform,
    externalChatId: chatId,
    externalMessageId: result.externalMessageId,
    authorName: input.authorName ?? 'АПСС',
    authorExternalId: null,
    text: displayText,
    contentType,
    payload: {
      outbound: true,
      files: input.files.map((file) => ({ name: file.name, mime: file.mime, size: file.buffer.length })),
    },
    sentAt: new Date().toISOString(),
    isEdit: false,
  })

  log('info', 'Outbound message sent', {
    platform: input.platform,
    chatId,
    externalMessageId: result.externalMessageId,
    files: input.files.length,
  })

  return result
}

export type OutboundDeleteInput = {
  platform: 'telegram' | 'max'
  chatId: string
  workGroupId: string
  externalMessageId: string
  /** Platform message row id — preferred for DB delete. */
  messageId?: string | null
}

function isAlreadyGoneError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('message to delete not found') ||
    lower.includes('message_id_invalid') ||
    lower.includes('message not found') ||
    lower.includes('not found') ||
    lower.includes('404')
  )
}

async function deleteTelegram(
  token: string,
  chatId: string,
  externalMessageId: string,
): Promise<void> {
  const messageId = Number(externalMessageId)
  if (!Number.isFinite(messageId)) {
    const err = new Error('invalid_external_message_id')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  })
  const json = (await response.json()) as {
    ok?: boolean
    description?: string
  }
  if (json.ok) return
  const description = json.description ?? 'Telegram deleteMessage failed'
  // Already gone on Telegram — still clear the platform copy.
  if (isAlreadyGoneError(description)) return
  throw new Error(description)
}

async function deleteMax(token: string, externalMessageId: string): Promise<void> {
  const accessToken = token.replace(/^Bearer\s+/i, '').trim()
  const response = await withOptionalTlsInsecure(() =>
    fetch(
      `https://platform-api2.max.ru/messages?message_id=${encodeURIComponent(externalMessageId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: accessToken },
      },
    ),
  )

  if (response.ok || response.status === 204) return
  if (response.status === 404) return

  const bodyText = await response.text()
  if (isAlreadyGoneError(bodyText)) return
  throw new Error(`Max delete failed: ${response.status} ${bodyText}`)
}

async function deleteLocalMessage(
  db: DbClient,
  input: OutboundDeleteInput,
): Promise<void> {
  if (input.messageId?.trim()) {
    const { error } = await db.from('messages').delete().eq('id', input.messageId.trim())
    if (error) throw error
    return
  }

  const { error } = await db
    .from('messages')
    .delete()
    .eq('work_group_id', input.workGroupId)
    .eq('source', input.platform)
    .eq('external_message_id', input.externalMessageId)

  if (error) throw error
}

export async function deleteOutboundMessage(
  db: DbClient,
  config: MessengerConfig,
  input: OutboundDeleteInput,
): Promise<{ ok: true }> {
  const externalMessageId = input.externalMessageId.trim()
  if (!externalMessageId) {
    const err = new Error('invalid_external_message_id')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  await assertConnection(db, input)

  if (input.platform === 'telegram') {
    if (!config.telegramBotToken) {
      const err = new Error('telegram_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    await deleteTelegram(config.telegramBotToken, input.chatId, externalMessageId)
  } else {
    if (!config.maxBotToken) {
      const err = new Error('max_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    await deleteMax(config.maxBotToken, externalMessageId)
  }

  await deleteLocalMessage(db, { ...input, externalMessageId })

  log('info', 'Outbound message deleted', {
    platform: input.platform,
    chatId: input.chatId,
    externalMessageId,
    messageId: input.messageId ?? null,
  })

  return { ok: true }
}
