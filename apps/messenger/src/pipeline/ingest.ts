import type { DbClient } from '../db.js'
import { log, type IngestMessageInput } from '../types.js'

export type IngestStoredItem = {
  workGroupId: string
  messageId: string
}

export type IngestResult =
  | { status: 'skipped' }
  | { status: 'stored' | 'updated'; items: IngestStoredItem[] }

async function persistForWorkGroup(
  db: DbClient,
  workGroupId: string,
  input: IngestMessageInput,
): Promise<{ status: 'stored' | 'updated'; messageId: string }> {
  const row = {
    work_group_id: workGroupId,
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
      return { status: 'updated', messageId: existing.id as string }
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
      workGroupId,
      message: upsertError.message,
    })
    throw upsertError
  }

  const { data: stored, error: loadError } = await db
    .from('messages')
    .select('id')
    .eq('work_group_id', row.work_group_id)
    .eq('source', row.source)
    .eq('external_message_id', row.external_message_id)
    .maybeSingle()

  if (loadError) throw loadError
  if (!stored?.id) {
    throw new Error('message_upsert_missing_id')
  }

  return {
    status: input.isEdit ? 'updated' : 'stored',
    messageId: stored.id as string,
  }
}

/**
 * Persist a message for every work group that has this chat bound.
 */
export async function ingestChannelMessage(
  db: DbClient,
  input: IngestMessageInput,
): Promise<IngestResult> {
  const { data: connections, error: connectionError } = await db
    .from('messenger_connections')
    .select('id, work_group_id, bot_status')
    .eq('platform', input.platform)
    .eq('chat_id', input.externalChatId)

  if (connectionError) {
    log('error', 'Failed to lookup messenger connection', {
      platform: input.platform,
      chatId: input.externalChatId,
      message: connectionError.message,
    })
    throw connectionError
  }

  if (!connections?.length) {
    return { status: 'skipped' }
  }

  const items: IngestStoredItem[] = []
  let lastStatus: 'stored' | 'updated' = 'stored'

  for (const connection of connections) {
    const workGroupId = connection.work_group_id as string
    const persisted = await persistForWorkGroup(db, workGroupId, input)
    lastStatus = persisted.status
    items.push({ workGroupId, messageId: persisted.messageId })

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
  }

  return { status: lastStatus, items }
}
