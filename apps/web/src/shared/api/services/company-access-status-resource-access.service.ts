import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { CabinetResource } from './level-resource-access.service'

export type AccessStatusResourceAccessRow = {
  resource: CabinetResource
  allowsVisibility: boolean
  allowsContent: boolean
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

function parseRows(payload: unknown): AccessStatusResourceAccessRow[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const record = row as Record<string, unknown>
    const resource = record.resource
    if (typeof resource !== 'string') return []
    return [
      {
        resource: resource as CabinetResource,
        allowsVisibility: record.allows_visibility === true || record.allowsVisibility === true,
        allowsContent: record.allows_content === true || record.allowsContent === true,
      },
    ]
  })
}

export const companyAccessStatusResourceAccessService = {
  async listGrouped(): Promise<Record<string, AccessStatusResourceAccessRow[]>> {
    const result = (await supabaseClient
      .from('company_access_status_resource_access')
      .select('status_slug, resource, allows_visibility, allows_content')
      .order('status_slug')
      .order('resource')) as QueryResult<
      Array<{
        status_slug: string
        resource: string
        allows_visibility: boolean
        allows_content: boolean
      }>
    >

    const rows = assertResult(result)
    return rows.reduce<Record<string, AccessStatusResourceAccessRow[]>>((acc, row) => {
      const bucket = acc[row.status_slug] ?? []
      bucket.push({
        resource: row.resource as CabinetResource,
        allowsVisibility: row.allows_visibility,
        allowsContent: row.allows_content,
      })
      acc[row.status_slug] = bucket
      return acc
    }, {})
  },

  async getForStatus(slug: string): Promise<AccessStatusResourceAccessRow[]> {
    const result = (await supabaseClient.rpc('get_company_access_status_resource_access', {
      p_slug: slug,
    })) as QueryResult<unknown>

    return parseRows(assertResult(result))
  },

  async saveForStatus(
    slug: string,
    rows: AccessStatusResourceAccessRow[],
  ): Promise<AccessStatusResourceAccessRow[]> {
    const result = (await supabaseClient.rpc('set_company_access_status_resource_access', {
      p_slug: slug,
      p_rows: rows.map((row) => ({
        resource: row.resource,
        allows_visibility: row.allowsVisibility,
        allows_content: row.allowsContent,
      })),
    })) as QueryResult<unknown>

    return parseRows(assertResult(result))
  },
}
