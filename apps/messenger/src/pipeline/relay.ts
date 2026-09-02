import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { deliverToBoundChat } from '../outbound/deliver.js'
import {
  contentPlaceholder,
  log,
  type MessageContentType,
  type MessengerPlatform,
} from '../types.js'
import {
  isAmbiguousSendError,
  isUniqueViolation,
  sourceFingerprint,
} from './dedup.js'
import { ingestChannelMessage } from './ingest.js'

export type RelaySiblingInput = {
  workGroupId: string
  sourcePlatform: MessengerPlatform
  sourceChatId: string
  sourceExternalMessageId: string
  messageId: string
  text: string
  contentType: MessageContentType
  authorName?: string | null
}

type RelayRow = {
  id: string
  status: 'pending' | 'sent' | 'failed'
  target_external_message_id?: string | null
}

const BACKLOG_MIN_AGE_MS = 30_000

function isRelayEchoPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as { apss_relay?: boolean; outbound?: boolean }
  return Boolean(record.apss_relay || record.outbound)
}

export function formatAttributedText(
  authorName: string | null | undefined,
  body: string,
): string {
  const content = body.trim()
  const who = authorName?.trim()
  if (!who) return content
  if (!content) return `${who}:`
  return `${who}:\n${content}`
}

function formatRelayText(input: RelaySiblingInput): string {
  const body =
    input.text.trim() || contentPlaceholder(input.contentType) || '[Сообщение]'
  return formatAttributedText(input.authorName, body)
}

async function loadRelayRow(
  db: DbClient,
  input: { messageId: string; targetPlatform: MessengerPlatform; fingerprint: string; targetChatId: string },
): Promise<RelayRow | null> {
  const { data: byMessage, error: byMessageError } = await db
    .from('message_relays')
    .select('id, status, target_external_message_id')
    .eq('message_id', input.messageId)
    .eq('target_platform', input.targetPlatform)
    .maybeSingle()

  if (byMessageError) {
    log('warn', 'Relay row lookup failed', {
      message: byMessageError.message,
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
    })
  } else if (byMessage?.id) {
    return {
      id: byMessage.id as string,
      status: byMessage.status as RelayRow['status'],
      target_external_message_id: (byMessage.target_external_message_id as string | null) ?? null,
    }
  }

  const { data: byFingerprint, error: fingerprintError } = await db
    .from('message_relays')
    .select('id, status, target_external_message_id')
    .eq('source_fingerprint', input.fingerprint)
    .eq('target_platform', input.targetPlatform)
    .eq('target_chat_id', input.targetChatId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (fingerprintError) {
    if (!/source_fingerprint|42703/.test(`${fingerprintError.code ?? ''} ${fingerprintError.message}`)) {
      log('warn', 'Relay fingerprint lookup failed', {
        message: fingerprintError.message,
        fingerprint: input.fingerprint,
        targetPlatform: input.targetPlatform,
      })
    }
    return null
  }

  const fingerprintRow = byFingerprint?.[0]
  if (!fingerprintRow?.id) return null
  return {
    id: fingerprintRow.id as string,
    status: fingerprintRow.status as RelayRow['status'],
    target_external_message_id: (fingerprintRow.target_external_message_id as string | null) ?? null,
  }
}

/**
 * Claim the right to send exactly once per (source message, target chat).
 * Parallel webhooks and a second work group bound to the same chats share this claim.
 */
async function reserveRelayRow(
  db: DbClient,
  input: {
    messageId: string
    targetPlatform: MessengerPlatform
    targetChatId: string
    fingerprint: string
  },
): Promise<{ relayId: string; shouldSend: boolean } | null> {
  const existing = await loadRelayRow(db, input)
  if (existing) {
    if (existing.status === 'sent' || existing.target_external_message_id) {
      log('info', 'Relay skipped — already sent', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: existing.id,
      })
      return { relayId: existing.id, shouldSend: false }
    }
    if (existing.status === 'pending') {
      log('info', 'Relay skipped — delivery in progress or unknown', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: existing.id,
      })
      return { relayId: existing.id, shouldSend: false }
    }
    if (existing.status === 'failed') {
      const { data: claimed, error: claimError } = await db
        .from('message_relays')
        .update({
          status: 'pending',
          target_chat_id: input.targetChatId,
          source_fingerprint: input.fingerprint,
        })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .select('id')
        .maybeSingle()

      if (claimError || !claimed?.id) {
        return { relayId: existing.id, shouldSend: false }
      }
      return { relayId: existing.id, shouldSend: true }
    }
  }

  const insertPayload: Record<string, unknown> = {
    message_id: input.messageId,
    target_platform: input.targetPlatform,
    target_chat_id: input.targetChatId,
    status: 'pending',
    source_fingerprint: input.fingerprint,
  }

  let { data: inserted, error: insertError } = await db
    .from('message_relays')
    .insert(insertPayload)
    .select('id')
    .maybeSingle()

  if (insertError && /source_fingerprint|42703/.test(`${insertError.code ?? ''} ${insertError.message}`)) {
    delete insertPayload.source_fingerprint
    const fallback = await db.from('message_relays').insert(insertPayload).select('id').maybeSingle()
    inserted = fallback.data
    insertError = fallback.error
  }

  if (!insertError && inserted?.id) {
    return { relayId: inserted.id as string, shouldSend: true }
  }

  if (isUniqueViolation(insertError)) {
    const raced = await loadRelayRow(db, input)
    if (!raced) return null
    const skip = raced.status === 'sent' || raced.status === 'pending' || Boolean(raced.target_external_message_id)
    log('info', skip ? 'Relay skipped — concurrent reservation' : 'Relay claim after conflict', {
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      relayId: raced.id,
      status: raced.status,
    })
    return { relayId: raced.id, shouldSend: !skip && raced.status === 'failed' }
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

  const fingerprint = sourceFingerprint(input.sourcePlatform, input.sourceExternalMessageId)
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
      fingerprint,
    })
    if (!reserved?.shouldSend) continue

    const relayRowId = reserved.relayId

    try {
      // One POST only. Retrying after timeout duplicates the message on the platform.
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
          source_fingerprint: fingerprint,
          relayed_at: new Date().toISOString(),
        })
        .eq('id', relayRowId)

      try {
        await ingestChannelMessage(db, {
          platform: targetPlatform,
          externalChatId: delivered.chatId,
          externalMessageId: delivered.externalMessageId,
          authorName: input.authorName?.trim() || null,
          authorExternalId: null,
          text: input.text.trim() || contentPlaceholder(input.contentType) || '[Сообщение]',
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
      } catch (mirrorError) {
        log('warn', 'Relay mirror ingest failed (message already delivered)', {
          workGroupId: input.workGroupId,
          from: input.sourcePlatform,
          to: targetPlatform,
          message:
            mirrorError instanceof Error ? mirrorError.message : String(mirrorError),
        })
      }

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
      if (isAmbiguousSendError(relayError)) {
        // May already be delivered. Leave `pending` so we never send a second copy.
        log('warn', 'Relay send outcome unknown — not retrying', {
          workGroupId: input.workGroupId,
          from: input.sourcePlatform,
          to: targetPlatform,
          message,
        })
        continue
      }

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

/**
 * Retry messages that were stored but never marked relayed (failed relay, crash mid-flight, etc.).
 * Ignores very fresh rows so a parallel webhook cannot send a second copy of the same message.
 */
export async function retryUndeliveredRelaysForWorkGroup(
  db: DbClient,
  config: MessengerConfig,
  workGroupId: string,
): Promise<void> {
  const { data: connections, error: connectionError } = await db
    .from('messenger_connections')
    .select('platform')
    .eq('work_group_id', workGroupId)

  if (connectionError) {
    log('warn', 'Undelivered relay lookup failed', {
      workGroupId,
      message: connectionError.message,
    })
    return
  }

  const platforms = new Set((connections ?? []).map((row) => row.platform))
  if (platforms.size < 2) return

  const cutoff = new Date(Date.now() - BACKLOG_MIN_AGE_MS).toISOString()
  const { data: backlog, error: backlogError } = await db
    .from('messages')
    .select(
      'id, source, external_chat_id, external_message_id, text, content_type, author_name, payload',
    )
    .eq('work_group_id', workGroupId)
    .eq('delivery_status', 'stored')
    .lt('sent_at', cutoff)
    .order('sent_at', { ascending: true })
    .limit(15)

  if (backlogError) {
    log('warn', 'Undelivered relay backlog lookup failed', {
      workGroupId,
      message: backlogError.message,
    })
    return
  }

  for (const row of backlog ?? []) {
    const sourcePlatform = row.source as MessengerPlatform
    if (!platforms.has(sourcePlatform)) continue
    if (isRelayEchoPayload(row.payload)) continue

    const hasSibling = [...platforms].some((platform) => platform !== sourcePlatform)
    if (!hasSibling) continue

    try {
      await relaySiblingChats(db, config, {
        workGroupId,
        sourcePlatform,
        sourceChatId: String(row.external_chat_id ?? ''),
        sourceExternalMessageId: String(row.external_message_id ?? ''),
        messageId: row.id as string,
        text: String(row.text ?? ''),
        contentType: (row.content_type as MessageContentType) ?? 'text',
        authorName: row.author_name as string | null,
      })
    } catch (retryError) {
      log('warn', 'Undelivered relay retry failed', {
        workGroupId,
        messageId: row.id,
        message: retryError instanceof Error ? retryError.message : String(retryError),
      })
    }
  }
}
