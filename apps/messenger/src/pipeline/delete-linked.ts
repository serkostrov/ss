import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { deleteFromPlatform } from '../outbound/deliver.js'
import { log, type MessengerPlatform } from '../types.js'

type MessageRow = {
  id: string
  work_group_id: string
  source: MessengerPlatform
  external_chat_id: string
  external_message_id: string
  payload: Record<string, unknown> | null
}

const MESSAGE_SELECT =
  'id, work_group_id, source, external_chat_id, external_message_id, payload' as const

async function loadMessageById(db: DbClient, id: string): Promise<MessageRow | null> {
  const { data, error } = await db
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as MessageRow | null) ?? null
}

async function loadMirrorsByFromMessageId(
  db: DbClient,
  workGroupId: string,
  fromMessageId: string,
): Promise<MessageRow[]> {
  const { data, error } = await db
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('work_group_id', workGroupId)
    .filter('payload->>from_message_id', 'eq', fromMessageId)

  if (error) throw error
  return (data as MessageRow[] | null) ?? []
}

/**
 * Collect original + relayed copies linked via message_relays / payload.from_message_id.
 */
async function collectLinkedMessages(db: DbClient, start: MessageRow): Promise<MessageRow[]> {
  const byId = new Map<string, MessageRow>()
  const queue: MessageRow[] = [start]

  while (queue.length) {
    const msg = queue.shift()!
    if (byId.has(msg.id)) continue
    byId.set(msg.id, msg)

    const fromId = String(
      (msg.payload as { from_message_id?: string } | null)?.from_message_id ?? '',
    ).trim()
    if (fromId && !byId.has(fromId)) {
      const parent = await loadMessageById(db, fromId)
      if (parent) queue.push(parent)
    }

    for (const child of await loadMirrorsByFromMessageId(db, msg.work_group_id, msg.id)) {
      if (!byId.has(child.id)) queue.push(child)
    }

    const { data: relays, error: relayError } = await db
      .from('message_relays')
      .select('target_platform, target_external_message_id')
      .eq('message_id', msg.id)

    if (relayError) throw relayError

    for (const relay of relays ?? []) {
      const externalId = String(relay.target_external_message_id ?? '').trim()
      if (!externalId) continue
      const { data: mirror, error } = await db
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('work_group_id', msg.work_group_id)
        .eq('source', relay.target_platform)
        .eq('external_message_id', externalId)
        .maybeSingle()
      if (error) throw error
      if (mirror && !byId.has((mirror as MessageRow).id)) {
        queue.push(mirror as MessageRow)
      }
    }
  }

  return [...byId.values()]
}

export type DeleteLinkedInput = {
  workGroupId: string
  platform: MessengerPlatform
  chatId: string
  externalMessageId: string
  messageId?: string | null
  /** Platforms where the message is already deleted (e.g. Max message_removed webhook). */
  alreadyDeletedOn?: MessengerPlatform[]
}

/**
 * Delete a message on its platform and all cross-relayed copies (Telegram ↔ Max).
 */
export async function deleteLinkedAcrossPlatforms(
  db: DbClient,
  config: MessengerConfig,
  input: DeleteLinkedInput,
): Promise<{ deletedIds: string[] }> {
  const externalMessageId = input.externalMessageId.trim()
  if (!externalMessageId && !input.messageId?.trim()) {
    const err = new Error('invalid_external_message_id')
    ;(err as Error & { status: number }).status = 400
    throw err
  }

  let start: MessageRow | null = null
  if (input.messageId?.trim()) {
    start = await loadMessageById(db, input.messageId.trim())
  }
  if (!start && externalMessageId) {
    const { data, error } = await db
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('work_group_id', input.workGroupId)
      .eq('source', input.platform)
      .eq('external_message_id', externalMessageId)
      .maybeSingle()
    if (error) throw error
    start = (data as MessageRow | null) ?? null
  }

  const already = new Set(input.alreadyDeletedOn ?? [])

  if (!start) {
    if (!already.has(input.platform) && externalMessageId) {
      try {
        await deleteFromPlatform(config, input.platform, input.chatId, externalMessageId)
      } catch (error) {
        log('warn', 'Delete on platform failed (no local row)', {
          platform: input.platform,
          chatId: input.chatId,
          externalMessageId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { deletedIds: [] }
  }

  const cluster = await collectLinkedMessages(db, start)

  for (const msg of cluster) {
    if (already.has(msg.source)) continue
    try {
      await deleteFromPlatform(
        config,
        msg.source,
        msg.external_chat_id,
        msg.external_message_id,
      )
    } catch (error) {
      log('warn', 'Linked delete on platform failed', {
        platform: msg.source,
        chatId: msg.external_chat_id,
        externalMessageId: msg.external_message_id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const ids = cluster.map((msg) => msg.id)
  if (ids.length) {
    const { error } = await db.from('messages').delete().in('id', ids)
    if (error) throw error
  }

  log('info', 'Linked messages deleted across platforms', {
    workGroupId: input.workGroupId,
    count: ids.length,
    ids,
  })

  return { deletedIds: ids }
}

/**
 * Max `message_removed` — find local rows by mid and wipe Telegram mirrors too.
 */
export async function deleteLinkedByExternalMessageId(
  db: DbClient,
  config: MessengerConfig,
  platform: MessengerPlatform,
  externalMessageId: string,
): Promise<void> {
  const mid = externalMessageId.trim()
  if (!mid) return

  const { data: rows, error } = await db
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('source', platform)
    .eq('external_message_id', mid)

  if (error) throw error
  if (!rows?.length) {
    log('info', 'message_removed with no local row', { platform, externalMessageId: mid })
    return
  }

  for (const row of rows as MessageRow[]) {
    await deleteLinkedAcrossPlatforms(db, config, {
      workGroupId: row.work_group_id,
      platform: row.source,
      chatId: row.external_chat_id,
      externalMessageId: row.external_message_id,
      messageId: row.id,
      alreadyDeletedOn: [platform],
    })
  }
}
