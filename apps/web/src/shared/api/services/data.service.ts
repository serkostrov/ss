import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableName, TableRow, TableUpdate } from '../types/database'
import { auditService } from './audit.service'

const SKIP_AUDIT_TABLES = new Set<TableName>(['audit_log'])

function rowId(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const id = (row as { id?: unknown }).id
  return typeof id === 'string' ? id : id != null ? String(id) : null
}

function recordDataAudit(
  action: 'create' | 'update' | 'delete' | 'upsert',
  table: TableName,
  entityId: string | null,
  payload?: unknown,
) {
  if (SKIP_AUDIT_TABLES.has(table)) return
  void auditService.log({
    action: `${table}.${action}`,
    entity_type: table,
    entity_id: entityId,
    payload: payload as never,
  })
}

type EqFilter = { column: string; value: string | number | boolean | null }

type QueryResult<T> = { data: T; error: { message: string; code?: string; details?: string; hint?: string } | null }

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

/**
 * Universal typed data access layer.
 * Prefer thin entity repositories built on top of these methods.
 */
export const dataService = {
  async list<T extends TableName>(
    table: T,
    options?: {
      columns?: string
      eq?: EqFilter | EqFilter[]
      limit?: number
      order?: { column: string; ascending?: boolean }
    },
  ): Promise<TableRow<T>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    let query: any = supabaseClient.from(table).select(options?.columns ?? '*')

    const filters = options?.eq ? (Array.isArray(options.eq) ? options.eq : [options.eq]) : []
    for (const filter of filters) {
      query = query.eq(filter.column, filter.value)
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      })
    }

    if (options?.limit != null) {
      query = query.limit(options.limit)
    }

    const result = (await query) as QueryResult<TableRow<T>[]>
    return assertResult(result)
  },

  async getById<T extends TableName>(
    table: T,
    id: string,
    columns = '*',
  ): Promise<TableRow<T> | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .select(columns)
      .eq('id', id)
      .maybeSingle()) as QueryResult<TableRow<T> | null>

    return assertResult(result)
  },

  async insert<T extends TableName>(table: T, values: TableInsert<T>): Promise<TableRow<T>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .insert(values)
      .select()
      .single()) as QueryResult<TableRow<T>>

    const row = assertResult(result)
    recordDataAudit('create', table, rowId(row), { after: row })
    return row
  },

  async insertMany<T extends TableName>(
    table: T,
    values: Array<TableInsert<T>>,
  ): Promise<TableRow<T>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .insert(values)
      .select()) as QueryResult<TableRow<T>[]>

    const rows = assertResult(result)
    recordDataAudit('create', table, rows[0] ? rowId(rows[0]) : null, {
      count: rows.length,
      ids: rows.map((row) => rowId(row)).filter(Boolean),
    })
    return rows
  },

  async updateById<T extends TableName>(
    table: T,
    id: string,
    values: TableUpdate<T>,
  ): Promise<TableRow<T>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .update(values)
      .eq('id', id)
      .select()
      .single()) as QueryResult<TableRow<T>>

    const row = assertResult(result)
    recordDataAudit('update', table, id, { patch: values, after: row })
    return row
  },

  async deleteById<T extends TableName>(table: T, id: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .delete()
      .eq('id', id)) as QueryResult<unknown>

    assertResult(result)
    recordDataAudit('delete', table, id)
  },

  async upsert<T extends TableName>(
    table: T,
    values: TableInsert<T> | Array<TableInsert<T>>,
    onConflict?: string,
  ): Promise<TableRow<T>[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table builder
    const result = (await (supabaseClient.from(table) as any)
      .upsert(values, onConflict ? { onConflict } : undefined)
      .select()) as QueryResult<TableRow<T>[]>

    const rows = assertResult(result)
    recordDataAudit('upsert', table, rows[0] ? rowId(rows[0]) : null, {
      count: rows.length,
      ids: rows.map((row) => rowId(row)).filter(Boolean),
    })
    return rows
  },
}
