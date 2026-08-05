import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { MessengerPlatform, TableRow } from '../types/database'

export type MessengerBotChannel = TableRow<'messenger_bot_channels'>

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

function assertResult<T>(result: QueryResult<T>): T {
  if (result.error) {
    throw new ApiError(result.error.message, {
      code: 'unknown',
      details: result.error,
      cause: result.error,
    })
  }
  return result.data
}

/**
 * Chats where the APSS bot is present (channel / group / DM) — filled by messenger worker.
 */
export const messengerBotChannelsService = {
  async listActiveChannels(platform: MessengerPlatform): Promise<MessengerBotChannel[]> {
    const result = (await supabaseClient
      .from('messenger_bot_channels')
      .select(
        `
        id,
        platform,
        external_chat_id,
        title,
        username,
        chat_kind,
        is_active,
        last_seen_at,
        created_at,
        updated_at
      `,
      )
      .eq('platform', platform)
      .eq('is_active', true)
      // Same shapes as Telegram: channel / group / DM — hide ambiguous "other" leftovers.
      .in('chat_kind', ['channel', 'group', 'supergroup', 'private'])
      .order('title', { ascending: true, nullsFirst: false })
      .order('external_chat_id', { ascending: true })) as QueryResult<MessengerBotChannel[]>

    return assertResult(result).filter((channel) => {
      const id = channel.external_chat_id?.trim()
      return Boolean(id) && id !== '0'
    })
  },
}
