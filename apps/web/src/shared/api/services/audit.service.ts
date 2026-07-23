import type { Json, TableRow } from '../types/database'
import { supabaseClient } from '../lib/client'
import { unwrap } from '../lib/helpers'
import { ApiError } from '@shared/lib/errors'

export type AuditLogActor = {
  id: string
  email: string
  full_name: string | null
}

export type AuditLogEntry = TableRow<'audit_log'> & {
  actor: AuditLogActor | null
}

export type AuditLogInput = {
  action: string
  entity_type: string
  entity_id?: string | null
  payload?: Json | null
}

export type AuditLogListFilters = {
  search?: string
  action?: string | 'all'
  entityType?: string | 'all'
  userId?: string | 'all'
  page?: number
  pageSize?: number
  /** ISO date-time inclusive lower bound */
  from?: string | null
  /** ISO date-time inclusive upper bound */
  to?: string | null
}

export type AuditLogListResult = {
  items: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_EXPORT_ROWS = 5000

const AUDIT_SELECT = `
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  payload,
  created_at,
  users (
    id,
    email,
    full_name
  )
`

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
  count?: number | null
}

type RawAudit = TableRow<'audit_log'> & {
  users: AuditLogActor | AuditLogActor[] | null
}

const HEAVY_PAYLOAD_KEYS = new Set([
  'content',
  'description',
  'text',
  'file',
  'password',
  'token',
  'access_token',
  'refresh_token',
])

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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function truncateString(value: string, max = 400): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** Reduce payload size before persist — avoid large markdown / secrets. */
export function sanitizeAuditPayload(value: unknown, depth = 0): Json | null {
  if (value == null) return null
  if (depth > 3) return '[trimmed]'
  if (typeof value === 'string') return truncateString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeAuditPayload(item, depth + 1)) as Json
  }
  if (typeof value === 'object') {
    const out: Record<string, Json | undefined> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (HEAVY_PAYLOAD_KEYS.has(key)) {
        out[key] = typeof item === 'string' ? truncateString(item, 80) : '[omitted]'
        continue
      }
      out[key] = sanitizeAuditPayload(item, depth + 1) ?? undefined
    }
    return out
  }
  return String(value)
}

function normalize(row: RawAudit): AuditLogEntry {
  return {
    id: row.id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    payload: row.payload,
    created_at: row.created_at,
    actor: firstRelation(row.users),
  }
}

function applyFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase builder
  query: any,
  filters: AuditLogListFilters,
) {
  let next = query

  if (filters.action && filters.action !== 'all') {
    next = next.eq('action', filters.action)
  }
  if (filters.entityType && filters.entityType !== 'all') {
    next = next.eq('entity_type', filters.entityType)
  }
  if (filters.userId && filters.userId !== 'all') {
    next = next.eq('user_id', filters.userId)
  }
  if (filters.from) {
    next = next.gte('created_at', filters.from)
  }
  if (filters.to) {
    next = next.lte('created_at', filters.to)
  }

  const search = filters.search?.trim()
  if (search) {
    const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
    if (safe) {
      const pattern = `%${safe}%`
      next = next.or(
        [
          `action.ilike."${pattern}"`,
          `entity_type.ilike."${pattern}"`,
          `entity_id.ilike."${pattern}"`,
        ].join(','),
      )
    }
  }

  return next
}

/**
 * Admin audit journal. Writes never throw to callers (best-effort).
 */
export const auditService = {
  /**
   * Persist an audit event. Swallows errors so business flows never fail on logging.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      const result = await supabaseClient.rpc('write_audit_log', {
        p_action: input.action,
        p_entity_type: input.entity_type,
        p_entity_id: input.entity_id ?? null,
        p_payload: sanitizeAuditPayload(input.payload) as never,
      })
      unwrap(result)
    } catch {
      // Best-effort: never break admin mutations because of audit failures.
      if (import.meta.env.DEV) {
        console.warn('[audit] failed to write', input.action, input.entity_type)
      }
    }
  },

  async list(filters: AuditLogListFilters = {}): Promise<AuditLogListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabaseClient
      .from('audit_log')
      .select(AUDIT_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    query = applyFilters(query, filters)

    const result = (await query) as unknown as QueryResult<RawAudit[]>
    const rows = assertResult(result)

    return {
      items: rows.map(normalize),
      total: result.count ?? rows.length,
      page,
      pageSize,
    }
  },

  /** Distinct action values for filter dropdowns (bounded). */
  async listActionOptions(limit = 80): Promise<string[]> {
    const result = (await supabaseClient
      .from('audit_log')
      .select('action')
      .order('action', { ascending: true })
      .limit(500)) as unknown as QueryResult<Array<{ action: string }>>

    const rows = assertResult(result)
    return [...new Set(rows.map((row) => row.action))].slice(0, limit)
  },

  async listEntityTypeOptions(limit = 80): Promise<string[]> {
    const result = (await supabaseClient
      .from('audit_log')
      .select('entity_type')
      .order('entity_type', { ascending: true })
      .limit(500)) as unknown as QueryResult<Array<{ entity_type: string }>>

    const rows = assertResult(result)
    return [...new Set(rows.map((row) => row.entity_type))].slice(0, limit)
  },

  /** Export matching rows (capped) for CSV. */
  async listForExport(filters: AuditLogListFilters = {}): Promise<AuditLogEntry[]> {
    let query = supabaseClient
      .from('audit_log')
      .select(AUDIT_SELECT)
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS)

    query = applyFilters(query, filters)

    const result = (await query) as unknown as QueryResult<RawAudit[]>
    return assertResult(result).map(normalize)
  },
}

export const AUDIT_EXPORT_MAX_ROWS = MAX_EXPORT_ROWS
