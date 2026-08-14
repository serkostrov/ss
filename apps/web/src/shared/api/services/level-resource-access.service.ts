import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { CompanyAccessStatus } from '../types/database'

export type CabinetResource =
  | 'directory'
  | 'products'
  | 'materials'
  | 'polls'
  | 'work_groups'
  | 'invoices'

export type LevelResourceAccessRow = {
  resource: CabinetResource
  visibility_statuses: CompanyAccessStatus[]
  content_statuses: CompanyAccessStatus[]
}

export type CabinetResourceAccess = {
  resource: CabinetResource
  visible: boolean
  hasContent: boolean
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

function parseAccessRows(payload: unknown): LevelResourceAccessRow[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const record = row as Record<string, unknown>
    const resource = record.resource
    if (typeof resource !== 'string') return []
    return [
      {
        resource: resource as CabinetResource,
        visibility_statuses: Array.isArray(record.visibility_statuses)
          ? (record.visibility_statuses as CompanyAccessStatus[])
          : [],
        content_statuses: Array.isArray(record.content_statuses)
          ? (record.content_statuses as CompanyAccessStatus[])
          : [],
      },
    ]
  })
}

export const levelResourceAccessService = {
  async getForLevel(levelId: string): Promise<LevelResourceAccessRow[]> {
    const result = (await supabaseClient.rpc('get_participation_level_resource_access', {
      p_level_id: levelId,
    })) as QueryResult<unknown>

    return parseAccessRows(assertResult(result))
  },

  async saveForLevel(levelId: string, rows: LevelResourceAccessRow[]): Promise<LevelResourceAccessRow[]> {
    const result = (await supabaseClient.rpc('set_participation_level_resource_access', {
      p_level_id: levelId,
      p_rows: rows,
    })) as QueryResult<unknown>

    return parseAccessRows(assertResult(result))
  },

  async getCabinetAccess(): Promise<CabinetResourceAccess[]> {
    const result = (await supabaseClient.rpc('get_cabinet_resource_access')) as QueryResult<
      Array<{
        resource: CabinetResource
        visible: boolean
        has_content: boolean
      }>
    >

    const rows = assertResult(result)
    return rows.map((row) => ({
      resource: row.resource,
      visible: row.visible,
      hasContent: row.has_content,
    }))
  },
}
