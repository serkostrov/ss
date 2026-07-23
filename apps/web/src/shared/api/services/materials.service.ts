import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'

export type MaterialLevelRef = Pick<
  TableRow<'participation_levels'>,
  'id' | 'name' | 'is_active' | 'sort_order'
>

export type MaterialSection = TableRow<'material_sections'> & {
  levels: MaterialLevelRef[]
  level_ids: string[]
}

export type MaterialSectionInput = {
  title: string
  slug?: string | null
  description?: string | null
  content?: string | null
  is_published?: boolean
  sort_order?: number
  level_ids?: string[]
}

export type MaterialsListFilters = {
  search?: string
  status?: 'all' | 'draft' | 'published'
  /** Filter sections that include this participation level. */
  levelId?: string
}

/** List/card payload — without heavy Markdown `content`. */
const LIST_SELECT = `
  id,
  title,
  slug,
  description,
  is_published,
  sort_order,
  created_at,
  updated_at,
  material_section_levels (
    participation_level_id,
    participation_levels (
      id,
      name,
      is_active,
      sort_order
    )
  )
`

/** Detail / cabinet — includes content. */
const DETAIL_SELECT = `
  id,
  title,
  slug,
  description,
  content,
  is_published,
  sort_order,
  created_at,
  updated_at,
  material_section_levels (
    participation_level_id,
    participation_levels (
      id,
      name,
      is_active,
      sort_order
    )
  )
`

/**
 * Member cabinet select — no ACL embeds (levels are server-enforced via RLS).
 * Closed materials cannot be returned even if client tampers with filters.
 */
const MEMBER_LIST_SELECT = `
  id,
  title,
  slug,
  description,
  is_published,
  sort_order,
  created_at,
  updated_at
`

const MEMBER_DETAIL_SELECT = `
  id,
  title,
  slug,
  description,
  content,
  is_published,
  sort_order,
  created_at,
  updated_at
`

export type CabinetMaterial = {
  id: string
  title: string
  slug: string | null
  description: string | null
  content: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

type QueryResult<T> = {
  data: T
  error: { message: string; code?: string; details?: string; hint?: string } | null
}

type RawSection = Omit<TableRow<'material_sections'>, 'content'> & {
  content?: string | null
  material_section_levels:
    | Array<{
        participation_level_id: string
        participation_levels: MaterialLevelRef | MaterialLevelRef[] | null
      }>
    | null
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

const CYR_TO_LAT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

export function slugifyTitle(title: string): string {
  const translit = title
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => CYR_TO_LAT[char] ?? char)
    .join('')

  return (
    translit
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `section-${Date.now()}`
  )
}

function normalize(row: RawSection): MaterialSection {
  const levels: MaterialLevelRef[] = []
  for (const link of row.material_section_levels ?? []) {
    const level = Array.isArray(link.participation_levels)
      ? link.participation_levels[0]
      : link.participation_levels
    if (level) levels.push(level)
  }
  levels.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'))

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    content: row.content ?? null,
    is_published: row.is_published,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    levels,
    level_ids: levels.map((item) => item.id),
  }
}

function toCabinetMaterial(
  row: Pick<
    TableRow<'material_sections'>,
    'id' | 'title' | 'slug' | 'description' | 'is_published' | 'sort_order' | 'created_at' | 'updated_at'
  > & { content?: string | null },
): CabinetMaterial | null {
  // Defense in depth: never surface unpublished rows to members.
  if (!row.is_published) return null
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    content: row.content ?? null,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function nextSortOrder(): Promise<number> {
  const result = (await supabaseClient
    .from('material_sections')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()) as QueryResult<{ sort_order: number } | null>

  const row = assertResult(result)
  return row ? row.sort_order + 1 : 0
}

/**
 * Admin materials (sections + level ACL).
 */
export const materialsService = {
  async list(filters: MaterialsListFilters = {}): Promise<MaterialSection[]> {
    const levelId = filters.levelId?.trim()
    let sectionIdsFilter: string[] | null = null

    if (levelId) {
      const linksResult = (await supabaseClient
        .from('material_section_levels')
        .select('material_section_id')
        .eq('participation_level_id', levelId)) as QueryResult<
        Array<{ material_section_id: string }>
      >
      sectionIdsFilter = [...new Set(assertResult(linksResult).map((row) => row.material_section_id))]
      if (!sectionIdsFilter.length) return []
    }

    let query = supabaseClient
      .from('material_sections')
      .select(LIST_SELECT)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })

    if (sectionIdsFilter) {
      query = query.in('id', sectionIdsFilter)
    }

    if (filters.status === 'draft') {
      query = query.eq('is_published', false)
    } else if (filters.status === 'published') {
      query = query.eq('is_published', true)
    }

    const search = filters.search?.trim()
    if (search) {
      const safe = search.replace(/[%_,()"]/g, ' ').replace(/\s+/g, ' ').trim()
      if (safe) {
        const pattern = `%${safe}%`
        query = query.or(
          [`title.ilike."${pattern}"`, `description.ilike."${pattern}"`, `slug.ilike."${pattern}"`].join(
            ',',
          ),
        )
      }
    }

    const result = (await query) as unknown as QueryResult<RawSection[]>
    return assertResult(result).map(normalize)
  },

  async getById(id: string): Promise<MaterialSection | null> {
    const result = (await supabaseClient
      .from('material_sections')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle()) as unknown as QueryResult<RawSection | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },

  async getBySlug(slug: string): Promise<MaterialSection | null> {
    const result = (await supabaseClient
      .from('material_sections')
      .select(DETAIL_SELECT)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle()) as unknown as QueryResult<RawSection | null>

    const row = assertResult(result)
    return row ? normalize(row) : null
  },

  /**
   * Member cabinet list. Relies on RLS; additionally forces is_published
   * and omits ACL embeds so closed materials cannot be probed via API shape.
   */
  async listForMember(): Promise<CabinetMaterial[]> {
    const result = (await supabaseClient
      .from('material_sections')
      .select(MEMBER_LIST_SELECT)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })) as unknown as QueryResult<
      Array<
        Pick<
          TableRow<'material_sections'>,
          | 'id'
          | 'title'
          | 'slug'
          | 'description'
          | 'is_published'
          | 'sort_order'
          | 'created_at'
          | 'updated_at'
        >
      >
    >

    return assertResult(result)
      .map((row) => toCabinetMaterial(row))
      .filter((row): row is CabinetMaterial => row != null)
  },

  /**
   * Member cabinet detail by slug. Unpublished / out-of-level → null (RLS + filter).
   * Do not use getById from cabinet — UUID probing of drafts is blocked by RLS,
   * but this path never requests unpublished rows.
   */
  async getForMemberBySlug(slug: string): Promise<CabinetMaterial | null> {
    const normalized = slug.trim().toLowerCase()
    if (!normalized) return null

    const result = (await supabaseClient
      .from('material_sections')
      .select(MEMBER_DETAIL_SELECT)
      .eq('slug', normalized)
      .eq('is_published', true)
      .maybeSingle()) as unknown as QueryResult<
      | (Pick<
          TableRow<'material_sections'>,
          | 'id'
          | 'title'
          | 'slug'
          | 'description'
          | 'is_published'
          | 'sort_order'
          | 'created_at'
          | 'updated_at'
        > & { content: string | null })
      | null
    >

    const row = assertResult(result)
    return row ? toCabinetMaterial(row) : null
  },

  async create(input: MaterialSectionInput): Promise<MaterialSection> {
    const nextOrder = input.sort_order ?? (await nextSortOrder())

    const payload: TableInsert<'material_sections'> = {
      title: input.title.trim(),
      slug: (input.slug?.trim() || slugifyTitle(input.title)).toLowerCase(),
      description: input.description?.trim() || null,
      content: input.content ?? null,
      is_published: input.is_published ?? false,
      sort_order: nextOrder,
    }

    const created = await dataService.insert('material_sections', payload)

    if (input.level_ids?.length) {
      await rpcService.call('set_material_section_levels', {
        p_section_id: created.id,
        p_level_ids: [...new Set(input.level_ids)],
      })
    }

    const full = await this.getById(created.id)
    if (!full) throw new ApiError('Раздел создан, но не найден', { code: 'unknown' })
    return full
  },

  async update(id: string, input: MaterialSectionInput): Promise<MaterialSection> {
    const payload: TableUpdate<'material_sections'> = {
      title: input.title.trim(),
      slug: (input.slug?.trim() || slugifyTitle(input.title)).toLowerCase(),
      description: input.description?.trim() || null,
      content: input.content ?? null,
      is_published: input.is_published,
      sort_order: input.sort_order,
      updated_at: new Date().toISOString(),
    }

    await dataService.updateById('material_sections', id, payload)

    if (input.level_ids) {
      await rpcService.call('set_material_section_levels', {
        p_section_id: id,
        p_level_ids: [...new Set(input.level_ids)],
      })
    }

    const full = await this.getById(id)
    if (!full) throw new ApiError('Раздел не найден', { code: 'not_found' })
    return full
  },

  async setPublished(id: string, isPublished: boolean): Promise<MaterialSection> {
    await dataService.updateById('material_sections', id, {
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    })
    const full = await this.getById(id)
    if (!full) throw new ApiError('Раздел не найден', { code: 'not_found' })
    return full
  },

  async setLevels(id: string, levelIds: string[]): Promise<MaterialSection> {
    await rpcService.call('set_material_section_levels', {
      p_section_id: id,
      p_level_ids: [...new Set(levelIds)],
    })
    const full = await this.getById(id)
    if (!full) throw new ApiError('Раздел не найден', { code: 'not_found' })
    return full
  },

  async delete(id: string): Promise<void> {
    await dataService.deleteById('material_sections', id)
  },

  async reorder(orderedIds: string[]): Promise<MaterialSection[]> {
    await rpcService.call('reorder_material_sections', { p_ordered_ids: orderedIds })
    return this.list()
  },

  async move(sectionId: string, direction: 'up' | 'down'): Promise<MaterialSection[]> {
    const sections = await this.list()
    const index = sections.findIndex((item) => item.id === sectionId)
    if (index < 0) throw new ApiError('Раздел не найден', { code: 'not_found' })

    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= sections.length) return sections

    const next = [...sections]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    return this.reorder(next.map((row) => row.id))
  },
}
