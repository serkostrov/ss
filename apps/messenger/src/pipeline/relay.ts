import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { deliverToBoundChat } from '../outbound/deliver.js'
import {
  contentPlaceholder,
  log,
  type MessageContentType,
  type MessengerPlatform,
} from '../types.js'
import { ingestChannelMessage } from './ingest.js'

export type RelaySiblingInput = {
  workGroupId: string
  sourcePlatform: MessengerPlatform
  sourceChatId: string
  messageId: string
  text: string
  contentType: MessageContentType
  authorName?: string | null
  /** Site/admin outbound — mirror without messenger prefix noise. */
  fromOutbound?: boolean
}

type RelayRow = {
  id: string
  status: 'pending' | 'sent' | 'failed'
  created_at?: string
}

const STALE_PENDING_MS = 90_000

function platformLabel(platform: MessengerPlatform): string {
  return platform === 'telegram' ? 'Telegram' : 'Max'
}

function formatRelayText(input: RelaySiblingInput): string {
  const body =
    input.text.trim() || contentPlaceholder(input.contentType) || '[Сообщение]'
  if (input.fromOutbound) {
    const author = input.authorName?.trim()
    return author ? `${author}: ${body}` : body
  }
  const who = input.authorName?.trim() || 'Участник'
  return `[${platformLabel(input.sourcePlatform)} · ${who}]\n${body}`
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

async function loadRelayRow(
  db: DbClient,
  messageId: string,
  targetPlatform: MessengerPlatform,
): Promise<RelayRow | null> {
  const { data, error } = await db
    .from('message_relays')
    .select('id, status, created_at')
    .eq('message_id', messageId)
    .eq('target_platform', targetPlatform)
    .maybeSingle()

  if (error) {
    log('warn', 'Relay row lookup failed', {
      message: error.message,
      messageId,
      targetPlatform,
    })
    return null
  }

  if (!data?.id) return null
  return {
    id: data.id as string,
    status: data.status as RelayRow['status'],
    created_at: data.created_at as string | undefined,
  }
}

function isStalePending(relay: RelayRow): boolean {
  if (relay.status !== 'pending' || !relay.created_at) return false
  return Date.now() - new Date(relay.created_at).getTime() >= STALE_PENDING_MS
}

/**
 * Reserve a relay row or skip if this message was already delivered to the target.
 * Webhook retries must not call Telegram/Max API twice for the same source message.
 */
async function reserveRelayRow(
  db: DbClient,
  input: { messageId: string; targetPlatform: MessengerPlatform; targetChatId: string },
): Promise<{ relayId: string; shouldSend: boolean } | null> {
  const existing = await loadRelayRow(db, input.messageId, input.targetPlatform)
  if (existing?.status === 'sent') {
    log('info', 'Relay skipped — already sent', {
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      relayId: existing.id,
    })
    return { relayId: existing.id, shouldSend: false }
  }

  if (existing?.status === 'pending') {
    if (!isStalePending(existing)) {
      log('info', 'Relay skipped — delivery in progress', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: existing.id,
      })
      return { relayId: existing.id, shouldSend: false }
    }
    log('info', 'Relay retry — stale pending reservation', {
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      relayId: existing.id,
    })
    return { relayId: existing.id, shouldSend: true }
  }

  if (existing?.status === 'failed') {
    return { relayId: existing.id, shouldSend: true }
  }

  const { data: inserted, error: insertError } = await db
    .from('message_relays')
    .insert({
      message_id: input.messageId,
      target_platform: input.targetPlatform,
      target_chat_id: input.targetChatId,
      status: 'pending',
    })
    .select('id')
    .single()

  if (!insertError && inserted?.id) {
    return { relayId: inserted.id as string, shouldSend: true }
  }

  if (isUniqueViolation(insertError)) {
    const raced = await loadRelayRow(db, input.messageId, input.targetPlatform)
    if (!raced) return null
    if (raced.status === 'sent') {
      log('info', 'Relay skipped — concurrent reservation', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: raced.id,
        status: raced.status,
      })
      return { relayId: raced.id, shouldSend: false }
    }
    if (raced.status === 'pending' && !isStalePending(raced)) {
      log('info', 'Relay skipped — concurrent reservation', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: raced.id,
        status: raced.status,
      })
      return { relayId: raced.id, shouldSend: false }
    }
    return {
      relayId: raced.id,
      shouldSend: raced.status === 'failed' || isStalePending(raced),
    }
  }

  log('warn', 'Relay row insert failed', {
    message: insertError?.message,
    messageId: input.messageId,
    targetPlatform: input.targetPlatform,
  })
  return null
}

/**
 * When a work group has both Telegram and Max bound, mirror the message to the other chat.
 * Skips loops via payload.apss_relay and by not relaying bot senders (caller responsibility).
 */
export async function relaySiblingChats(
  db: DbClient,
  config: MessengerConfig,
  input: RelaySiblingInput,
): Promise<void> {
  const { data: targets, error } = await db
    .from('messenger_connections')
    .select('platform, chat_id')
    .eq('work_group_id', input.workGroupId)
    .neq('platform', input.sourcePlatform)

  if (error) {
    log('warn', 'Relay lookup failed', { message: error.message, ...input })
    return
  }

  if (!targets?.length) return

  const relayText = formatRelayText(input)
  let anySent = false

  for (const target of targets) {
    const targetPlatform = target.platform as MessengerPlatform
    const targetChatId = String(target.chat_id ?? '').trim()
    if (!targetChatId || targetChatId === '0') {
      log('warn', 'Relay skipped — target chat id empty', {
        workGroupId: input.workGroupId,
        targetPlatform,
      })
      continue
    }

    const reserved = await reserveRelayRow(db, {
      messageId: input.messageId,
      targetPlatform,
      targetChatId,
    })
    if (!reserved) continue
    if (!reserved.shouldSend) continue

    const relayRowId = reserved.relayId

    try {
      const delivered = await deliverToBoundChat(db, config, {
        platform: targetPlatform,
        chatId: targetChatId,
        workGroupId: input.workGroupId,
        text: relayText,
      })

      await db
        .from('message_relays')
        .update({
          status: 'sent',
          target_chat_id: delivered.chatId,
          target_external_message_id: delivered.externalMessageId,
          relayed_at: new Date().toISOString(),
        })
        .eq('id', relayRowId)

      // Mirror into site history for the target thread (skipRelay via payload).
      await ingestChannelMessage(db, {
        platform: targetPlatform,
        externalChatId: delivered.chatId,
        externalMessageId: delivered.externalMessageId,
        authorName: input.fromOutbound
          ? (input.authorName ?? 'АПСС')
          : `↔ ${platformLabel(input.sourcePlatform)}`,
        authorExternalId: null,
        text: relayText,
        contentType: input.contentType === 'text' ? 'text' : 'other',
        payload: {
          apss_relay: true,
          from_platform: input.sourcePlatform,
          from_message_id: input.messageId,
        },
        sentAt: new Date().toISOString(),
        isEdit: false,
        skipRelay: true,
      })

      anySent = true
      log('info', 'Relayed message to sibling chat', {
        workGroupId: input.workGroupId,
        from: input.sourcePlatform,
        to: targetPlatform,
        targetChatId: delivered.chatId,
        externalMessageId: delivered.externalMessageId,
      })
    } catch (relayError) {
      const message = relayError instanceof Error ? relayError.message : String(relayError)
      await db.from('message_relays').update({ status: 'failed' }).eq('id', relayRowId)
      log('warn', 'Relay send failed', {
        workGroupId: input.workGroupId,
        from: input.sourcePlatform,
        to: targetPlatform,
        message,
      })
    }
  }

  if (anySent) {
    await db
      .from('messages')
      .update({ delivery_status: 'relayed' })
      .eq('id', input.messageId)
  }
}
