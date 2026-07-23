import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { BotStatus, MessengerPlatform, TableRow } from '../types/database'
import { auditService } from './audit.service'

export type MessengerConnection = Pick<
  TableRow<'messenger_connections'>,
  | 'id'
  | 'work_group_id'
  | 'platform'
  | 'chat_id'
  | 'chat_title'
  | 'bot_status'
  | 'connected_at'
  | 'last_error'
  | 'created_at'
>

export type MessengerConnectionInput = {
  work_group_id: string
  platform: MessengerPlatform
  chat_id: string
  chat_title?: string | null
  bot_status?: BotStatus
  last_error?: string | null
}

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

const CONNECTION_SELECT =
  'id, work_group_id, platform, chat_id, chat_title, bot_status, connected_at, last_error, created_at' as const

function assertResult<T>(result: QueryResult<T>): T {
  if (result.error) {
    throw new ApiError(result.error.message, {
      code: result.error.code === '23505' ? 'conflict' : 'unknown',
      details: result.error,
      cause: result.error,
    })
  }
  return result.data
}

/**
 * Admin CRUD for messenger_connections (Telegram / Max chat binding).
 * Does not talk to bots — only the table used by worker later.
 */
export const messengerConnectionsService = {
  async listByWorkGroup(workGroupId: string): Promise<MessengerConnection[]> {
    const result = (await supabaseClient
      .from('messenger_connections')
      .select(CONNECTION_SELECT)
      .eq('work_group_id', workGroupId)
      .order('platform', { ascending: true })) as QueryResult<MessengerConnection[]>

    return assertResult(result)
  },

  async getById(id: string): Promise<MessengerConnection | null> {
    const result = (await supabaseClient
      .from('messenger_connections')
      .select(CONNECTION_SELECT)
      .eq('id', id)
      .maybeSingle()) as QueryResult<MessengerConnection | null>

    return assertResult(result)
  },

  async getByPlatform(
    workGroupId: string,
    platform: MessengerPlatform,
  ): Promise<MessengerConnection | null> {
    const result = (await supabaseClient
      .from('messenger_connections')
      .select(CONNECTION_SELECT)
      .eq('work_group_id', workGroupId)
      .eq('platform', platform)
      .maybeSingle()) as QueryResult<MessengerConnection | null>

    return assertResult(result)
  },

  async upsert(input: MessengerConnectionInput): Promise<MessengerConnection> {
    const chatId = input.chat_id.trim()
    if (!chatId) {
      throw new ApiError('Укажите идентификатор чата', { code: 'validation' })
    }

    const existing = await this.getByPlatform(input.work_group_id, input.platform)
    const botStatus = input.bot_status ?? existing?.bot_status ?? 'pending'
    const lastError =
      botStatus === 'error'
        ? (input.last_error?.trim() || existing?.last_error || null)
        : input.last_error === undefined
          ? botStatus === 'connected'
            ? null
            : (existing?.last_error ?? null)
          : input.last_error?.trim() || null

    let connectedAt: string | null = null
    if (botStatus === 'connected') {
      connectedAt = existing?.connected_at ?? new Date().toISOString()
    }

    const result = (await supabaseClient
      .from('messenger_connections')
      .upsert(
        {
          work_group_id: input.work_group_id,
          platform: input.platform,
          chat_id: chatId,
          chat_title: input.chat_title?.trim() || null,
          bot_status: botStatus,
          last_error: lastError,
          connected_at: connectedAt,
        },
        { onConflict: 'work_group_id,platform' },
      )
      .select(CONNECTION_SELECT)
      .single()) as QueryResult<MessengerConnection>

    try {
      const row = assertResult(result)
      void auditService.log({
        action: 'messenger_connections.upsert',
        entity_type: 'messenger_connections',
        entity_id: row.id,
        payload: {
          work_group_id: row.work_group_id,
          platform: row.platform,
          bot_status: row.bot_status,
        },
      })
      return row
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') {
        throw new ApiError('Для этой платформы канал уже привязан', {
          code: 'conflict',
          cause: error,
        })
      }
      throw error
    }
  },

  async update(
    id: string,
    input: Partial<Omit<MessengerConnectionInput, 'work_group_id' | 'platform'>> & {
      platform?: MessengerPlatform
    },
  ): Promise<MessengerConnection> {
    const existing = await this.getById(id)
    if (!existing) {
      throw new ApiError('Подключение не найдено', { code: 'not_found' })
    }

    const botStatus = input.bot_status ?? existing.bot_status
    const chatId = input.chat_id !== undefined ? input.chat_id.trim() : existing.chat_id
    if (!chatId) {
      throw new ApiError('Укажите идентификатор чата', { code: 'validation' })
    }

    let connectedAt = existing.connected_at
    if (botStatus === 'connected') {
      connectedAt = existing.connected_at ?? new Date().toISOString()
    } else if (input.bot_status && input.bot_status !== 'connected') {
      connectedAt = null
    }

    const lastError =
      input.last_error !== undefined
        ? input.last_error?.trim() || null
        : botStatus === 'connected'
          ? null
          : existing.last_error

    const result = (await supabaseClient
      .from('messenger_connections')
      .update({
        chat_id: chatId,
        chat_title:
          input.chat_title !== undefined
            ? input.chat_title?.trim() || null
            : existing.chat_title,
        bot_status: botStatus,
        last_error: lastError,
        connected_at: connectedAt,
      })
      .eq('id', id)
      .select(CONNECTION_SELECT)
      .single()) as QueryResult<MessengerConnection>

    const row = assertResult(result)
    void auditService.log({
      action: 'messenger_connections.update',
      entity_type: 'messenger_connections',
      entity_id: row.id,
      payload: {
        work_group_id: row.work_group_id,
        platform: row.platform,
        bot_status: row.bot_status,
      },
    })
    return row
  },

  async delete(id: string): Promise<void> {
    const result = (await supabaseClient
      .from('messenger_connections')
      .delete()
      .eq('id', id)) as QueryResult<null>

    assertResult(result)
    void auditService.log({
      action: 'messenger_connections.delete',
      entity_type: 'messenger_connections',
      entity_id: id,
    })
  },
}
