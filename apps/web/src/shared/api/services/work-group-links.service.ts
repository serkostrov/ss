import { ApiError } from '@shared/lib/errors'
import {
  assertAllowedWorkGroupFile,
  assertPathBelongsToOwner,
  extractStorageObjectPath,
  normalizeExternalUrl,
  WORK_GROUP_FILE_ALLOWED_MIME_TYPES,
  WORK_GROUP_FILE_MAX_BYTES,
} from '@shared/lib/files'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow, TableUpdate } from '../types/database'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'
import { STORAGE_BUCKETS, storageService } from './storage.service'

export type WorkGroupLink = TableRow<'work_group_links'>

export type WorkGroupLinkExternalInput = {
  workGroupId: string
  title: string
  url: string
  description?: string | null
}

export type WorkGroupLinkFileInput = {
  workGroupId: string
  file: File
  title?: string
  description?: string | null
}

export type WorkGroupLinkUpdateInput = {
  title: string
  description?: string | null
  /** Only for external links. */
  url?: string | null
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

const LINK_SELECT =
  'id, work_group_id, title, url, file_url, description, sort_order, file_size, mime_type, created_at'

/**
 * Work group links: external URLs and/or private Storage files.
 * `file_url` stores the object path inside `work-group-files`.
 */
export const workGroupLinksService = {
  maxBytes: WORK_GROUP_FILE_MAX_BYTES,
  allowedMimeTypes: WORK_GROUP_FILE_ALLOWED_MIME_TYPES,
  bucket: STORAGE_BUCKETS.workGroupFiles,

  isFile(link: WorkGroupLink): boolean {
    return Boolean(link.file_url)
  },

  isExternal(link: WorkGroupLink): boolean {
    return Boolean(link.url) && !link.file_url
  },

  async listByGroup(workGroupId: string): Promise<WorkGroupLink[]> {
    const result = (await supabaseClient
      .from('work_group_links')
      .select(LINK_SELECT)
      .eq('work_group_id', workGroupId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })) as QueryResult<WorkGroupLink[]>

    return assertResult(result)
  },

  async getById(id: string): Promise<WorkGroupLink | null> {
    const result = (await supabaseClient
      .from('work_group_links')
      .select(LINK_SELECT)
      .eq('id', id)
      .maybeSingle()) as QueryResult<WorkGroupLink | null>

    return assertResult(result)
  },

  async nextSortOrder(workGroupId: string): Promise<number> {
    const result = (await supabaseClient
      .from('work_group_links')
      .select('sort_order')
      .eq('work_group_id', workGroupId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()) as QueryResult<{ sort_order: number } | null>

    const row = assertResult(result)
    return row ? row.sort_order + 1 : 0
  },

  async createExternal(input: WorkGroupLinkExternalInput): Promise<WorkGroupLink> {
    const url = normalizeExternalUrl(input.url)
    const title = input.title.trim()
    if (title.length < 2) {
      throw new ApiError('Укажите название ссылки', { code: 'validation' })
    }

    const payload: TableInsert<'work_group_links'> = {
      work_group_id: input.workGroupId,
      title: title.slice(0, 200),
      url,
      file_url: null,
      description: input.description?.trim() || null,
      sort_order: await this.nextSortOrder(input.workGroupId),
      file_size: null,
      mime_type: null,
    }

    return dataService.insert('work_group_links', payload)
  },

  async uploadFile(input: WorkGroupLinkFileInput): Promise<WorkGroupLink> {
    const { mimeType, size } = assertAllowedWorkGroupFile(input.file)
    const objectPath = storageService.buildObjectPath([input.workGroupId], input.file.name)
    assertPathBelongsToOwner(objectPath, input.workGroupId)

    const uploaded = await storageService.upload({
      bucket: this.bucket,
      path: objectPath,
      file: input.file,
      contentType: mimeType,
      upsert: false,
    })

    try {
      const payload: TableInsert<'work_group_links'> = {
        work_group_id: input.workGroupId,
        title: (input.title?.trim() || input.file.name).slice(0, 200),
        url: null,
        file_url: uploaded.path,
        description: input.description?.trim() || null,
        sort_order: await this.nextSortOrder(input.workGroupId),
        file_size: size,
        mime_type: mimeType,
      }
      return await dataService.insert('work_group_links', payload)
    } catch (error) {
      await storageService.remove(this.bucket, [uploaded.path]).catch(() => undefined)
      throw error
    }
  },

  async update(id: string, input: WorkGroupLinkUpdateInput): Promise<WorkGroupLink> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Ссылка не найдена', { code: 'not_found' })

    const title = input.title.trim()
    if (title.length < 2) {
      throw new ApiError('Укажите название', { code: 'validation' })
    }

    const payload: TableUpdate<'work_group_links'> = {
      title: title.slice(0, 200),
      description: input.description?.trim() || null,
    }

    if (this.isExternal(existing)) {
      if (!input.url?.trim()) {
        throw new ApiError('Укажите URL', { code: 'validation' })
      }
      payload.url = normalizeExternalUrl(input.url)
    }

    return dataService.updateById('work_group_links', id, payload)
  },

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) throw new ApiError('Ссылка не найдена', { code: 'not_found' })

    await dataService.deleteById('work_group_links', id)

    if (existing.file_url) {
      try {
        const path = extractStorageObjectPath(existing.file_url, this.bucket)
        assertPathBelongsToOwner(path, existing.work_group_id)
        await storageService.remove(this.bucket, [path])
      } catch {
        // DB row removed; storage cleanup is best-effort.
      }
    }
  },

  async getDownloadUrl(link: WorkGroupLink, expiresInSeconds = 60 * 10): Promise<string> {
    if (!link.file_url) {
      throw new ApiError('У записи нет файла для скачивания', { code: 'validation' })
    }
    const path = extractStorageObjectPath(link.file_url, this.bucket)
    assertPathBelongsToOwner(path, link.work_group_id)
    return storageService.createSignedUrl(this.bucket, path, expiresInSeconds)
  },

  async move(
    workGroupId: string,
    linkId: string,
    direction: 'up' | 'down',
  ): Promise<WorkGroupLink[]> {
    const links = await this.listByGroup(workGroupId)
    const index = links.findIndex((item) => item.id === linkId)
    if (index < 0) throw new ApiError('Ссылка не найдена', { code: 'not_found' })

    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= links.length) return links

    const next = [...links]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)

    return this.reorder(
      workGroupId,
      next.map((row) => row.id),
    )
  },

  async reorder(workGroupId: string, orderedIds: string[]): Promise<WorkGroupLink[]> {
    const result = await rpcService.call('reorder_work_group_links', {
      p_work_group_id: workGroupId,
      p_ordered_ids: orderedIds,
    })
    return result as WorkGroupLink[]
  },
}
