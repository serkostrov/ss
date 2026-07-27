import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
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

  const accessToken = token.replace(/^Bearer\s+/i, '').trim()
  const numericId = Number(chatId)
  const useUserId =
    chatKind === 'private' || (!Number.isNaN(numericId) && numericId > 0 && chatKind !== 'channel')

  const query = useUserId
    ? `user_id=${encodeURIComponent(chatId)}`
    : `chat_id=${encodeURIComponent(chatId)}`

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
  if (!response.ok) {
    throw new Error(`Max send failed: ${response.status} ${bodyText}`)
  }

  let mid = `out-${Date.now()}`
  try {
    const json = JSON.parse(bodyText) as { message?: { body?: { mid?: string } } }
    if (json.message?.body?.mid) mid = json.message.body.mid
  } catch {
    // ignore parse errors — message may still be sent
  }
  return { externalMessageId: mid }
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

  await assertConnection(db, input)

  const { data: catalog } = await db
    .from('messenger_bot_channels')
    .select('chat_kind')
    .eq('platform', input.platform)
    .eq('external_chat_id', input.chatId)
    .maybeSingle()

  let result: { externalMessageId: string }

  if (input.platform === 'telegram') {
    if (!config.telegramBotToken) {
      const err = new Error('telegram_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    result = await sendTelegram(config.telegramBotToken, input.chatId, text, input.files)
  } else {
    if (!config.maxBotToken) {
      const err = new Error('max_not_configured')
      ;(err as Error & { status: number }).status = 503
      throw err
    }
    result = await sendMax(
      config.maxBotToken,
      input.chatId,
      text,
      input.files,
      (catalog?.chat_kind as string | null) ?? null,
    )
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
    externalChatId: input.chatId,
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
    chatId: input.chatId,
    externalMessageId: result.externalMessageId,
    files: input.files.length,
  })

  return result
}
