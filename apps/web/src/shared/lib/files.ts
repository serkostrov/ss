import { ApiError } from './errors'

/** Default max size for material documents (25 MiB). */
export const MATERIAL_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export const MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/zip',
  'application/x-zip-compressed',
] as const

const EXT_MIME_FALLBACK: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  zip: 'application/zip',
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function resolveFileMimeType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME_FALLBACK[ext] ?? 'application/octet-stream'
}

export function assertAllowedMaterialDocument(
  file: File,
  options?: { maxBytes?: number; allowedMimeTypes?: readonly string[] },
): { mimeType: string; size: number } {
  const maxBytes = options?.maxBytes ?? MATERIAL_DOCUMENT_MAX_BYTES
  const allowed = options?.allowedMimeTypes ?? MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES
  const mimeType = resolveFileMimeType(file)

  if (file.size <= 0) {
    throw new ApiError('Файл пуст', { code: 'validation' })
  }

  if (file.size > maxBytes) {
    throw new ApiError(`Файл больше ${formatFileSize(maxBytes)}`, { code: 'validation' })
  }

  if (!allowed.includes(mimeType)) {
    throw new ApiError(`Тип файла не поддерживается: ${mimeType || 'unknown'}`, {
      code: 'validation',
    })
  }

  return { mimeType, size: file.size }
}

/**
 * Extract Storage object path from stored file_url.
 * Accepts relative path or full public/signed URL containing `/material-documents/`.
 */
export function extractStorageObjectPath(fileUrl: string, bucket = 'material-documents'): string {
  const trimmed = fileUrl.trim()
  if (!trimmed) {
    throw new ApiError('Путь файла пуст', { code: 'validation' })
  }

  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    if (trimmed.includes('..')) {
      throw new ApiError('Небезопасный путь файла', { code: 'validation' })
    }
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const marker = `/${bucket}/`
    const idx = url.pathname.indexOf(marker)
    if (idx >= 0) {
      const path = decodeURIComponent(url.pathname.slice(idx + marker.length))
      if (!path || path.includes('..')) {
        throw new ApiError('Небезопасный путь файла', { code: 'validation' })
      }
      return path
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
  }

  throw new ApiError('Некорректный путь файла в Storage', { code: 'validation' })
}

export function assertPathBelongsToSection(path: string, sectionId: string): void {
  if (!path.startsWith(`${sectionId}/`)) {
    throw new ApiError('Файл не принадлежит разделу', { code: 'forbidden' })
  }
}

export function assertPathBelongsToOwner(path: string, ownerId: string): void {
  if (!path.startsWith(`${ownerId}/`)) {
    throw new ApiError('Файл не принадлежит сущности', { code: 'forbidden' })
  }
}

/** Work-group files: same allow-list, up to 50 MiB (bucket limit). */
export const WORK_GROUP_FILE_MAX_BYTES = 50 * 1024 * 1024
export const WORK_GROUP_FILE_ALLOWED_MIME_TYPES = MATERIAL_DOCUMENT_ALLOWED_MIME_TYPES

export function assertAllowedWorkGroupFile(file: File): { mimeType: string; size: number } {
  return assertAllowedMaterialDocument(file, {
    maxBytes: WORK_GROUP_FILE_MAX_BYTES,
    allowedMimeTypes: WORK_GROUP_FILE_ALLOWED_MIME_TYPES,
  })
}

export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new ApiError('Укажите URL', { code: 'validation' })
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ApiError('Разрешены только http/https ссылки', { code: 'validation' })
    }
    return url.toString()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Некорректный URL', { code: 'validation' })
  }
}

export function isPreviewableMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType === 'text/plain'
}
