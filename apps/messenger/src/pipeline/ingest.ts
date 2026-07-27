import type { DbClient } from '../db.js'
import { log, type IngestMessageInput } from '../types.js'

/**
 * Persist a channel post when the chat is bound to a work group.
 * Unbound channels update nothing here (catalog handled separately).
 */
export async function ingestChannelMessage(
  db: DbClient,
  input: IngestMessageInput,
): Promise<'stored' | 'updated' | 'skipped'> {
  const { data: connection, error: connectionError } = await db
    .from('messenger_connections')
    .select('id, work_group_id, bot_status')
    .eq('platform', input.platform)
    .eq('chat_id', input.externalChatId)
    .maybeSingle()

  if (connectionError) {
    log('error', 'Failed to lookup messenger connection', {
      platform: input.platform,
      chatId: input.externalChatId,
      message: connectionError.message,
    })
    throw connectionError
  }

  if (!connection) {
    return 'skipped'
  }

  const row = {
    work_group_id: connection.work_group_id as string,
    source: input.platform,
    external_chat_id: input.externalChatId,
    external_message_id: input.externalMessageId,
    author_name: input.authorName ?? null,
    author_external_id: input.authorExternalId ?? null,
    text: input.text,
    content_type: input.contentType,
    payload: input.payload ?? {},
    sent_at: input.sentAt,
    delivery_status: 'stored' as const,
  }

  if (input.isEdit) {
    const { data: existing, error: findError } = await db
      .from('messages')
      .select('id')
      .eq('work_group_id', row.work_group_id)
      .eq('source', row.source)
      .eq('external_message_id', row.external_message_id)
      .maybeSingle()

    if (findError) throw findError

    if (existing?.id) {
      const { error: updateError } = await db
        .from('messages')
        .update({
          text: row.text,
          content_type: row.content_type,
          payload: row.payload,
          author_name: row.author_name,
          author_external_id: row.author_external_id,
          sent_at: row.sent_at,
          delivery_status: 'stored',
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
      return 'updated'
    }
  }

  const { error: upsertError } = await db.from('messages').upsert(row, {
    onConflict: 'work_group_id,source,external_message_id',
    ignoreDuplicates: false,
  })

  if (upsertError) {
    log('error', 'Failed to upsert message', {
      platform: input.platform,
      messageId: input.externalMessageId,
      message: upsertError.message,
    })
    throw upsertError
  }

  if (connection.bot_status !== 'connected') {
    await db
      .from('messenger_connections')
      .update({
        bot_status: 'connected',
        connected_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', connection.id)
  }

  return input.isEdit ? 'updated' : 'stored'
}
