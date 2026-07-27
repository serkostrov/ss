import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { slugifyTitle } from './materials.service'
import { rpcService } from './rpc.service'

export type MaterialCategory = TableRow<'material_categories'>

export type MaterialCategoryInput = {
  name: string
  is_active?: boolean
  sort_order?: number
  slug?: string
}

export type MaterialCategoryUsage = {
  material_sections: number
  total: number
}

export type MaterialCategoriesListFilters = {
  search?: string
  active?: 'all' | 'active' | 'hidden'
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

function parseUsage(value: unknown): MaterialCategoryUsage {
  const raw = (value ?? {}) as Record<string, unknown>
  const sections = Number(raw.material_sections ?? 0)
  return {
    material_sections: sections,
    total: Number(raw.total ?? sections),
  }
}

function resolveSlug(name: string, explicit?: string): string {
  const fromExplicit = explicit?.trim()
  if (fromExplicit) return fromExplicit.toLowerCase()
  return slugifyTitle(name).toLowerCase()
}

/**
 * Material categories (справочник) access layer.
 */
export const materialCategoriesService = {
  async listActive(): Promise<MaterialCategory[]> {
    const result = (await supabaseClient
      .from('material_categories')
      .select('id, name, slug, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })) as QueryResult<MaterialCategory[]>

    return assertResult(result)
  },

  async list(filters: MaterialCategoriesListFilters = {}): Promise<MaterialCategory[]> {
    let query = supabaseClient
      .from('material_categories')
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
        query = query.or(`name.ilike."${pattern}",slug.ilike."${pattern}"`)
      }
    }

    const result = (await query) as QueryResult<MaterialCategory[]>
    return assertResult(result)
  },

  getById(id: string) {
    return dataService.getById('material_categories', id)
  },

  async create(input: MaterialCategoryInput): Promise<MaterialCategory> {
    const existing = await this.list()
    const nextOrder =
      input.sort_order ??
      (existing.length ? Math.max(...existing.map((item) => item.sort_order)) + 1 : 0)

    const baseSlug = resolveSlug(input.name, input.slug)
    const taken = new Set(existing.map((item) => item.slug))
    let slug = baseSlug
    if (taken.has(slug)) {
      let suffix = 2
      while (taken.has(`${baseSlug}-${suffix}`)) suffix += 1
      slug = `${baseSlug}-${suffix}`
    }

    const payload: TableInsert<'material_categories'> = {
      name: input.name.trim(),
      slug,
      is_active: input.is_active ?? true,
      sort_order: nextOrder,
    }

    return dataService.insert('material_categories', payload)
  },

  async update(id: string, input: MaterialCategoryInput): Promise<MaterialCategory> {
    const payload: TableUpdate<'material_categories'> = {
      name: input.name.trim(),
      is_active: input.is_active,
      sort_order: input.sort_order,
    }
    if (input.slug?.trim()) {
      payload.slug = input.slug.trim().toLowerCase()
    }
    return dataService.updateById('material_categories', id, payload)
  },

  async setActive(id: string, isActive: boolean): Promise<MaterialCategory> {
    return dataService.updateById('material_categories', id, { is_active: isActive })
  },

  async getUsage(categoryId: string): Promise<MaterialCategoryUsage> {
    const result = await rpcService.call('get_material_category_usage', {
      p_category_id: categoryId,
    })
    return parseUsage(result)
  },

  async delete(categoryId: string): Promise<void> {
    await rpcService.call('delete_material_category', { p_category_id: categoryId })
  },

  async reorder(orderedIds: string[]): Promise<MaterialCategory[]> {
    return rpcService.call('reorder_material_categories', {
      p_ordered_ids: orderedIds,
    })
  },

  async move(categoryId: string, direction: 'up' | 'down'): Promise<MaterialCategory[]> {
    const categories = await this.list()
    const index = categories.findIndex((item) => item.id === categoryId)
    if (index < 0) {
      throw new ApiError('Категория не найдена', { code: 'not_found' })
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= categories.length) {
      return categories
    }

    const next = [...categories]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item)
    return this.reorder(next.map((row) => row.id))
  },
}
