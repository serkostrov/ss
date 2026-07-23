import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type {
  TableInsert,
  TableRow,
  TableUpdate,
  WorkGroupStatus,
} from '../types/database'
import { dataService } from './data.service'
import {
  messengerConnectionsService,
  type MessengerConnection,
  type MessengerConnectionInput,
} from './messenger-connections.service'
import {
  workGroupMembersService,
  type WorkGroupMember,
  type WorkGroupMemberRepresentative,
} from './work-group-members.service'

export type WorkGroupRepresentativeRef = WorkGroupMemberRepresentative

export type { WorkGroupMember, WorkGroupMemberRepresentative }

/** @deprecated Prefer MessengerConnection — kept for WorkGroup embeds. */
export type WorkGroupMessengerConnection = Pick<
  MessengerConnection,
  'id' | 'platform' | 'chat_id' | 'chat_title' | 'bot_status' | 'connected_at' | 'last_error' | 'created_at'
>

export type WorkGroupCategoryRef = Pick<
  TableRow<'work_group_categories'>,
  'id' | 'name' | 'slug'
>

export type WorkGroup = TableRow<'work_groups'> & {
  responsible: WorkGroupRepresentativeRef | null
  category: WorkGroupCategoryRef | null
  members_count: number
  messenger_connections: WorkGroupMessengerConnection[]
}

export type WorkGroupInput = {
  name: string
  description?: string | null
  responsible_representative_id?: string | null
  category_id?: string | null
  status?: WorkGroupStatus
}

export type WorkGroupsListFilters = {
  search?: string
  status?: WorkGroupStatus | 'all'
  categoryId?: string | 'all'
}

const RESPONSIBLE_EMBED = `
  responsible:representatives!work_groups_responsible_representative_id_fkey (
    id,
    full_name,
    position,
    email,
    phone,
    is_active,
    company:companies (
      id,
      name
    )
  )
`

const LIST_SELECT = `
  id,
  name,
  description,
  responsible_representative_id,
  category_id,
  status,
  created_at,
  updated_at,
  category:work_group_categories (
    id,
    name,
    slug
  ),
  ${RESPONSIBLE_EMBED},
  work_group_members ( count ),
  messenger_connections (
    id,
    platform,
    chat_id,
    chat_title,
    bot_status,
    connected_at,
    last_error,
    created_at
  )
`

const DETAIL_SELECT = LIST_SELECT

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

type RawWorkGroup = TableRow<'work_groups'> & {
  responsible: WorkGroupRepresentativeRef | WorkGroupRepresentativeRef[] | null
  category: WorkGroupCategoryRef | WorkGroupCategoryRef[] | null
  work_group_members: Array<{ count: number }> | null
  messenger_connections: WorkGroupMessengerConnection[] | WorkGroupMessengerConnection | null
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

function normalizeResponsible(
  value: WorkGroupRepresentativeRef | WorkGroupRepresentativeRef[] | null | undefined,
): WorkGroupRepresentativeRef | null {
  const rep = firstRelation(value)
  if (!rep) return null
  const companyRaw = rep.company as
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null
    | undefined
  return {
    id: rep.id,
    full_name: rep.full_name,
    position: rep.position ?? null,
    email: rep.email ?? null,
    phone: rep.phone ?? null,
    is_active: rep.is_active,
    company: firstRelation(companyRaw),
  }
}

function normalizeMessenger(
  value: WorkGroupMessengerConnection[] | WorkGroupMessengerConnection | null | undefined,
): WorkGroupMessengerConnection[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalize(row: RawWorkGroup): WorkGroup {
  const countRow = row.work_group_members?.[0]
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    responsible_representative_id: row.responsible_representative_id,
    category_id: row.category_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    responsible: normalizeResponsible(row.responsible),
    category: firstRelation(row.category),
    members_count: countRow?.count ?? 0,
    messenger_connections: normalizeMessenger(row.messenger_connections),
  }
}

/**
 * Admin work groups. Messenger tables are read for status badges;
 * connect/relay lives in apps/messenger worker later.
 */
export const workGroupsService = {
  async list(filters: WorkGroupsListFilters = {}): Promise<WorkGroup[]> {
    let query = supabaseClient
      .from('work_groups')
      .select(LIST_SELECT)
      .order('name', { ascending: true })

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    if (filters.categoryId && filters.categoryId !== 'all') {
      query = query.eq('category_id', filters.categoryId)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [`name.ilike."${pattern}"`, `description.ilike."${pattern}"`].join(','),
        )
      }
    }

    const result = (await query) as unknown as QueryResult<RawWorkGroup[]>
    return assertResult(result).map(normalize)
  },

  async getById(id: string): Promise<WorkGroup | null> {
    const result = (await supabaseClient
      .from('work_groups')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle()) as unknown as QueryResult<RawWorkGroup | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },

  async create(input: WorkGroupInput): Promise<WorkGroup> {
    const payload: TableInsert<'work_groups'> = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      responsible_representative_id: input.responsible_representative_id || null,
      category_id: input.category_id || null,
      status: input.status ?? 'active',
    }

    const created = await dataService.insert('work_groups', payload)
    const full = await this.getById(created.id)
    if (!full) throw new ApiError('Группа создана, но не найдена', { code: 'unknown' })
    return full
  },

  async update(id: string, input: WorkGroupInput): Promise<WorkGroup> {
    const payload: TableUpdate<'work_groups'> = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      responsible_representative_id: input.responsible_representative_id || null,
      category_id: input.category_id || null,
      status: input.status,
      updated_at: new Date().toISOString(),
    }

    await dataService.updateById('work_groups', id, payload)
    const full = await this.getById(id)
    if (!full) throw new ApiError('Группа не найдена', { code: 'not_found' })
    return full
  },

  async setStatus(id: string, status: WorkGroupStatus): Promise<WorkGroup> {
    await dataService.updateById('work_groups', id, {
      status,
      updated_at: new Date().toISOString(),
    })
    const full = await this.getById(id)
    if (!full) throw new ApiError('Группа не найдена', { code: 'not_found' })
    return full
  },

  async delete(id: string): Promise<void> {
    await dataService.deleteById('work_groups', id)
  },

  listMembers(workGroupId: string, search?: string) {
    return workGroupMembersService.list(workGroupId, { search })
  },

  addMember(workGroupId: string, representativeId: string) {
    return workGroupMembersService.add(workGroupId, representativeId)
  },

  removeMember(memberId: string) {
    return workGroupMembersService.remove(memberId)
  },

  bulkAddMembers(workGroupId: string, representativeIds: string[]) {
    return workGroupMembersService.bulkAdd(workGroupId, representativeIds)
  },

  listMessengerConnections(workGroupId: string) {
    return messengerConnectionsService.listByWorkGroup(workGroupId)
  },

  upsertMessengerConnection(input: {
    workGroupId: string
    platform: MessengerConnectionInput['platform']
    chatId: string
    chatTitle?: string | null
    botStatus?: MessengerConnectionInput['bot_status']
    lastError?: string | null
  }) {
    return messengerConnectionsService.upsert({
      work_group_id: input.workGroupId,
      platform: input.platform,
      chat_id: input.chatId,
      chat_title: input.chatTitle,
      bot_status: input.botStatus,
      last_error: input.lastError,
    })
  },
}
