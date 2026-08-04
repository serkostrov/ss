import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { InvoiceStatus, TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'
import { STORAGE_BUCKETS, storageService } from './storage.service'

export type Invoice = TableRow<'invoices'> & {
  company: { id: string; name: string } | null
}

export type InvoiceInput = {
  companyId: string
  title: string
  number: string
  amount: number
  currency?: string
  dueDate?: string | null
  issuedAt?: string | null
  file?: File | null
}

export type InvoicesListFilters = {
  search?: string
  status?: InvoiceStatus | 'all'
  companyId?: string
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

function extractStorageObjectPath(fileUrl: string, bucket: string): string {
  const trimmed = fileUrl.trim()
  if (!trimmed) throw new ApiError('Файл не указан', { code: 'validation' })
  const prefix = `${bucket}/`
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed
}

const LIST_SELECT = `
  id,
  company_id,
  number,
  title,
  amount,
  currency,
  status,
  due_date,
  issued_at,
  paid_at,
  file_url,
  file_name,
  created_by,
  created_at,
  updated_at,
  company:companies ( id, name )
`

/**
 * Invoices issued to member companies.
 */
export const invoicesService = {
  bucket: STORAGE_BUCKETS.invoices,

  async list(filters: InvoicesListFilters = {}): Promise<Invoice[]> {
    let query = supabaseClient
      .from('invoices')
      .select(LIST_SELECT)
      .order('issued_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.companyId) {
      query = query.eq('company_id', filters.companyId)
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search
        .replace(/[%_,()"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(`title.ilike."${pattern}",number.ilike."${pattern}"`)
      }
    }

    type Raw = TableRow<'invoices'> & {
      company: Invoice['company'] | Invoice['company'][]
    }
    const rows = assertResult((await query) as unknown as QueryResult<Raw[]>)
    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
      company: normalizeRelation(row.company),
    }))
  },

  async listForCabinet(companyId: string): Promise<Invoice[]> {
    if (!companyId) return []
    return this.list({ companyId, status: 'all' })
  },

  async getById(id: string): Promise<Invoice | null> {
    const result = (await supabaseClient
      .from('invoices')
      .select(LIST_SELECT)
      .eq('id', id)
      .maybeSingle()) as unknown as QueryResult<
      | (TableRow<'invoices'> & { company: Invoice['company'] | Invoice['company'][] })
      | null
    >
    const row = assertResult(result)
    if (!row) return null
    return {
      ...row,
      amount: Number(row.amount),
      company: normalizeRelation(row.company),
    }
  },

  async create(input: InvoiceInput): Promise<Invoice> {
    const issuedAt = input.issuedAt?.trim() || new Date().toISOString()

    // Status is always «к оплате» on create; admin changes it only on the invoice page.
    const payload: TableInsert<'invoices'> = {
      company_id: input.companyId,
      number: input.number.trim(),
      title: input.title.trim(),
      amount: input.amount,
      currency: input.currency?.trim() || 'RUB',
      status: 'issued',
      due_date: input.dueDate || null,
      issued_at: issuedAt,
      paid_at: null,
    }

    const created = await dataService.insert('invoices', payload)

    if (input.file) {
      try {
        await this.uploadFile(created.id, input.file)
      } catch (error) {
        await dataService.deleteById('invoices', created.id).catch(() => undefined)
        throw error
      }
    }

    const full = await this.getById(created.id)
    if (!full) throw new ApiError('Счёт создан, но не найден', { code: 'unknown' })
    return full
  },

  async uploadFile(id: string, file: File): Promise<Invoice> {
    const path = storageService.buildObjectPath([id], file.name)
    const uploaded = await storageService.upload({
      bucket: this.bucket,
      path,
      file,
      contentType: file.type || undefined,
      upsert: false,
    })

    try {
      await dataService.updateById('invoices', id, {
        file_url: uploaded.path,
        file_name: file.name.slice(0, 240),
        updated_at: new Date().toISOString(),
      } satisfies TableUpdate<'invoices'>)
    } catch (error) {
      await storageService.remove(this.bucket, [uploaded.path]).catch(() => undefined)
      throw error
    }

    const full = await this.getById(id)
    if (!full) throw new ApiError('Счёт не найден', { code: 'not_found' })
    return full
  },

  async getDownloadUrl(invoice: Invoice, expiresInSeconds = 60 * 10): Promise<string> {
    if (!invoice.file_url) {
      throw new ApiError('У счёта нет файла', { code: 'not_found' })
    }
    const path = extractStorageObjectPath(invoice.file_url, this.bucket)
    return storageService.createSignedUrl(this.bucket, path, expiresInSeconds)
  },

  async setStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    await rpcService.call('set_invoice_status', {
      p_invoice_id: id,
      p_status: status,
    })
    const full = await this.getById(id)
    if (!full) throw new ApiError('Счёт не найден', { code: 'not_found' })
    return full
  },

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    await dataService.deleteById('invoices', id)
    if (existing?.file_url) {
      const path = extractStorageObjectPath(existing.file_url, this.bucket)
      await storageService.remove(this.bucket, [path]).catch(() => undefined)
    }
  },
}
