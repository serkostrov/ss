import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'

export const STORAGE_BUCKETS = {
  materialDocuments: 'material-documents',
  workGroupFiles: 'work-group-files',
  invoices: 'invoices',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

export type UploadFileInput = {
  bucket: StorageBucket
  path: string
  file: File | Blob
  contentType?: string
  upsert?: boolean
  cacheControl?: string
}

export type UploadFileResult = {
  bucket: StorageBucket
  path: string
  fullPath: string
}

function assertSafeStoragePath(path: string): void {
  if (!path || path.includes('..') || path.startsWith('/')) {
    throw new ApiError('Некорректный путь файла в Storage', { code: 'validation' })
  }
  // Supabase Storage rejects non-ASCII object keys ("Invalid key").
  if (!/^[\x20-\x7E]+$/.test(path)) {
    throw new ApiError('Некорректный путь файла в Storage', { code: 'validation' })
  }
}

/**
 * Object keys must be ASCII-safe. Keep a readable stem + extension when possible;
 * original display names belong in DB fields (e.g. file_name), not in the key.
 */
function sanitizeStorageFileName(fileName: string): string {
  const trimmed = fileName.trim() || 'file'
  const lastDot = trimmed.lastIndexOf('.')
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1
  const baseRaw = hasExt ? trimmed.slice(0, lastDot) : trimmed
  const extRaw = hasExt ? trimmed.slice(lastDot + 1) : ''

  const base = baseRaw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)

  const ext = extRaw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 16)
    .toLowerCase()

  const safeBase = base || 'file'
  return ext ? `${safeBase}.${ext}` : safeBase
}

export const storageService = {
  buckets: STORAGE_BUCKETS,

  buildObjectPath(parts: Array<string | number>, fileName: string): string {
    const safeName = sanitizeStorageFileName(fileName)
    const uuid = crypto.randomUUID()
    return [...parts.map(String), `${uuid}_${safeName}`].join('/')
  },

  async upload(input: UploadFileInput): Promise<UploadFileResult> {
    assertSafeStoragePath(input.path)

    const result = await supabaseClient.storage.from(input.bucket).upload(input.path, input.file, {
      upsert: input.upsert ?? false,
      contentType: input.contentType,
      cacheControl: input.cacheControl ?? '3600',
    })

    if (result.error) {
      throw new ApiError(result.error.message, {
        code: 'server',
        cause: result.error,
      })
    }

    return {
      bucket: input.bucket,
      path: result.data.path,
      fullPath: `${input.bucket}/${result.data.path}`,
    }
  },

  async remove(bucket: StorageBucket, paths: string[]): Promise<void> {
    paths.forEach(assertSafeStoragePath)
    const result = await supabaseClient.storage.from(bucket).remove(paths)
    if (result.error) {
      throw new ApiError(result.error.message, { code: 'server', cause: result.error })
    }
  },

  async createSignedUrl(
    bucket: StorageBucket,
    path: string,
    expiresInSeconds = 60 * 10,
  ): Promise<string> {
    assertSafeStoragePath(path)
    const result = await supabaseClient.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
    if (result.error || !result.data?.signedUrl) {
      throw new ApiError(result.error?.message ?? 'Не удалось создать ссылку на файл', {
        code: 'server',
        cause: result.error,
      })
    }
    return result.data.signedUrl
  },

  async createSignedUrls(
    bucket: StorageBucket,
    paths: string[],
    expiresInSeconds = 60 * 10,
  ): Promise<Array<{ path: string; signedUrl: string }>> {
    paths.forEach(assertSafeStoragePath)
    const result = await supabaseClient.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds)

    if (result.error) {
      throw new ApiError(result.error.message, { code: 'server', cause: result.error })
    }

    return (result.data ?? [])
      .filter((item): item is { path: string; signedUrl: string; error: null } =>
        Boolean(item.signedUrl && item.path),
      )
      .map((item) => ({ path: item.path, signedUrl: item.signedUrl }))
  },

  getPublicUrl(bucket: StorageBucket, path: string): string {
    assertSafeStoragePath(path)
    const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  },

  async download(bucket: StorageBucket, path: string): Promise<Blob> {
    assertSafeStoragePath(path)
    const result = await supabaseClient.storage.from(bucket).download(path)
    if (result.error || !result.data) {
      throw new ApiError(result.error?.message ?? 'Не удалось скачать файл', {
        code: 'server',
        cause: result.error,
      })
    }
    return result.data
  },
}
