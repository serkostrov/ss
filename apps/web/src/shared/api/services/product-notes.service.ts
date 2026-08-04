import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type ProductNote = TableRow<'product_notes'>

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

export const productNotesService = {
  async list(activeOnly = false): Promise<ProductNote[]> {
    let query = supabaseClient
      .from('product_notes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    return assertResult((await query) as QueryResult<ProductNote[]>)
  },

  async create(name: string): Promise<ProductNote> {
    const cleanName = name.trim()
    if (cleanName.length < 2) {
      throw new ApiError('Укажите примечание', { code: 'validation' })
    }
    const notes = await this.list()
    const payload: TableInsert<'product_notes'> = {
      name: cleanName,
      sort_order: notes.length ? Math.max(...notes.map((item) => item.sort_order)) + 1 : 0,
    }
    return dataService.insert('product_notes', payload)
  },

  update(id: string, values: { name?: string; is_active?: boolean }) {
    return dataService.updateById('product_notes', id, {
      name: values.name?.trim(),
      is_active: values.is_active,
    })
  },

  async delete(id: string): Promise<void> {
    await rpcService.call('delete_product_note', { p_id: id })
  },
}
