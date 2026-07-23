import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type {
  DeliveryStatus,
  MessageSource,
  RelayStatus,
  TableRow,
} from '../types/database'

export type MessageRelay = Pick<
  TableRow<'message_relays'>,
  'id' | 'target_platform' | 'target_chat_id' | 'status' | 'relayed_at' | 'created_at'
>

export type MessageWorkGroupRef = {
  id: string
  name: string
}

export type Message = Omit<TableRow<'messages'>, never> & {
  work_group: MessageWorkGroupRef | null
  relays: MessageRelay[]
}

export type MessagesListFilters = {
  search?: string
  workGroupId?: string | 'all'
  source?: MessageSource | 'all'
  deliveryStatus?: DeliveryStatus | 'all'
  page?: number
  pageSize?: number
}

export type MessagesListResult = {
  items: Message[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20

const MESSAGE_SELECT = `
  id,
  work_group_id,
  source,
  external_chat_id,
  external_message_id,
  author_name,
  author_external_id,
  text,
  sent_at,
  delivery_status,
  created_at,
  work_groups (
    id,
    name
  ),
  message_relays (
    id,
    target_platform,
    target_chat_id,
    status,
    relayed_at,
    created_at
  )
`

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
  count?: number | null
}

type RawMessage = TableRow<'messages'> & {
  work_groups: MessageWorkGroupRef | MessageWorkGroupRef[] | null
  message_relays: MessageRelay[] | null
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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalize(row: RawMessage): Message {
  const relays = [...(row.message_relays ?? [])].sort((a, b) =>
    a.target_platform.localeCompare(b.target_platform),
  )

  return {
    id: row.id,
    work_group_id: row.work_group_id,
    source: row.source,
    external_chat_id: row.external_chat_id,
    external_message_id: row.external_message_id,
    author_name: row.author_name,
    author_external_id: row.author_external_id,
    text: row.text,
    sent_at: row.sent_at,
    delivery_status: row.delivery_status,
    created_at: row.created_at,
    work_group: firstRelation(row.work_groups),
    relays,
  }
}

/**
 * Read-only message history for admin (and RLS-scoped member peek later).
 */
export const messagesService = {
  async list(filters: MessagesListFilters = {}): Promise<MessagesListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabaseClient
      .from('messages')
      .select(MESSAGE_SELECT, { count: 'exact' })
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filters.workGroupId && filters.workGroupId !== 'all') {
      query = query.eq('work_group_id', filters.workGroupId)
    }
    if (filters.source && filters.source !== 'all') {
      query = query.eq('source', filters.source)
    }
    if (filters.deliveryStatus && filters.deliveryStatus !== 'all') {
      query = query.eq('delivery_status', filters.deliveryStatus)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [
            `text.ilike."${pattern}"`,
            `author_name.ilike."${pattern}"`,
            `external_message_id.ilike."${pattern}"`,
            `author_external_id.ilike."${pattern}"`,
          ].join(','),
        )
      }
    }

    const result = (await query) as unknown as QueryResult<RawMessage[]>
    const rows = assertResult(result)

    return {
      items: rows.map(normalize),
      total: result.count ?? rows.length,
      page,
      pageSize,
    }
  },

  async getById(id: string): Promise<Message | null> {
    const result = (await supabaseClient
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('id', id)
      .maybeSingle()) as unknown as QueryResult<RawMessage | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },
}

export type { DeliveryStatus, MessageSource, RelayStatus }
