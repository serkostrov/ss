import type { CompanyAccessStatus } from '@shared/api'

export type CabinetResource =
  | 'directory'
  | 'products'
  | 'materials'
  | 'polls'
  | 'work_groups'
  | 'invoices'

export type LevelResourceAccessRow = {
  resource: CabinetResource
  visibility_statuses: CompanyAccessStatus[]
  content_statuses: CompanyAccessStatus[]
}

export const CABINET_RESOURCES: CabinetResource[] = [
  'directory',
  'products',
  'materials',
  'polls',
  'work_groups',
  'invoices',
]

export type AccessStatusDefaults = {
  slugs: string[]
  defaultSlug: string
  programSlugs: string[]
}

export function buildAccessStatusDefaults(
  records: Array<{ slug: string; is_default?: boolean; excludes_from_program?: boolean }>,
): AccessStatusDefaults {
  const slugs = records.map((record) => record.slug)
  const defaultSlug = records.find((record) => record.is_default)?.slug ?? slugs[0] ?? 'active'
  const programSlugs = records
    .filter((record) => !record.excludes_from_program)
    .map((record) => record.slug)

  return {
    slugs,
    defaultSlug,
    programSlugs: programSlugs.length ? programSlugs : ['active', 'suspended'],
  }
}

export function cabinetResourceLabel(resource: CabinetResource): string {
  switch (resource) {
    case 'directory':
      return 'Участники'
    case 'products':
      return 'Продукция и услуги'
    case 'materials':
      return 'Материалы'
    case 'polls':
      return 'Голосования'
    case 'work_groups':
      return 'Рабочие группы'
    case 'invoices':
      return 'Счета на оплату'
  }
}

export function defaultLevelResourceAccessRows(defaults: AccessStatusDefaults): LevelResourceAccessRow[] {
  return CABINET_RESOURCES.map((resource) => ({
    resource,
    visibility_statuses: [...defaults.programSlugs],
    content_statuses: [defaults.defaultSlug],
  }))
}

export function normalizeLevelResourceAccessRows(
  rows: LevelResourceAccessRow[] | null | undefined,
  defaults: AccessStatusDefaults,
): LevelResourceAccessRow[] {
  const byResource = new Map((rows ?? []).map((row) => [row.resource, row]))
  return CABINET_RESOURCES.map((resource) => {
    const existing = byResource.get(resource)
    return {
      resource,
      visibility_statuses: existing
        ? [...existing.visibility_statuses]
        : [...defaults.programSlugs],
      content_statuses: existing ? [...existing.content_statuses] : [defaults.defaultSlug],
    }
  })
}

export function toggleStatus(
  statuses: CompanyAccessStatus[],
  status: CompanyAccessStatus,
): CompanyAccessStatus[] {
  return statuses.includes(status)
    ? statuses.filter((item) => item !== status)
    : [...statuses, status]
}
