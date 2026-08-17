import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type CompanyAccessStatusRecord = TableRow<'company_access_statuses'>

export type CompanyAccessStatusInput = {
  slug: string
  name: string
  description?: string | null
  excludesFromProgram?: boolean
  isActive?: boolean
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

export const companyAccessStatusesService = {
  async list(includeInactive = true): Promise<CompanyAccessStatusRecord[]> {
    let query = supabaseClient
      .from('company_access_statuses')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    return assertResult((await query) as QueryResult<CompanyAccessStatusRecord[]>)
  },

  async create(input: CompanyAccessStatusInput): Promise<CompanyAccessStatusRecord> {
    const slug = input.slug.trim().toLowerCase()
    const name = input.name.trim()
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
      throw new ApiError('Код статуса: латиница, цифры и _ (начинается с буквы)', {
        code: 'validation',
      })
    }
    if (name.length < 2) {
      throw new ApiError('Укажите название статуса', { code: 'validation' })
    }

    const rows = await this.list()
    const payload: TableInsert<'company_access_statuses'> = {
      slug,
      name,
      description: input.description?.trim() || null,
      sort_order: rows.length ? Math.max(...rows.map((item) => item.sort_order)) + 1 : 0,
      is_active: input.isActive ?? true,
      is_system: false,
      is_default: false,
      excludes_from_program: input.excludesFromProgram ?? false,
    }

    return dataService.insert('company_access_statuses', payload)
  },

  async update(
    slug: string,
    values: Partial<CompanyAccessStatusInput> & { isDefault?: boolean },
  ): Promise<CompanyAccessStatusRecord> {
    const payload: TableUpdate<'company_access_statuses'> = {}

    if (values.name !== undefined) payload.name = values.name.trim()
    if (values.description !== undefined) payload.description = values.description?.trim() || null
    if (values.excludesFromProgram !== undefined) {
      payload.excludes_from_program = values.excludesFromProgram
    }
    if (values.isActive !== undefined) payload.is_active = values.isActive

    if (values.isDefault === true) {
      await supabaseClient
        .from('company_access_statuses')
        .update({ is_default: false })
        .neq('slug', slug)
    }
    if (values.isDefault !== undefined) payload.is_default = values.isDefault

    const result = (await supabaseClient
      .from('company_access_statuses')
      .update(payload)
      .eq('slug', slug)
      .select()
      .single()) as QueryResult<CompanyAccessStatusRecord>

    return assertResult(result)
  },

  async reorder(orderedSlugs: string[]): Promise<CompanyAccessStatusRecord[]> {
    await Promise.all(
      orderedSlugs.map((slug, index) =>
        supabaseClient
          .from('company_access_statuses')
          .update({ sort_order: index })
          .eq('slug', slug),
      ),
    )
    return this.list()
  },

  async getUsage(slug: string): Promise<{ companies: number }> {
    const result = await rpcService.call('get_company_access_status_usage', { p_slug: slug })
    const companies =
      result && typeof result === 'object' && 'companies' in result
        ? Number((result as { companies: number }).companies)
        : 0
    return { companies }
  },

  async delete(slug: string): Promise<void> {
    await rpcService.call('delete_company_access_status', { p_slug: slug })
  },
}
