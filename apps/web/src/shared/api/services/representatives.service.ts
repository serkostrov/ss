import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableRow } from '../types/database'
import { rpcService } from './rpc.service'

export type RepresentativeCompanyRef = Pick<
  TableRow<'companies'>,
  'id' | 'name' | 'access_status'
>

export type Representative = TableRow<'representatives'> & {
  company: RepresentativeCompanyRef | null
  linked_user_id: string | null
}

export type RepresentativeInput = {
  id?: string
  company_id: string
  full_name: string
  position?: string | null
  phone?: string | null
  email?: string | null
  /** Kept for DB RPC compatibility; always true from app forms. */
  pd_consent?: boolean
  is_primary?: boolean
  is_active?: boolean
}

export type RepresentativesListFilters = {
  search?: string
  companyId?: string | 'all'
  active?: 'all' | 'active' | 'inactive'
  primary?: 'all' | 'primary' | 'secondary'
}

export type MemberAssignCandidate = {
  user_id: string
  email: string
  full_name: string | null
  status: TableRow<'users'>['status']
  representative_id: string | null
  current_company_id: string | null
  current_company_name: string | null
}

export type AssignMemberToCompanyInput = {
  userId: string
  companyId: string
  isPrimary?: boolean
  position?: string | null
}

/** Narrow select — avoid over-fetching company columns. */
const REPRESENTATIVE_SELECT = `
  id,
  company_id,
  full_name,
  position,
  phone,
  email,
  pd_consent,
  pd_consent_date,
  is_primary,
  is_active,
  created_at,
  updated_at,
  company:companies (
    id,
    name,
    access_status
  ),
  user:users!users_representative_id_fkey (
    id
  )
`

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

type RawRepresentativeRow = TableRow<'representatives'> & {
  company: RepresentativeCompanyRef | RepresentativeCompanyRef[] | null
  user: { id: string } | { id: string }[] | null
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

function normalize(row: RawRepresentativeRow): Representative {
  const company = Array.isArray(row.company) ? row.company[0] : row.company
  const user = Array.isArray(row.user) ? row.user[0] : row.user
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    position: row.position,
    phone: row.phone,
    email: row.email,
    pd_consent: row.pd_consent,
    pd_consent_date: row.pd_consent_date,
    is_primary: row.is_primary,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company: company ?? null,
    linked_user_id: user?.id ?? null,
  }
}

/**
 * Admin representatives access layer with lean selects and server filters.
 */
export const representativesService = {
  async listOptions(): Promise<
    Array<{
      id: string
      full_name: string
      is_active: boolean
      company: { id: string; name: string } | null
    }>
  > {
    const result = (await supabaseClient
      .from('representatives')
      .select(
        `
        id,
        full_name,
        is_active,
        company:companies (
          id,
          name
        )
      `,
      )
      .eq('is_active', true)
      .order('full_name', { ascending: true })) as QueryResult<
      Array<{
        id: string
        full_name: string
        is_active: boolean
        company: { id: string; name: string } | { id: string; name: string }[] | null
      }>
    >

    return assertResult(result).map((row) => ({
      id: row.id,
      full_name: row.full_name,
      is_active: row.is_active,
      company: Array.isArray(row.company) ? (row.company[0] ?? null) : row.company,
    }))
  },

  async list(filters: RepresentativesListFilters = {}): Promise<Representative[]> {
    let query = supabaseClient
      .from('representatives')
      .select(REPRESENTATIVE_SELECT)
      .order('full_name', { ascending: true })

    if (filters.companyId && filters.companyId !== 'all') {
      query = query.eq('company_id', filters.companyId)
    }

    if (filters.active === 'active') {
      query = query.eq('is_active', true)
    } else if (filters.active === 'inactive') {
      query = query.eq('is_active', false)
    }

    if (filters.primary === 'primary') {
      query = query.eq('is_primary', true)
    } else if (filters.primary === 'secondary') {
      query = query.eq('is_primary', false)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [`full_name.ilike."${pattern}"`, `email.ilike."${pattern}"`, `phone.ilike."${pattern}"`].join(
            ',',
          ),
        )
      }
    }

    const result = (await query) as QueryResult<RawRepresentativeRow[]>
    return assertResult(result).map(normalize)
  },

  async listByCompany(companyId: string): Promise<Representative[]> {
    return this.list({ companyId, active: 'all' })
  },

  async listAssignCandidates(
    companyId: string,
    search?: string,
  ): Promise<MemberAssignCandidate[]> {
    const rows = await rpcService.call('list_member_assign_candidates', {
      p_company_id: companyId,
      p_search: search?.trim() || null,
    })
    return (rows ?? []).map((row) => ({
      user_id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      status: row.status,
      representative_id: row.representative_id,
      current_company_id: row.current_company_id,
      current_company_name: row.current_company_name,
    }))
  },

  async assignMember(input: AssignMemberToCompanyInput): Promise<Representative> {
    const row = await rpcService.call('assign_member_to_company', {
      p_user_id: input.userId,
      p_company_id: input.companyId,
      p_is_primary: input.isPrimary ?? false,
      p_position: input.position ?? null,
    })
    const full = await this.getById(row.id)
    if (!full) {
      throw new ApiError('Участник назначен, но представитель не найден', { code: 'unknown' })
    }
    return full
  },

  async getById(id: string): Promise<Representative | null> {
    const result = (await supabaseClient
      .from('representatives')
      .select(REPRESENTATIVE_SELECT)
      .eq('id', id)
      .maybeSingle()) as QueryResult<RawRepresentativeRow | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },

  async upsert(input: RepresentativeInput): Promise<Representative> {
    const row = await rpcService.call('upsert_representative', {
      p_id: input.id ?? null,
      p_company_id: input.company_id,
      p_full_name: input.full_name,
      p_position: input.position ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_pd_consent: input.pd_consent ?? true,
      p_is_primary: input.is_primary ?? false,
      p_is_active: input.is_active ?? true,
    })

    const full = await this.getById(row.id)
    if (!full) {
      throw new ApiError('Представитель сохранён, но не найден', { code: 'unknown' })
    }
    return full
  },

  async setPrimary(id: string): Promise<Representative> {
    const row = await rpcService.call('set_primary_representative', {
      p_representative_id: id,
    })
    const full = await this.getById(row.id)
    if (!full) {
      throw new ApiError('Представитель не найден', { code: 'not_found' })
    }
    return full
  },

  async setActive(id: string, isActive: boolean): Promise<Representative> {
    const current = await this.getById(id)
    if (!current) {
      throw new ApiError('Представитель не найден', { code: 'not_found' })
    }

    return this.upsert({
      id,
      company_id: current.company_id,
      full_name: current.full_name,
      position: current.position,
      phone: current.phone,
      email: current.email,
      pd_consent: current.pd_consent,
      is_primary: isActive ? current.is_primary : false,
      is_active: isActive,
    })
  },

  async delete(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) {
      throw new ApiError('Представитель не найден', { code: 'not_found' })
    }
    if (current.linked_user_id) {
      throw new ApiError(
        'Нельзя удалить представителя, привязанного к учётной записи. Сначала отвяжите пользователя.',
        { code: 'conflict' },
      )
    }

    const result = (await supabaseClient.from('representatives').delete().eq('id', id)) as QueryResult<
      unknown
    >
    assertResult(result)
  },
}
