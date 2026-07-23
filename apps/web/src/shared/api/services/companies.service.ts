import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { CompanyAccessStatus, TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'

export type CompanyLevelRef = Pick<
  TableRow<'participation_levels'>,
  'id' | 'name' | 'is_active' | 'sort_order'
>

export type Company = TableRow<'companies'> & {
  participation_level: CompanyLevelRef | null
  representatives_count?: number
}

export type CompanyInput = {
  name: string
  inn?: string | null
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  participation_level_id?: string | null
  access_status?: CompanyAccessStatus
  notes?: string | null
}

export type CompaniesListFilters = {
  search?: string
  accessStatus?: CompanyAccessStatus | 'all'
  levelId?: string | 'all'
}

const COMPANY_SELECT = `
  id,
  name,
  inn,
  description,
  phone,
  email,
  website,
  address,
  participation_level_id,
  access_status,
  notes,
  created_at,
  updated_at,
  participation_level:participation_levels (
    id,
    name,
    is_active,
    sort_order
  )
`

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

function normalizeCompany(row: Company): Company {
  return {
    ...row,
    participation_level: row.participation_level ?? null,
  }
}

/**
 * Admin companies access layer.
 */
export const companiesService = {
  async listOptions(): Promise<Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'>>> {
    const result = (await supabaseClient
      .from('companies')
      .select('id, name, access_status')
      .order('name', { ascending: true })) as QueryResult<
      Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'>>
    >
    return assertResult(result)
  },

  async list(filters: CompaniesListFilters = {}): Promise<Company[]> {
    let query = supabaseClient
      .from('companies')
      .select(COMPANY_SELECT)
      .order('name', { ascending: true })

    if (filters.accessStatus && filters.accessStatus !== 'all') {
      query = query.eq('access_status', filters.accessStatus)
    }

    if (filters.levelId && filters.levelId !== 'all') {
      query = query.eq('participation_level_id', filters.levelId)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [
            `name.ilike."${pattern}"`,
            `inn.ilike."${pattern}"`,
            `email.ilike."${pattern}"`,
            `phone.ilike."${pattern}"`,
            `address.ilike."${pattern}"`,
          ].join(','),
        )
      }
    }

    const result = (await query) as QueryResult<Company[]>
    return assertResult(result).map(normalizeCompany)
  },

  async getById(id: string): Promise<Company | null> {
    const result = (await supabaseClient
      .from('companies')
      .select(COMPANY_SELECT)
      .eq('id', id)
      .maybeSingle()) as QueryResult<Company | null>

    const row = assertResult(result)
    if (!row) return null

    const reps = await supabaseClient
      .from('representatives')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)

    return normalizeCompany({
      ...row,
      representatives_count: reps.count ?? 0,
    })
  },

  async create(input: CompanyInput): Promise<Company> {
    const payload: TableInsert<'companies'> = {
      name: input.name.trim(),
      inn: input.inn?.trim() || null,
      description: input.description?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      website: input.website?.trim() || null,
      address: input.address?.trim() || null,
      participation_level_id: input.participation_level_id || null,
      access_status: input.access_status ?? 'active',
      notes: input.notes?.trim() || null,
    }

    const created = await dataService.insert('companies', payload)
    const full = await this.getById(created.id)
    if (!full) {
      throw new ApiError('Компания создана, но не найдена', { code: 'unknown' })
    }
    return full
  },

  async update(id: string, input: CompanyInput): Promise<Company> {
    const payload: TableUpdate<'companies'> = {
      name: input.name.trim(),
      inn: input.inn?.trim() || null,
      description: input.description?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      website: input.website?.trim() || null,
      address: input.address?.trim() || null,
      participation_level_id: input.participation_level_id || null,
      access_status: input.access_status,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    await dataService.updateById('companies', id, payload)
    const full = await this.getById(id)
    if (!full) {
      throw new ApiError('Компания не найдена', { code: 'not_found' })
    }
    return full
  },

  /** Member: update public profile fields of own company (level/status/notes ignored by DB trigger). */
  async updateOwnProfile(
    id: string,
    input: Pick<
      CompanyInput,
      'name' | 'inn' | 'description' | 'phone' | 'email' | 'website' | 'address'
    >,
  ): Promise<Company> {
    const payload: TableUpdate<'companies'> = {
      name: input.name.trim(),
      inn: input.inn?.trim() || null,
      description: input.description?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      website: input.website?.trim() || null,
      address: input.address?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    await dataService.updateById('companies', id, payload)
    const full = await this.getById(id)
    if (!full) {
      throw new ApiError('Компания не найдена', { code: 'not_found' })
    }
    return full
  },

  async setAccessStatus(id: string, accessStatus: CompanyAccessStatus): Promise<Company> {
    await dataService.updateById('companies', id, {
      access_status: accessStatus,
      updated_at: new Date().toISOString(),
    })
    const full = await this.getById(id)
    if (!full) {
      throw new ApiError('Компания не найдена', { code: 'not_found' })
    }
    return full
  },

  async delete(id: string): Promise<void> {
    await dataService.deleteById('companies', id)
  },
}
