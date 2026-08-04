import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { ProductCategorySuggestionStatus, TableInsert, TableRow } from '../types/database'
import { dataService } from './data.service'
import { slugifyTitle } from './materials.service'
import { rpcService } from './rpc.service'

export type ProductCategory = TableRow<'product_categories'>

export type ProductCategorySuggestion = TableRow<'product_category_suggestions'> & {
  company: { id: string; name: string } | null
  product: { id: string; name: string } | null
  suggestedBy: { id: string; full_name: string | null; email: string } | null
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

function normalizeRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export const productCategoriesService = {
  async list(activeOnly = false): Promise<ProductCategory[]> {
    let query = supabaseClient
      .from('product_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    return assertResult((await query) as QueryResult<ProductCategory[]>)
  },

  async create(name: string): Promise<ProductCategory> {
    const categories = await this.list()
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      throw new ApiError('Укажите название категории', { code: 'validation' })
    }
    const baseSlug = slugifyTitle(cleanName).toLowerCase() || `category-${Date.now()}`
    const taken = new Set(categories.map((item) => item.slug))
    let slug = baseSlug
    let suffix = 2
    while (taken.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }
    const payload: TableInsert<'product_categories'> = {
      name: cleanName,
      slug,
      sort_order: categories.length
        ? Math.max(...categories.map((item) => item.sort_order)) + 1
        : 0,
    }
    return dataService.insert('product_categories', payload)
  },

  update(id: string, values: { name?: string; is_active?: boolean }) {
    return dataService.updateById('product_categories', id, {
      name: values.name?.trim(),
      is_active: values.is_active,
    })
  },

  async delete(id: string): Promise<void> {
    await rpcService.call('delete_product_category', { p_category_id: id })
  },

  async propose(productId: string, name: string) {
    return rpcService.call('propose_product_category', {
      p_product_id: productId,
      p_name: name.trim(),
    })
  },

  async listSuggestions(
    status: ProductCategorySuggestionStatus | 'all' = 'pending',
  ): Promise<ProductCategorySuggestion[]> {
    let query = supabaseClient
      .from('product_category_suggestions')
      .select(
        `
        *,
        company:companies ( id, name ),
        product:company_products ( id, name ),
        suggestedBy:users!product_category_suggestions_suggested_by_fkey (
          id,
          full_name,
          email
        )
      `,
      )
      .order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)

    type RawSuggestion = TableRow<'product_category_suggestions'> & {
      company: ProductCategorySuggestion['company'] | ProductCategorySuggestion['company'][]
      product: ProductCategorySuggestion['product'] | ProductCategorySuggestion['product'][]
      suggestedBy:
        | ProductCategorySuggestion['suggestedBy']
        | ProductCategorySuggestion['suggestedBy'][]
    }
    const rows = assertResult((await query) as unknown as QueryResult<RawSuggestion[]>)
    return rows.map((row) => ({
      ...row,
      company: normalizeRelation(row.company),
      product: normalizeRelation(row.product),
      suggestedBy: normalizeRelation(row.suggestedBy),
    }))
  },

  review(
    suggestionId: string,
    approve: boolean,
    options: { categoryId?: string | null; note?: string | null } = {},
  ) {
    return rpcService.call('review_product_category_suggestion', {
      p_suggestion_id: suggestionId,
      p_approve: approve,
      p_category_id: options.categoryId ?? null,
      p_note: options.note ?? null,
    })
  },
}
