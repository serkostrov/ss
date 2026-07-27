import { ApiError } from '@shared/lib/errors'
import { normalizeExternalUrl } from '@shared/lib/files'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type CompanyProduct = TableRow<'company_products'>

export type CompanyProductInput = {
  companyId: string
  name: string
  url?: string | null
  is_active?: boolean
}

export type CompanyProductUpdateInput = {
  name: string
  url?: string | null
  is_active?: boolean
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

const PRODUCT_SELECT =
  'id, company_id, name, url, sort_order, is_active, created_at, updated_at'

/**
 * Company products (name + URL) for directory / partner discovery.
 */
export const companyProductsService = {
  async listByCompany(companyId: string): Promise<CompanyProduct[]> {
    const result = (await supabaseClient
      .from('company_products')
      .select(PRODUCT_SELECT)
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })) as QueryResult<CompanyProduct[]>

    return assertResult(result)
  },

  async getById(id: string): Promise<CompanyProduct | null> {
    const result = (await supabaseClient
      .from('company_products')
      .select(PRODUCT_SELECT)
      .eq('id', id)
      .maybeSingle()) as QueryResult<CompanyProduct | null>

    return assertResult(result)
  },

  async nextSortOrder(companyId: string): Promise<number> {
    const result = (await supabaseClient
      .from('company_products')
      .select('sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()) as QueryResult<{ sort_order: number } | null>

    const row = assertResult(result)
    return row ? row.sort_order + 1 : 0
  },

  async create(input: CompanyProductInput): Promise<CompanyProduct> {
    const name = input.name.trim()
    if (name.length < 2) {
      throw new ApiError('Укажите название продукции', { code: 'validation' })
    }

    const url = input.url?.trim() ? normalizeExternalUrl(input.url) : null

    const payload: TableInsert<'company_products'> = {
      company_id: input.companyId,
      name: name.slice(0, 200),
      url,
      is_active: input.is_active ?? true,
      sort_order: await this.nextSortOrder(input.companyId),
    }

    return dataService.insert('company_products', payload)
  },

  async update(id: string, input: CompanyProductUpdateInput): Promise<CompanyProduct> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Продукция не найдена', { code: 'not_found' })

    const name = input.name.trim()
    if (name.length < 2) {
      throw new ApiError('Укажите название', { code: 'validation' })
    }

    const payload: TableUpdate<'company_products'> = {
      name: name.slice(0, 200),
      url: input.url?.trim() ? normalizeExternalUrl(input.url) : null,
      is_active: input.is_active,
      updated_at: new Date().toISOString(),
    }

    return dataService.updateById('company_products', id, payload)
  },

  async setActive(id: string, isActive: boolean): Promise<CompanyProduct> {
    return dataService.updateById('company_products', id, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
  },

  async delete(id: string): Promise<void> {
    await dataService.deleteById('company_products', id)
  },

  async reorder(companyId: string, orderedIds: string[]): Promise<CompanyProduct[]> {
    return rpcService.call('reorder_company_products', {
      p_company_id: companyId,
      p_ordered_ids: orderedIds,
    })
  },

  async move(
    companyId: string,
    productId: string,
    direction: 'up' | 'down',
  ): Promise<CompanyProduct[]> {
    const products = await this.listByCompany(companyId)
    const index = products.findIndex((item) => item.id === productId)
    if (index < 0) {
      throw new ApiError('Продукция не найдена', { code: 'not_found' })
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= products.length) {
      return products
    }

    const next = [...products]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    return this.reorder(
      companyId,
      next.map((row) => row.id),
    )
  },
}
