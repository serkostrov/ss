import type { CabinetResource } from '@shared/api'

export type { CabinetResource }

export type AccessStatusResourceAccessRow = {
  resource: CabinetResource
  allowsVisibility: boolean
  allowsContent: boolean
}

export const ACCESS_STATUS_RESOURCES: CabinetResource[] = [
  'directory',
  'products',
  'materials',
  'polls',
  'work_groups',
  'invoices',
]

export function defaultAccessStatusResourceRows(
  options: { excludesFromProgram?: boolean; isDefault?: boolean } = {},
): AccessStatusResourceAccessRow[] {
  const allowsVisibility = !options.excludesFromProgram
  const allowsContent = allowsVisibility && (options.isDefault ?? false)

  return ACCESS_STATUS_RESOURCES.map((resource) => ({
    resource,
    allowsVisibility,
    allowsContent,
  }))
}

export function normalizeAccessStatusResourceRows(
  rows: AccessStatusResourceAccessRow[] | null | undefined,
  options: { excludesFromProgram?: boolean; isDefault?: boolean } = {},
): AccessStatusResourceAccessRow[] {
  const defaults = defaultAccessStatusResourceRows(options)
  const byResource = new Map((rows ?? []).map((row) => [row.resource, row]))

  return defaults.map((fallback) => {
    const existing = byResource.get(fallback.resource)
    if (!existing) return fallback
    const allowsVisibility = existing.allowsVisibility
    const allowsContent = allowsVisibility && existing.allowsContent
    return {
      resource: fallback.resource,
      allowsVisibility,
      allowsContent,
    }
  })
}

export function applyExcludesFromProgramToResourceRows(
  rows: AccessStatusResourceAccessRow[],
  excludesFromProgram: boolean,
): AccessStatusResourceAccessRow[] {
  if (!excludesFromProgram) return rows
  return rows.map((row) => ({
    ...row,
    allowsVisibility: false,
    allowsContent: false,
  }))
}

export function formatAccessStatusCapabilitiesSummary(
  rows: AccessStatusResourceAccessRow[],
  label: (resource: CabinetResource) => string,
): string {
  if (rows.every((row) => !row.allowsVisibility && !row.allowsContent)) {
    return 'Доступ в кабинете закрыт'
  }

  const visible = rows.filter((row) => row.allowsVisibility).map((row) => label(row.resource))
  const withContent = rows.filter((row) => row.allowsContent).map((row) => label(row.resource))

  if (visible.length === 0) {
    return 'Разделы кабинета скрыты'
  }

  if (withContent.length === 0) {
    return `Разделы видны (${visible.join(', ')}), содержимое недоступно`
  }

  if (withContent.length === visible.length) {
    return `Полный доступ: ${withContent.join(', ')}`
  }

  const contentSet = new Set(withContent)
  const visibleOnly = visible.filter((name) => !contentSet.has(name))
  return `Содержимое: ${withContent.join(', ')}${
    visibleOnly.length ? `; только раздел: ${visibleOnly.join(', ')}` : ''
  }`
}
