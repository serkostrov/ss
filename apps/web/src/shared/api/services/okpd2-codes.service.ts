import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type Okpd2Code = TableRow<'okpd2_codes'>

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

function inferLevel(code: string): number {
  const parts = code.trim().split('.')
  const last = parts[parts.length - 1] ?? ''
  // Spreadsheet levels 3–7 roughly map to segment depth for 27.40.*
  if (parts.length <= 1) return 1
  if (parts.length === 2) return 3
  if (parts.length === 3) return last.length >= 3 ? 5 : 4
  if (parts.length === 4) return last.length >= 3 ? 7 : 6
  return Math.min(7, parts.length + 2)
}

export const okpd2CodesService = {
  async list(activeOnly = false): Promise<Okpd2Code[]> {
    let query = supabaseClient
      .from('okpd2_codes')
      .select('*')
      .order('code', { ascending: true })
    if (activeOnly) query = query.eq('is_active', true)
    return assertResult((await query) as QueryResult<Okpd2Code[]>)
  },

  async create(input: {
    code: string
    title: string
    parentId?: string | null
  }): Promise<Okpd2Code> {
    const code = input.code.trim()
    const title = input.title.trim()
    if (!code) throw new ApiError('Укажите код ОКПД 2', { code: 'validation' })
    if (title.length < 2) throw new ApiError('Укажите расшифровку', { code: 'validation' })

    const existing = await this.list()
    if (existing.some((item) => item.code === code)) {
      throw new ApiError('Такой код уже есть', { code: 'validation' })
    }

    let parentId = input.parentId ?? null
    if (!parentId) {
      const parts = code.split('.')
      while (parts.length > 1) {
        parts.pop()
        const parentCode = parts.join('.')
        const parent = existing.find((item) => item.code === parentCode)
        if (parent) {
          parentId = parent.id
          break
        }
      }
    }

    const payload: TableInsert<'okpd2_codes'> = {
      code,
      title,
      parent_id: parentId,
      level: inferLevel(code),
      sort_order: existing.length
        ? Math.max(...existing.map((item) => item.sort_order)) + 1
        : 0,
    }
    return dataService.insert('okpd2_codes', payload)
  },

  update(
    id: string,
    values: {
      code?: string
      title?: string
      is_active?: boolean
      parent_id?: string | null
    },
  ) {
    const code = values.code?.trim()
    const payload: {
      code?: string
      title?: string
      is_active?: boolean
      parent_id?: string | null
      level?: number
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }
    if (code !== undefined) {
      payload.code = code
      payload.level = inferLevel(code)
    }
    if (values.title !== undefined) payload.title = values.title.trim()
    if (values.is_active !== undefined) payload.is_active = values.is_active
    if (values.parent_id !== undefined) payload.parent_id = values.parent_id
    return dataService.updateById('okpd2_codes', id, payload)
  },

  async delete(id: string): Promise<void> {
    await rpcService.call('delete_okpd2_code', { p_id: id })
  },
}
