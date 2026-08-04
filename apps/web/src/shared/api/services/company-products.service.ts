import { ApiError } from '@shared/lib/errors'
import { normalizeExternalUrl } from '@shared/lib/files'

import { supabaseClient } from '../lib/client'
import type {
  ProductModerationStatus,
  TableInsert,
  TableRow,
  TableUpdate,
} from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type CompanyProduct = TableRow<'company_products'> & {
  category?: { id: string; name: string } | null
  okpd?: { id: string; code: string; title: string } | null
  note?: { id: string; name: string } | null
  company?: { id: string; name: string } | null
  pendingSuggestion?: { id: string; suggested_name: string } | null
}

export type CompanyProductInput = {
  companyId: string
  okpdCodeId?: string | null
  noteId?: string | null
  proposedOkpdCode?: string | null
  proposedOkpdTitle?: string | null
  proposedNoteName?: string | null
  name?: string | null
  url?: string | null
  is_active?: boolean
}

export type CompanyProductUpdateInput = {
  okpdCodeId?: string | null
  noteId?: string | null
  proposedOkpdCode?: string | null
  proposedOkpdTitle?: string | null
  proposedNoteName?: string | null
  name?: string | null
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

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

const PRODUCT_SELECT =
  'id, company_id, category_id, okpd_code_id, note_id, proposed_okpd_code, proposed_okpd_title, proposed_note_name, name, url, sort_order, is_active, moderation_status, reviewed_by, reviewed_at, review_note, created_at, updated_at'

const PRODUCT_LIST_SELECT = `
  ${PRODUCT_SELECT},
  category:product_categories ( id, name ),
  okpd:okpd2_codes ( id, code, title ),
  note:product_notes ( id, name ),
  pendingSuggestion:product_category_suggestions!product_category_suggestions_product_id_fkey (
    id,
    suggested_name,
    status
  )
`

function mapProductRow<
  T extends {
    category: CompanyProduct['category'] | CompanyProduct['category'][]
    okpd: CompanyProduct['okpd'] | CompanyProduct['okpd'][]
    note: CompanyProduct['note'] | CompanyProduct['note'][]
    pendingSuggestion:
      | Array<{ id: string; suggested_name: string; status: string }>
      | { id: string; suggested_name: string; status: string }
      | null
    company?: CompanyProduct['company'] | CompanyProduct['company'][]
  },
>(row: T): CompanyProduct {
  const suggestions = Array.isArray(row.pendingSuggestion)
    ? row.pendingSuggestion
    : row.pendingSuggestion
      ? [row.pendingSuggestion]
      : []
  const pending = suggestions.find((item) => item.status === 'pending') ?? null
  return {
    ...row,
    category: normalizeRelation(row.category),
    okpd: normalizeRelation(row.okpd),
    note: normalizeRelation(row.note),
    company: normalizeRelation(row.company),
    pendingSuggestion: pending
      ? { id: pending.id, suggested_name: pending.suggested_name }
      : null,
  }
}

/**
 * Company products classified by OKPD 2 code + admin note.
 */
export const companyProductsService = {
  async listByCompany(companyId: string): Promise<CompanyProduct[]> {
    type RawProduct = TableRow<'company_products'> & {
      category: CompanyProduct['category'] | CompanyProduct['category'][]
      okpd: CompanyProduct['okpd'] | CompanyProduct['okpd'][]
      note: CompanyProduct['note'] | CompanyProduct['note'][]
      pendingSuggestion:
        | Array<{ id: string; suggested_name: string; status: string }>
        | { id: string; suggested_name: string; status: string }
        | null
    }

    const result = (await supabaseClient
      .from('company_products')
      .select(PRODUCT_LIST_SELECT)
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })) as unknown as QueryResult<RawProduct[]>

    return assertResult(result).map(mapProductRow)
  },

  async listForModeration(
    status: ProductModerationStatus | 'all' = 'pending',
  ): Promise<CompanyProduct[]> {
    type RawProduct = TableRow<'company_products'> & {
      company: CompanyProduct['company'] | CompanyProduct['company'][]
      category: CompanyProduct['category'] | CompanyProduct['category'][]
      okpd: CompanyProduct['okpd'] | CompanyProduct['okpd'][]
      note: CompanyProduct['note'] | CompanyProduct['note'][]
      pendingSuggestion:
        | Array<{ id: string; suggested_name: string; status: string }>
        | { id: string; suggested_name: string; status: string }
        | null
    }

    let query = supabaseClient
      .from('company_products')
      .select(
        `
        ${PRODUCT_SELECT},
        company:companies ( id, name ),
        category:product_categories ( id, name ),
        okpd:okpd2_codes ( id, code, title ),
        note:product_notes ( id, name ),
        pendingSuggestion:product_category_suggestions!product_category_suggestions_product_id_fkey (
          id,
          suggested_name,
          status
        )
      `,
      )
      .order('created_at', { ascending: false })

    if (status !== 'all') query = query.eq('moderation_status', status)

    const rows = assertResult((await query) as unknown as QueryResult<RawProduct[]>)
    return rows.map(mapProductRow)
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

  async resolveDisplayName(input: {
    okpdCodeId?: string | null
    proposedOkpdTitle?: string | null
    name?: string | null
  }): Promise<string> {
    const custom = input.name?.trim()
    if (custom && custom.length >= 2) return custom.slice(0, 200)

    const proposed = input.proposedOkpdTitle?.trim()
    if (proposed && proposed.length >= 2) return proposed.slice(0, 200)

    if (!input.okpdCodeId) {
      throw new ApiError('Выберите код ОКПД 2 или предложите свой', { code: 'validation' })
    }

    const result = (await supabaseClient
      .from('okpd2_codes')
      .select('title')
      .eq('id', input.okpdCodeId)
      .maybeSingle()) as QueryResult<{ title: string } | null>
    const title = assertResult(result)?.title?.trim()
    if (!title) throw new ApiError('Выберите код ОКПД 2', { code: 'validation' })
    return title.slice(0, 200)
  },

  normalizeClassification(input: {
    okpdCodeId?: string | null
    noteId?: string | null
    proposedOkpdCode?: string | null
    proposedOkpdTitle?: string | null
    proposedNoteName?: string | null
  }) {
    const proposedOkpdCode = input.proposedOkpdCode?.trim() || null
    const proposedOkpdTitle = input.proposedOkpdTitle?.trim() || null
    const proposedNoteName = input.proposedNoteName?.trim() || null
    const proposingOkpd = Boolean(proposedOkpdCode || proposedOkpdTitle)
    const proposingNote = Boolean(proposedNoteName)

    if (proposingOkpd) {
      if (!proposedOkpdCode || !proposedOkpdTitle) {
        throw new ApiError('Укажите код ОКПД 2 и расшифровку', { code: 'validation' })
      }
    } else if (!input.okpdCodeId) {
      throw new ApiError('Выберите код ОКПД 2 или предложите свой', { code: 'validation' })
    }

    if (proposingNote) {
      if (!proposedNoteName || proposedNoteName.length < 2) {
        throw new ApiError('Укажите примечание', { code: 'validation' })
      }
    } else if (!input.noteId) {
      throw new ApiError('Выберите примечание или предложите своё', { code: 'validation' })
    }

    return {
      okpd_code_id: proposingOkpd ? null : (input.okpdCodeId ?? null),
      note_id: proposingNote ? null : (input.noteId ?? null),
      proposed_okpd_code: proposingOkpd ? proposedOkpdCode : null,
      proposed_okpd_title: proposingOkpd ? proposedOkpdTitle : null,
      proposed_note_name: proposingNote ? proposedNoteName : null,
    }
  },

  async create(input: CompanyProductInput): Promise<CompanyProduct> {
    const classification = this.normalizeClassification(input)
    const name = await this.resolveDisplayName({
      okpdCodeId: classification.okpd_code_id,
      proposedOkpdTitle: classification.proposed_okpd_title,
      name: input.name,
    })
    const url = input.url?.trim() ? normalizeExternalUrl(input.url) : null

    const payload: TableInsert<'company_products'> = {
      company_id: input.companyId,
      ...classification,
      category_id: null,
      name,
      url,
      is_active: input.is_active ?? true,
      moderation_status: 'pending',
      sort_order: await this.nextSortOrder(input.companyId),
    }

    return dataService.insert('company_products', payload)
  },

  async update(id: string, input: CompanyProductUpdateInput): Promise<CompanyProduct> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Продукция не найдена', { code: 'not_found' })

    const classification = this.normalizeClassification(input)
    const name = await this.resolveDisplayName({
      okpdCodeId: classification.okpd_code_id,
      proposedOkpdTitle: classification.proposed_okpd_title,
      name: input.name,
    })

    const payload: TableUpdate<'company_products'> = {
      ...classification,
      category_id: null,
      name,
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

  review(productId: string, approve: boolean, note?: string | null) {
    return rpcService.call('review_company_product', {
      p_product_id: productId,
      p_approve: approve,
      p_note: note ?? null,
    })
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
