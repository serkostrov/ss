import type { DbClient } from '../db.js'
import { log, type IngestMessageInput } from '../types.js'
import { isUniqueViolation } from './dedup.js'

export type IngestStoredItem = {
  workGroupId: string
  messageId: string
  status: 'stored' | 'updated' | 'duplicate'
}

export type IngestResult =
  | { status: 'skipped' }
  | { status: 'stored' | 'updated' | 'duplicate'; items: IngestStoredItem[] }

async function loadMessageId(
  db: DbClient,
  workGroupId: string,
  source: string,
  externalMessageId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('messages')
    .select('id')
    .eq('work_group_id', workGroupId)
    .eq('source', source)
    .eq('external_message_id', externalMessageId)
    .maybeSingle()

  if (error) throw error
  return data?.id ? (data.id as string) : null
}

async function persistForWorkGroup(
  db: DbClient,
  workGroupId: string,
  input: IngestMessageInput,
): Promise<{ status: 'stored' | 'updated' | 'duplicate'; messageId: string }> {
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
    const existingId = await loadMessageId(
      db,
      workGroupId,
      row.source,
      row.external_message_id,
    )

    if (existingId) {
      const { error: updateError } = await db
        .from('messages')
        .update({
          text: row.text,
          content_type: row.content_type,
          payload: row.payload,
          author_name: row.author_name,
          author_external_id: row.author_external_id,
          sent_at: row.sent_at,
        })
        .eq('id', existingId)

      if (updateError) throw updateError
      return { status: 'updated', messageId: existingId }
    }
  }

  const { data: inserted, error: insertError } = await db
    .from('messages')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (!insertError && inserted?.id) {
    return { status: 'stored', messageId: inserted.id as string }
  }

  if (isUniqueViolation(insertError)) {
    const existingId = await loadMessageId(
      db,
      workGroupId,
      row.source,
      row.external_message_id,
    )
    if (existingId) {
      return { status: 'duplicate', messageId: existingId }
    }
  }

  if (insertError) {
    log('error', 'Failed to insert message', {
      platform: input.platform,
      messageId: input.externalMessageId,
      workGroupId,
      message: insertError.message,
      code: insertError.code,
    })
    throw insertError
  }

  const storedId = await loadMessageId(
    db,
    workGroupId,
    row.source,
    row.external_message_id,
  )
  if (!storedId) {
    throw new Error('message_insert_missing_id')
  }

  return { status: 'stored', messageId: storedId }
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
  let lastStatus: 'stored' | 'updated' | 'duplicate' = 'stored'

  for (const connection of connections) {
    const workGroupId = connection.work_group_id as string
    const persisted = await persistForWorkGroup(db, workGroupId, input)
    lastStatus = persisted.status
    items.push({
      workGroupId,
      messageId: persisted.messageId,
      status: persisted.status,
    })

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
