import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
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
  | 'company_name_hint'
  | 'company_inn_hint'
  | 'created_at'
> & {
  representative: RegisteredUserRepresentative | null
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
}
