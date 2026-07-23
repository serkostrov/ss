import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableRow, UserStatus } from '../types/database'

export type RegistrationRepresentative = Pick<
  TableRow<'representatives'>,
  'id' | 'full_name' | 'email' | 'phone' | 'position' | 'company_id' | 'is_primary' | 'is_active'
> & {
  company: Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'> | null
}

export type RegistrationApplication = TableRow<'users'> & {
  representative: RegistrationRepresentative | null
}

export type RegistrationListFilters = {
  status?: UserStatus | 'all'
  search?: string
}

export type RepresentativeOption = {
  id: string
  fullName: string
  email: string | null
  companyId: string
  companyName: string
  linkedUserId: string | null
}

export type CompanyOption = {
  id: string
  name: string
  accessStatus: TableRow<'companies'>['access_status']
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

const APPLICATION_SELECT = `
  id,
  email,
  role,
  representative_id,
  status,
  full_name,
  phone,
  company_name_hint,
  company_inn_hint,
  pd_consent_at,
  created_at,
  representative:representatives (
    id,
    full_name,
    email,
    phone,
    position,
    company_id,
    is_primary,
    is_active,
    company:companies (
      id,
      name,
      access_status
    )
  )
`

/**
 * Admin registrations / member applications access layer.
 */
export const registrationsService = {
  async list(filters: RegistrationListFilters = {}): Promise<RegistrationApplication[]> {
    let query = supabaseClient
      .from('users')
      .select(APPLICATION_SELECT)
      .eq('role', 'member')
      .order('created_at', { ascending: false })

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [
            `full_name.ilike."${pattern}"`,
            `email.ilike."${pattern}"`,
            `phone.ilike."${pattern}"`,
            `company_name_hint.ilike."${pattern}"`,
            `company_inn_hint.ilike."${pattern}"`,
          ].join(','),
        )
      }
    }

    const result = (await query) as QueryResult<RegistrationApplication[]>
    return assertResult(result)
  },

  async getById(userId: string): Promise<RegistrationApplication | null> {
    const result = (await supabaseClient
      .from('users')
      .select(APPLICATION_SELECT)
      .eq('id', userId)
      .eq('role', 'member')
      .maybeSingle()) as QueryResult<RegistrationApplication | null>

    return assertResult(result)
  },

  async listRepresentatives(search?: string): Promise<RepresentativeOption[]> {
    let query = supabaseClient
      .from('representatives')
      .select(
        `
        id,
        full_name,
        email,
        company_id,
        is_active,
        company:companies ( id, name ),
        user:users!users_representative_id_fkey ( id )
      `,
      )
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(100)

    const term = search?.trim()
    if (term) {
      const pattern = `%${term}%`
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
    }

    const result = (await query) as QueryResult<
      Array<{
        id: string
        full_name: string
        email: string | null
        company_id: string
        company: { id: string; name: string } | null
        user: { id: string } | { id: string }[] | null
      }>
    >

    const rows = assertResult(result)
    return rows.map((row) => {
      const linked = Array.isArray(row.user) ? row.user[0] : row.user
      return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        companyId: row.company_id,
        companyName: row.company?.name ?? 'Без компании',
        linkedUserId: linked?.id ?? null,
      }
    })
  },

  async listCompanies(search?: string): Promise<CompanyOption[]> {
    let query = supabaseClient
      .from('companies')
      .select('id, name, access_status')
      .order('name', { ascending: true })
      .limit(100)

    const term = search?.trim()
    if (term) {
      query = query.ilike('name', `%${term}%`)
    }

    const result = (await query) as QueryResult<
      Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'>>
    >
    const rows = assertResult(result)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      accessStatus: row.access_status,
    }))
  },
}
