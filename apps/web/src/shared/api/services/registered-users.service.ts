import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import { rpcService } from './rpc.service'
import type { TableRow, UserRole, UserStatus } from '../types/database'

export type RegisteredUserRepresentative = Pick<
  TableRow<'representatives'>,
  'id' | 'full_name' | 'position' | 'company_id'
> & {
  company: Pick<TableRow<'companies'>, 'id' | 'name' | 'inn' | 'access_status'> | null
}

export type RegisteredUser = Pick<
  TableRow<'users'>,
  | 'id'
  | 'email'
  | 'role'
  | 'status'
  | 'full_name'
  | 'phone'
  | 'staff_position'
  | 'is_ceo'
  | 'can_manage_work_groups'
  | 'company_name_hint'
  | 'company_inn_hint'
  | 'created_at'
> & {
  representative: RegisteredUserRepresentative | null
}

export type AdminUpdateUserInput = {
  userId: string
  email?: string | null
  fullName?: string | null
  phone?: string | null
  status?: UserStatus | null
  role?: UserRole | null
  password?: string | null
  staffPosition?: string | null
  isCeo?: boolean | null
  canManageWorkGroups?: boolean | null
  companyNameHint?: string | null
  companyInnHint?: string | null
}

export type RegisteredUsersListFilters = {
  search?: string
  role?: UserRole | 'all'
  status?: UserStatus | 'all'
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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function mapRepresentative(raw: unknown): RegisteredUserRepresentative | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string') return null
  const companyRaw = row.company
  const company = firstRelation(
    companyRaw as
      | Pick<TableRow<'companies'>, 'id' | 'name' | 'inn' | 'access_status'>
      | Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'inn' | 'access_status'>>
      | null
      | undefined,
  )
  return {
    id: row.id,
    full_name: typeof row.full_name === 'string' ? row.full_name : '',
    position: typeof row.position === 'string' ? row.position : null,
    company_id: typeof row.company_id === 'string' ? row.company_id : '',
    company,
  }
}

function mapUser(raw: unknown): RegisteredUser | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.email !== 'string') return null
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    full_name: typeof row.full_name === 'string' ? row.full_name : null,
    phone: typeof row.phone === 'string' ? row.phone : null,
    staff_position: typeof row.staff_position === 'string' ? row.staff_position : null,
    is_ceo: row.is_ceo === true,
    can_manage_work_groups: row.can_manage_work_groups !== false,
    company_name_hint: typeof row.company_name_hint === 'string' ? row.company_name_hint : null,
    company_inn_hint: typeof row.company_inn_hint === 'string' ? row.company_inn_hint : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    representative: mapRepresentative(row.representative),
  }
}

const USER_SELECT = `
  id,
  email,
  role,
  status,
  full_name,
  phone,
  staff_position,
  is_ceo,
  can_manage_work_groups,
  company_name_hint,
  company_inn_hint,
  created_at,
  representative:representatives (
    id,
    full_name,
    position,
    company_id,
    company:companies (
      id,
      name,
      inn,
      access_status
    )
  )
`

function companyLabel(user: RegisteredUser): string {
  return user.representative?.company?.name ?? user.company_name_hint ?? ''
}

function searchHaystack(user: RegisteredUser): string {
  return [
    user.full_name,
    user.email,
    user.phone,
    user.staff_position,
    user.company_name_hint,
    user.company_inn_hint,
    user.representative?.company?.name,
    user.representative?.company?.inn,
    user.representative?.full_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export const registeredUsersService = {
  async list(filters: RegisteredUsersListFilters = {}): Promise<RegisteredUser[]> {
    let query = supabaseClient
      .from('users')
      .select(USER_SELECT)
      .order('created_at', { ascending: false })

    if (filters.role && filters.role !== 'all') {
      query = query.eq('role', filters.role)
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search
        .replace(/[%_,()"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [
            `full_name.ilike."${pattern}"`,
            `email.ilike."${pattern}"`,
            `phone.ilike."${pattern}"`,
            `company_name_hint.ilike."${pattern}"`,
            `company_inn_hint.ilike."${pattern}"`,
            `staff_position.ilike."${pattern}"`,
          ].join(','),
        )
      }
    }

    const result = (await query) as QueryResult<unknown[]>
    let rows = assertResult(result)
      .map(mapUser)
      .filter((item): item is RegisteredUser => Boolean(item))

    if (search) {
      const term = search.toLowerCase()
      rows = rows.filter((user) => searchHaystack(user).includes(term))
    }

    return rows
  },

  companyLabel,

  async update(input: AdminUpdateUserInput): Promise<RegisteredUser> {
    const row = await rpcService.call('admin_update_user', {
      p_user_id: input.userId,
      p_email: input.email ?? null,
      p_full_name: input.fullName ?? null,
      p_phone: input.phone ?? null,
      p_status: input.status ?? null,
      p_role: input.role ?? null,
      p_password: input.password ?? null,
      p_staff_position: input.staffPosition ?? null,
      p_is_ceo: input.isCeo ?? null,
      p_can_manage_work_groups: input.canManageWorkGroups ?? null,
      p_company_name_hint: input.companyNameHint ?? null,
      p_company_inn_hint: input.companyInnHint ?? null,
    })

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      full_name: row.full_name,
      phone: row.phone,
      staff_position: row.staff_position,
      is_ceo: row.is_ceo,
      can_manage_work_groups: row.can_manage_work_groups,
      company_name_hint: row.company_name_hint,
      company_inn_hint: row.company_inn_hint,
      created_at: row.created_at,
      representative: null,
    }
  },

  async delete(userId: string): Promise<void> {
    await rpcService.call('admin_delete_user', { p_user_id: userId })
  },
}
