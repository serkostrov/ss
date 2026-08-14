import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableRow, UserStatus } from '../types/database'

export type StaffUser = {
  id: string
  email: string
  full_name: string | null
  status: UserStatus
  staff_position: string | null
  is_ceo: boolean
  can_manage_work_groups: boolean
  created_at: string
  representative_id: string | null
  company_id: string | null
  company_name: string | null
  company_position: string | null
  is_primary: boolean
}

export type PromoteStaffInput = {
  userId: string
  staffPosition?: string | null
  isCeo?: boolean
  canManageWorkGroups?: boolean
  companyId?: string | null
  companyPosition?: string | null
  isPrimary?: boolean
}

export type UpdateStaffInput = {
  userId: string
  fullName?: string | null
  staffPosition?: string | null
  isCeo?: boolean | null
  canManageWorkGroups?: boolean | null
}

export type DemoteStaffInput = {
  userId: string
  companyId?: string | null
  position?: string | null
  isPrimary?: boolean
}

export type BindStaffCompanyInput = {
  userId: string
  companyId: string
  position?: string | null
  isPrimary?: boolean
}

type StaffListRow = {
  id: string
  email: string
  full_name: string | null
  status: UserStatus
  staff_position: string | null
  is_ceo: boolean
  can_manage_work_groups: boolean
  created_at: string
  representative_id: string | null
  company_id: string | null
  company_name: string | null
  company_position: string | null
  is_primary: boolean
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

function mapStaff(row: StaffListRow | TableRow<'users'>): StaffUser {
  const extended = row as StaffListRow
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    status: row.status,
    staff_position: row.staff_position,
    is_ceo: row.is_ceo,
    can_manage_work_groups: row.can_manage_work_groups,
    created_at: row.created_at,
    representative_id: extended.representative_id ?? null,
    company_id: extended.company_id ?? null,
    company_name: extended.company_name ?? null,
    company_position: extended.company_position ?? null,
    is_primary: extended.is_primary ?? false,
  }
}

export const staffService = {
  async list(): Promise<StaffUser[]> {
    const result = (await supabaseClient.rpc('list_staff_users')) as QueryResult<StaffListRow[]>
    return assertResult(result).map(mapStaff)
  },

  async promote(input: PromoteStaffInput): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('promote_to_staff', {
      p_user_id: input.userId,
      p_staff_position: input.staffPosition ?? null,
      p_is_ceo: input.isCeo ?? false,
      p_can_manage_work_groups: input.canManageWorkGroups ?? true,
    })) as QueryResult<TableRow<'users'>>
    const promoted = mapStaff(assertResult(result))

    if (!input.companyId) return promoted

    return this.bindCompany({
      userId: input.userId,
      companyId: input.companyId,
      position: input.companyPosition ?? null,
      isPrimary: input.isPrimary ?? false,
    })
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

  async demote(input: DemoteStaffInput): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('demote_from_staff', {
      p_user_id: input.userId,
      p_company_id: input.companyId ?? null,
      p_position: input.position ?? null,
      p_is_primary: input.isPrimary ?? false,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  async bindCompany(input: BindStaffCompanyInput): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('bind_staff_to_company', {
      p_user_id: input.userId,
      p_company_id: input.companyId,
      p_position: input.position ?? null,
      p_is_primary: input.isPrimary ?? false,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  async unbindCompany(userId: string): Promise<StaffUser> {
    const result = (await supabaseClient.rpc('unbind_staff_from_company', {
      p_user_id: userId,
    })) as QueryResult<TableRow<'users'>>
    return mapStaff(assertResult(result))
  },

  /** Candidates: members that can be promoted (pending or confirmed). */
  async listPromoteCandidates(
    search?: string,
  ): Promise<Array<Pick<TableRow<'users'>, 'id' | 'email' | 'full_name' | 'status'>>> {
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
