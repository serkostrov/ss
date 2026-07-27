import type { DbClient } from '../db.js'
import { log, type UpsertBotChannelInput } from '../types.js'

export async function upsertBotChannel(db: DbClient, input: UpsertBotChannelInput): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db.from('messenger_bot_channels').upsert(
    {
      platform: input.platform,
      external_chat_id: input.externalChatId,
      title: input.title ?? null,
      username: input.username ?? null,
      chat_kind: input.chatKind,
      is_active: input.isActive,
      last_seen_at: input.lastSeenAt ?? now,
      updated_at: now,
    },
    { onConflict: 'platform,external_chat_id' },
  )

  if (error) {
    log('error', 'Failed to upsert bot channel', {
      platform: input.platform,
      chatId: input.externalChatId,
      message: error.message,
    })
    throw error
  }
}

export async function markBotChannelInactive(
  db: DbClient,
  platform: UpsertBotChannelInput['platform'],
  externalChatId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from('messenger_bot_channels')
    .update({
      is_active: false,
      last_seen_at: now,
      updated_at: now,
    })
    .eq('platform', platform)
    .eq('external_chat_id', externalChatId)

  if (error) {
    log('error', 'Failed to deactivate bot channel', {
      platform,
      chatId: externalChatId,
      message: error.message,
    })
    throw error
  }
}
