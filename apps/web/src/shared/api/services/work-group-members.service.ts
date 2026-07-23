import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow } from '../types/database'
import { authService } from './auth.service'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type WorkGroupMemberRepresentative = {
  id: string
  full_name: string
  position: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  company: { id: string; name: string } | null
}

export type WorkGroupMember = {
  id: string
  work_group_id: string
  representative_id: string
  added_by: string | null
  created_at: string
  representative: WorkGroupMemberRepresentative | null
}

export type WorkGroupMemberCandidate = {
  id: string
  full_name: string
  position: string | null
  email: string | null
  is_active: boolean
  company: { id: string; name: string } | null
}

export type WorkGroupMembersListFilters = {
  search?: string
}

export type WorkGroupMemberCandidatesFilters = {
  search?: string
  /** Limit candidates payload (default 100). */
  limit?: number
}

export type BulkAddWorkGroupMembersResult = {
  inserted: number
  requested: number
  skipped: number
}

const MEMBER_SELECT = `
  id,
  work_group_id,
  representative_id,
  added_by,
  created_at,
  representative:representatives (
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

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

type RawMember = TableRow<'work_group_members'> & {
  representative:
    | (Omit<WorkGroupMemberRepresentative, 'company'> & {
        company: { id: string; name: string } | { id: string; name: string }[] | null
      })
    | Array<
        Omit<WorkGroupMemberRepresentative, 'company'> & {
          company: { id: string; name: string } | { id: string; name: string }[] | null
        }
      >
    | null
}

function assertResult<T>(result: QueryResult<T>): T {
  if (result.error) {
    const code =
      result.error.code === '23505'
        ? 'conflict'
        : result.error.code === '42501'
          ? 'forbidden'
          : 'unknown'
    throw new ApiError(
      code === 'conflict'
        ? 'Представитель уже состоит в этой группе'
        : result.error.message,
      {
        code,
        details: result.error,
        cause: result.error,
      },
    )
  }
  return result.data
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function normalizeMember(row: RawMember): WorkGroupMember {
  const rep = firstRelation(row.representative)
  return {
    id: row.id,
    work_group_id: row.work_group_id,
    representative_id: row.representative_id,
    added_by: row.added_by,
    created_at: row.created_at,
    representative: rep
      ? {
          id: rep.id,
          full_name: rep.full_name,
          position: rep.position,
          email: rep.email,
          phone: rep.phone,
          is_active: rep.is_active,
          company: firstRelation(rep.company),
        }
      : null,
  }
}

function matchesSearch(
  haystack: Array<string | null | undefined>,
  search: string,
): boolean {
  const q = search.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return true
  return haystack
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

/**
 * CRUD for work_group_members with duplicate-safe bulk add.
 */
export const workGroupMembersService = {
  async listMemberIds(workGroupId: string): Promise<string[]> {
    const result = (await supabaseClient
      .from('work_group_members')
      .select('representative_id')
      .eq('work_group_id', workGroupId)) as QueryResult<
      Array<{ representative_id: string }>
    >

    return assertResult(result).map((row) => row.representative_id)
  },

  async list(
    workGroupId: string,
    filters: WorkGroupMembersListFilters = {},
  ): Promise<WorkGroupMember[]> {
    const result = (await supabaseClient
      .from('work_group_members')
      .select(MEMBER_SELECT)
      .eq('work_group_id', workGroupId)
      .order('created_at', { ascending: true })) as unknown as QueryResult<RawMember[]>

    const rows = assertResult(result).map(normalizeMember)
    const search = filters.search?.trim()
    if (!search) return rows

    return rows.filter((member) =>
      matchesSearch(
        [
          member.representative?.full_name,
          member.representative?.position,
          member.representative?.email,
          member.representative?.company?.name,
        ],
        search,
      ),
    )
  },

  async getById(memberId: string): Promise<WorkGroupMember | null> {
    const result = (await supabaseClient
      .from('work_group_members')
      .select(MEMBER_SELECT)
      .eq('id', memberId)
      .maybeSingle()) as unknown as QueryResult<RawMember | null>

    const row = assertResult(result)
    return row ? normalizeMember(row) : null
  },

  async add(workGroupId: string, representativeId: string): Promise<WorkGroupMember> {
    const existingIds = await this.listMemberIds(workGroupId)
    if (existingIds.includes(representativeId)) {
      throw new ApiError('Представитель уже состоит в этой группе', { code: 'conflict' })
    }

    const user = await authService.getUser()
    const payload: TableInsert<'work_group_members'> = {
      work_group_id: workGroupId,
      representative_id: representativeId,
      added_by: user?.id ?? null,
    }

    try {
      const inserted = await dataService.insert('work_group_members', payload)
      const full = await this.getById(inserted.id)
      if (!full) throw new ApiError('Участник добавлен, но не найден', { code: 'unknown' })
      return full
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') throw error
      const message = error instanceof Error ? error.message : ''
      if (/duplicate|unique|23505/i.test(message)) {
        throw new ApiError('Представитель уже состоит в этой группе', { code: 'conflict' })
      }
      throw error
    }
  },

  /**
   * One RPC round-trip. Duplicates and unknown IDs are skipped; returns insert count.
   */
  async bulkAdd(
    workGroupId: string,
    representativeIds: string[],
  ): Promise<BulkAddWorkGroupMembersResult> {
    const uniqueIds = [...new Set(representativeIds.filter(Boolean))]
    if (!uniqueIds.length) {
      throw new ApiError('Выберите хотя бы одного представителя', { code: 'validation' })
    }

    const user = await authService.getUser()
    const inserted = await rpcService.call('bulk_add_work_group_members', {
      p_work_group_id: workGroupId,
      p_representative_ids: uniqueIds,
      p_added_by: user?.id ?? null,
    })

    const count = typeof inserted === 'number' ? inserted : Number(inserted ?? 0)
    return {
      inserted: count,
      requested: uniqueIds.length,
      skipped: Math.max(0, uniqueIds.length - count),
    }
  },

  async remove(memberId: string): Promise<void> {
    await dataService.deleteById('work_group_members', memberId)
  },

  async removeMany(memberIds: string[]): Promise<number> {
    const unique = [...new Set(memberIds.filter(Boolean))]
    if (!unique.length) return 0

    const result = (await supabaseClient
      .from('work_group_members')
      .delete()
      .in('id', unique)
      .select('id')) as QueryResult<Array<{ id: string }>>

    return assertResult(result).length
  },

  /**
   * Active representatives not yet in the group — light select + exclude by IDs.
   */
  async listCandidates(
    workGroupId: string,
    filters: WorkGroupMemberCandidatesFilters = {},
  ): Promise<WorkGroupMemberCandidate[]> {
    const memberIds = await this.listMemberIds(workGroupId)
    const limit = filters.limit ?? 100

    let query = supabaseClient
      .from('representatives')
      .select(
        `
        id,
        full_name,
        position,
        email,
        is_active,
        company:companies (
          id,
          name
        )
      `,
      )
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(limit)

    if (memberIds.length) {
      query = query.not('id', 'in', `(${memberIds.join(',')})`)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [`full_name.ilike."${pattern}"`, `email.ilike."${pattern}"`, `position.ilike."${pattern}"`].join(
            ',',
          ),
        )
      }
    }

    const result = (await query) as unknown as QueryResult<
      Array<{
        id: string
        full_name: string
        position: string | null
        email: string | null
        is_active: boolean
        company: { id: string; name: string } | { id: string; name: string }[] | null
      }>
    >

    return assertResult(result).map((row) => ({
      id: row.id,
      full_name: row.full_name,
      position: row.position,
      email: row.email,
      is_active: row.is_active,
      company: firstRelation(row.company),
    }))
  },
}
