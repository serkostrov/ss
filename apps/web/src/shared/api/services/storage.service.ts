import { ApiError } from '@shared/lib/errors'

import { supabaseClient } from '../lib/client'

export const STORAGE_BUCKETS = {
  materialDocuments: 'material-documents',
  workGroupFiles: 'work-group-files',
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
}

export const storageService = {
  buckets: STORAGE_BUCKETS,

  buildObjectPath(parts: Array<string | number>, fileName: string): string {
    const safeName = fileName.replace(/[^\w.\-А-Яа-яЁё]+/g, '_').slice(0, 180)
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
