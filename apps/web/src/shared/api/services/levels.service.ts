import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type ParticipationLevel = TableRow<'participation_levels'>

export type ParticipationLevelInput = {
  name: string
  description?: string | null
  is_active?: boolean
  sort_order?: number
}

export type ParticipationLevelUsage = {
  companies: number
  material_sections: number
  polls: number
  total: number
}

export type LevelsListFilters = {
  search?: string
  active?: 'all' | 'active' | 'hidden'
}

function parseUsage(value: unknown): ParticipationLevelUsage {
  const raw = (value ?? {}) as Record<string, unknown>
  const companies = Number(raw.companies ?? 0)
  const materialSections = Number(raw.material_sections ?? 0)
  const polls = Number(raw.polls ?? 0)
  return {
    companies,
    material_sections: materialSections,
    polls,
    total: Number(raw.total ?? companies + materialSections + polls),
  }
}

/**
 * Admin participation levels access layer.
 */
export const levelsService = {
  async list(filters: LevelsListFilters = {}): Promise<ParticipationLevel[]> {
    let query = supabaseClient
      .from('participation_levels')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (filters.active === 'active') {
      query = query.eq('is_active', true)
    } else if (filters.active === 'hidden') {
      query = query.eq('is_active', false)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(`name.ilike."${pattern}",description.ilike."${pattern}"`)
      }
    }

    const result = await query
    if (result.error) {
      throw new ApiError(result.error.message, {
        code: 'unknown',
        details: result.error,
        cause: result.error,
      })
    }
    return (result.data ?? []) as ParticipationLevel[]
  },

  getById(id: string) {
    return dataService.getById('participation_levels', id)
  },

  async create(input: ParticipationLevelInput): Promise<ParticipationLevel> {
    const existing = await this.list()
    const nextOrder =
      input.sort_order ??
      (existing.length ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0)

    const payload: TableInsert<'participation_levels'> = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.is_active ?? true,
      sort_order: nextOrder,
    }

    return dataService.insert('participation_levels', payload)
  },

  async update(id: string, input: ParticipationLevelInput): Promise<ParticipationLevel> {
    const payload: TableUpdate<'participation_levels'> = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: input.is_active,
      sort_order: input.sort_order,
    }
    return dataService.updateById('participation_levels', id, payload)
  },

  async setActive(id: string, isActive: boolean): Promise<ParticipationLevel> {
    return dataService.updateById('participation_levels', id, { is_active: isActive })
  },

  async getUsage(levelId: string): Promise<ParticipationLevelUsage> {
    const result = await rpcService.call('get_participation_level_usage', {
      p_level_id: levelId,
    })
    return parseUsage(result)
  },

  async delete(levelId: string): Promise<void> {
    await rpcService.call('delete_participation_level', { p_level_id: levelId })
  },

  async reorder(orderedIds: string[]): Promise<ParticipationLevel[]> {
    return rpcService.call('reorder_participation_levels', {
      p_ordered_ids: orderedIds,
    })
  },

  /**
   * Move level one step up/down within current ordered list.
   */
  async move(levelId: string, direction: 'up' | 'down'): Promise<ParticipationLevel[]> {
    const levels = await this.list()
    const index = levels.findIndex((item) => item.id === levelId)
    if (index < 0) {
      throw new ApiError('Уровень не найден', { code: 'not_found' })
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= levels.length) {
      return levels
    }

    const next = [...levels]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    return this.reorder(next.map((row) => row.id))
  },
}
