import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableRow, UserStatus } from '../types/database'

export type StaffUser = Pick<
  TableRow<'users'>,
  | 'id'
  | 'email'
  | 'full_name'
  | 'status'
  | 'staff_position'
  | 'is_ceo'
  | 'can_manage_work_groups'
  | 'created_at'
>

export type PromoteStaffInput = {
  userId: string
  staffPosition?: string | null
  isCeo?: boolean
  canManageWorkGroups?: boolean
}

export type UpdateStaffInput = {
  userId: string
  fullName?: string | null
  staffPosition?: string | null
  isCeo?: boolean | null
  canManageWorkGroups?: boolean | null
}

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

function mapStaff(row: TableRow<'users'>): StaffUser {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    status: row.status,
    staff_position: row.staff_position,
    is_ceo: row.is_ceo,
    can_manage_work_groups: row.can_manage_work_groups,
    created_at: row.created_at,
  }
}

export const staffService = {
  async list(): Promise<StaffUser[]> {
    const result = (await supabaseClient.rpc('list_staff_users')) as QueryResult<
      TableRow<'users'>[]
    >
    return assertResult(result).map(mapStaff)
  },

  async promote(input: PromoteStaffInput): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('promote_to_staff', {
      p_user_id: input.userId,
      p_staff_position: input.staffPosition ?? null,
      p_is_ceo: input.isCeo ?? false,
      p_can_manage_work_groups: input.canManageWorkGroups ?? true,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  async update(input: UpdateStaffInput): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('update_staff_profile', {
      p_user_id: input.userId,
      p_full_name: input.fullName,
      p_staff_position: input.staffPosition,
      p_is_ceo: input.isCeo,
      p_can_manage_work_groups: input.canManageWorkGroups,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  async setStatus(
    userId: string,
    status: Extract<UserStatus, 'confirmed' | 'blocked'>,
  ): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('set_staff_status', {
      p_user_id: userId,
      p_status: status,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  /** Candidates: members that can be promoted (pending or confirmed). */
  async listPromoteCandidates(search?: string): Promise<
    Array<Pick<TableRow<'users'>, 'id' | 'email' | 'full_name' | 'status'>>
  > {
    let query = supabaseClient
      .from('users')
      .select('id, email, full_name, status')
      .eq('role', 'member')
      .order('full_name', { ascending: true })
      .limit(50)

    const term = search?.trim()
    if (term) {
      const pattern = `%${term}%`
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    }

    const result = (await query) as QueryResult<
      Array<Pick<TableRow<'users'>, 'id' | 'email' | 'full_name' | 'status'>>
    >
    return assertResult(result)
  },
}
