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

    const { data: relayRow, error: insertError } = await db
      .from('message_relays')
      .insert({
        message_id: input.messageId,
        target_platform: targetPlatform,
        target_chat_id: targetChatId,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError || !relayRow?.id) {
      log('warn', 'Relay row insert failed', {
        message: insertError?.message,
        targetPlatform,
        messageId: input.messageId,
      })
      continue
    }

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
        .eq('id', relayRow.id)

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
      await db
        .from('message_relays')
        .update({ status: 'failed' })
        .eq('id', relayRow.id)
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
