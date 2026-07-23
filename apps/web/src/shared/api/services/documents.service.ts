import { ApiError } from '@shared/lib/errors'
import {
  assertAllowedMaterialDocument,
  assertPathBelongsToSection,
  extractStorageObjectPath,
  MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES,
  MATERIAL_DOCUMENT_MAX_BYTES,
} from '@shared/lib/files'

import { supabaseClient } from '../lib/client'
import type { TableInsert, TableRow } from '../types/database'
import { authService } from './auth.service'
import { dataService } from './data.service'
import { rpcService } from './rpc.service'
import { STORAGE_BUCKETS, storageService } from './storage.service'

export type MaterialDocument = TableRow<'material_documents'>

export type MaterialDocumentUploadInput = {
  sectionId: string
  file: File
  title?: string
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

/**
 * Material documents: DB metadata + private Storage objects.
 * `file_url` stores the Storage object path inside `material-documents` bucket.
 */
export const documentsService = {
  maxBytes: MATERIAL_DOCUMENT_MAX_BYTES,
  allowedMimeTypes: MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES,
  bucket: STORAGE_BUCKETS.materialDocuments,

  async listBySection(sectionId: string): Promise<MaterialDocument[]> {
    const result = (await supabaseClient
      .from('material_documents')
      .select(
        'id, material_section_id, title, file_url, file_size, mime_type, sort_order, uploaded_by, created_at',
      )
      .eq('material_section_id', sectionId)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true })) as QueryResult<MaterialDocument[]>

    return assertResult(result)
  },

  async upload(input: MaterialDocumentUploadInput): Promise<MaterialDocument> {
    const { mimeType, size } = assertAllowedMaterialDocument(input.file)
    const user = await authService.getUser()

    const objectPath = storageService.buildObjectPath([input.sectionId], input.file.name)
    assertPathBelongsToSection(objectPath, input.sectionId)

    const uploaded = await storageService.upload({
      bucket: this.bucket,
      path: objectPath,
      file: input.file,
      contentType: mimeType,
      upsert: false,
    })

    try {
      const existing = await this.listBySection(input.sectionId)
      const nextOrder = existing.length
        ? Math.max(...existing.map((item) => item.sort_order)) + 1
        : 0

      const payload: TableInsert<'material_documents'> = {
        material_section_id: input.sectionId,
        title: (input.title?.trim() || input.file.name).slice(0, 200),
        file_url: uploaded.path,
        file_size: size,
        mime_type: mimeType,
        sort_order: nextOrder,
        uploaded_by: user?.id ?? null,
      }

      return await dataService.insert('material_documents', payload)
    } catch (error) {
      await storageService.remove(this.bucket, [uploaded.path]).catch(() => undefined)
      throw error
    }
  },

  async getDownloadUrl(document: MaterialDocument, expiresInSeconds = 60 * 10): Promise<string> {
    const path = extractStorageObjectPath(document.file_url, this.bucket)
    assertPathBelongsToSection(path, document.material_section_id)
    return storageService.createSignedUrl(this.bucket, path, expiresInSeconds)
  },

  async downloadBlob(document: MaterialDocument): Promise<Blob> {
    const path = extractStorageObjectPath(document.file_url, this.bucket)
    assertPathBelongsToSection(path, document.material_section_id)
    return storageService.download(this.bucket, path)
  },

  async delete(documentId: string): Promise<void> {
    const doc = await dataService.getById('material_documents', documentId)
    if (!doc) {
      throw new ApiError('Документ не найден', { code: 'not_found' })
    }

    const path = extractStorageObjectPath(doc.file_url, this.bucket)
    assertPathBelongsToSection(path, doc.material_section_id)

    await dataService.deleteById('material_documents', documentId)

    try {
      await storageService.remove(this.bucket, [path])
    } catch {
      // DB row already removed; storage cleanup is best-effort.
    }
  },

  async move(
    sectionId: string,
    documentId: string,
    direction: 'up' | 'down',
  ): Promise<MaterialDocument[]> {
    const docs = await this.listBySection(sectionId)
    const index = docs.findIndex((item) => item.id === documentId)
    if (index < 0) {
      throw new ApiError('Документ не найден', { code: 'not_found' })
    }

    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= docs.length) return docs

    const next = [...docs]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)

    return this.reorder(
      sectionId,
      next.map((row) => row.id),
    )
  },

  async reorder(sectionId: string, orderedIds: string[]): Promise<MaterialDocument[]> {
    const result = await rpcService.call('reorder_material_documents', {
      p_section_id: sectionId,
      p_ordered_ids: orderedIds,
    })
    return result as MaterialDocument[]
  },
}
