import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableRow } from '../types/database'

export type WorkGroupCategory = TableRow<'work_group_categories'>

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

export const workGroupCategoriesService = {
  async listActive(): Promise<WorkGroupCategory[]> {
    const result = (await supabaseClient
      .from('work_group_categories')
      .select('id, name, slug, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })) as QueryResult<WorkGroupCategory[]>

    return assertResult(result)
  },
}
