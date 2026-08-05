import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { deleteLinkedAcrossPlatforms } from '../pipeline/delete-linked.js'
import { ingestChannelMessage } from '../pipeline/ingest.js'
import { relaySiblingChats } from '../pipeline/relay.js'
import { log, type MessageContentType } from '../types.js'
import { deliverToBoundChat, type DeliverFile } from './deliver.js'

export type OutboundFile = DeliverFile

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

async function getBoundChatId(
  db: DbClient,
  workGroupId: string,
  platform: 'telegram' | 'max',
): Promise<string> {
  const { data, error } = await db
    .from('messenger_connections')
    .select('chat_id')
    .eq('work_group_id', workGroupId)
    .eq('platform', platform)
    .maybeSingle()

  if (error) throw error
  const chatId = String(data?.chat_id ?? '').trim()
  if (!chatId) {
    const err = new Error('chat_not_bound')
    ;(err as Error & { status: number }).status = 400
    throw err
  }
  return chatId
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

  // Source of truth after Max rebinds — not the possibly stale client chatId.
  const boundChatId = await getBoundChatId(db, input.workGroupId, input.platform)

  const delivered = await deliverToBoundChat(db, config, {
    platform: input.platform,
    chatId: boundChatId,
    workGroupId: input.workGroupId,
    text,
    files: input.files,
    chatKind: input.chatKind,
  })

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

  const ingested = await ingestChannelMessage(db, {
    platform: input.platform,
    externalChatId: delivered.chatId,
    externalMessageId: delivered.externalMessageId,
    authorName: input.authorName ?? 'АПСС',
    authorExternalId: null,
    text: displayText,
    contentType,
    payload: {
      outbound: true,
      files: input.files.map((file) => ({
        name: file.name,
        mime: file.mime,
        size: file.buffer.length,
      })),
    },
    sentAt: new Date().toISOString(),
    isEdit: false,
    skipRelay: true,
  })

  if (ingested.status !== 'skipped') {
    for (const item of ingested.items) {
      try {
        await relaySiblingChats(db, config, {
          workGroupId: item.workGroupId,
          sourcePlatform: input.platform,
          sourceChatId: delivered.chatId,
          messageId: item.messageId,
          text: displayText,
          contentType,
          authorName: input.authorName ?? 'АПСС',
          fromOutbound: true,
        })
      } catch (relayError) {
        log('warn', 'Outbound sibling relay failed', {
          message: relayError instanceof Error ? relayError.message : String(relayError),
          workGroupId: item.workGroupId,
        })
      }
    }
  }

  log('info', 'Outbound message sent', {
    platform: input.platform,
    chatId: delivered.chatId,
    externalMessageId: delivered.externalMessageId,
    files: input.files.length,
  })

  return { externalMessageId: delivered.externalMessageId }
}

export type OutboundDeleteInput = {
  platform: 'telegram' | 'max'
  chatId: string
  workGroupId: string
  externalMessageId: string
  /** Platform message row id — preferred for DB delete. */
  messageId?: string | null
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

  const { data: connection, error: connectionError } = await db
    .from('messenger_connections')
    .select('id')
    .eq('work_group_id', input.workGroupId)
    .eq('platform', input.platform)
    .maybeSingle()

  if (connectionError) throw connectionError
  if (!connection) {
    const err = new Error('chat_not_bound')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  await deleteLinkedAcrossPlatforms(db, config, {
    workGroupId: input.workGroupId,
    platform: input.platform,
    chatId: input.chatId,
    externalMessageId,
    messageId: input.messageId,
  })

  log('info', 'Outbound message deleted (with linked copies)', {
    platform: input.platform,
    chatId: input.chatId,
    externalMessageId,
  })

  return { ok: true }
}
