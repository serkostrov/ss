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

export type CompanyCommentAuthor = Pick<TableRow<'users'>, 'id' | 'full_name' | 'email'>

export type CompanyComment = TableRow<'company_comments'> & {
  author: CompanyCommentAuthor | null
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
  balance?: number
}

export type CompanySortBy = 'name' | 'balance_asc' | 'balance_desc' | 'auto_id'
export type CompanyBalanceFilter = 'all' | 'positive' | 'zero' | 'negative'

export type CompaniesListFilters = {
  search?: string
  accessStatus?: CompanyAccessStatus | 'all'
  levelId?: string | 'all'
  balanceFilter?: CompanyBalanceFilter
  sortBy?: CompanySortBy
}

const COMPANY_SELECT = `
  id,
  auto_id,
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
  balance,
  created_at,
  updated_at,
  participation_level:participation_levels (
    id,
    name,
    is_active,
    sort_order
  )
`

const COMMENT_SELECT = `
  id,
  company_id,
  author_id,
  body,
  created_at,
  author:users (
    id,
    full_name,
    email
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

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeCompany(row: Company): Company {
  return {
    ...row,
    auto_id: asNumber(row.auto_id),
    balance: asNumber(row.balance),
    participation_level: row.participation_level ?? null,
  }
}

function normalizeComment(row: CompanyComment): CompanyComment {
  return {
    ...row,
    author: row.author ?? null,
  }
}

/**
 * Admin companies access layer.
 */
export const companiesService = {
  async listOptions(): Promise<
    Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'>>
  > {
    const result = (await supabaseClient
      .from('companies')
      .select('id, name, access_status')
      .order('name', { ascending: true })) as QueryResult<
      Array<Pick<TableRow<'companies'>, 'id' | 'name' | 'access_status'>>
    >
    return assertResult(result)
  },

  async list(filters: CompaniesListFilters = {}): Promise<Company[]> {
    let query = supabaseClient.from('companies').select(COMPANY_SELECT)

    const sortBy = filters.sortBy ?? 'name'
    if (sortBy === 'balance_asc') {
      query = query.order('balance', { ascending: true }).order('name', { ascending: true })
    } else if (sortBy === 'balance_desc') {
      query = query.order('balance', { ascending: false }).order('name', { ascending: true })
    } else if (sortBy === 'auto_id') {
      query = query.order('auto_id', { ascending: true })
    } else {
      query = query.order('name', { ascending: true })
    }

    if (filters.accessStatus && filters.accessStatus !== 'all') {
      query = query.eq('access_status', filters.accessStatus)
    }

    if (filters.levelId && filters.levelId !== 'all') {
      query = query.eq('participation_level_id', filters.levelId)
    }

    if (filters.balanceFilter === 'positive') {
      query = query.gt('balance', 0)
    } else if (filters.balanceFilter === 'zero') {
      query = query.eq('balance', 0)
    } else if (filters.balanceFilter === 'negative') {
      query = query.lt('balance', 0)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search
        .replace(/[%_,()"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (safe) {
        const pattern = `%${safe}%`
        const orParts = [
          `name.ilike."${pattern}"`,
          `inn.ilike."${pattern}"`,
          `email.ilike."${pattern}"`,
          `phone.ilike."${pattern}"`,
          `address.ilike."${pattern}"`,
        ]
        if (/^\d+$/.test(safe)) {
          orParts.push(`auto_id.eq.${safe}`)
        }
        query = query.or(orParts.join(','))
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
      balance: input.balance ?? 0,
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
      balance: input.balance ?? 0,
      updated_at: new Date().toISOString(),
    }

    await dataService.updateById('companies', id, payload)
    const full = await this.getById(id)
    if (!full) {
      throw new ApiError('Компания не найдена', { code: 'not_found' })
    }
    return full
  },

  /** Member: update public profile fields of own company (level/status/notes/balance ignored by DB trigger). */
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

  async listComments(companyId: string): Promise<CompanyComment[]> {
    const result = (await supabaseClient
      .from('company_comments')
      .select(COMMENT_SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })) as QueryResult<CompanyComment[]>

    return assertResult(result).map(normalizeComment)
  },

  async addComment(companyId: string, body: string): Promise<CompanyComment> {
    const trimmed = body.trim()
    if (!trimmed) {
      throw new ApiError('Комментарий пустой', { code: 'validation' })
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new ApiError(authError?.message ?? 'Нужна авторизация', {
        code: 'unauthorized',
        cause: authError,
      })
    }

    const payload: TableInsert<'company_comments'> = {
      company_id: companyId,
      author_id: user.id,
      body: trimmed,
    }

    const result = (await supabaseClient
      .from('company_comments')
      .insert(payload)
      .select(COMMENT_SELECT)
      .single()) as QueryResult<CompanyComment>

    return normalizeComment(assertResult(result))
  },

  async deleteComment(commentId: string): Promise<void> {
    const result = (await supabaseClient
      .from('company_comments')
      .delete()
      .eq('id', commentId)) as QueryResult<null>
    assertResult(result)
  },

  async importRows(rows: Array<Record<string, unknown>>): Promise<{
    created: number
    updated: number
    skipped: number
    errors: Array<{ row?: number; error?: string; message?: string; inn?: string }>
  }> {
    const { data, error } = await supabaseClient.rpc('import_companies', {
      p_rows: rows as never,
    })
    if (error) {
      throw new ApiError(error.message, { code: 'unknown', cause: error })
    }
    const result = data as {
      created?: number
      updated?: number
      skipped?: number
      errors?: Array<{ row?: number; error?: string; message?: string; inn?: string }>
    } | null
    return {
      created: result?.created ?? 0,
      updated: result?.updated ?? 0,
      skipped: result?.skipped ?? 0,
      errors: result?.errors ?? [],
    }
  },
}
