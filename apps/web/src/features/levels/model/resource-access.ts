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

export const COMPANY_ACCESS_STATUSES: CompanyAccessStatus[] = ['active', 'suspended', 'archived']

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

export function companyAccessStatusLabel(status: CompanyAccessStatus): string {
  switch (status) {
    case 'active':
      return 'Активна'
    case 'suspended':
      return 'Приостановлена'
    case 'archived':
      return 'Вышедшая'
  }
}

export function defaultLevelResourceAccessRows(): LevelResourceAccessRow[] {
  return CABINET_RESOURCES.map((resource) => ({
    resource,
    visibility_statuses: ['active', 'suspended'],
    content_statuses: ['active'],
  }))
}

export function normalizeLevelResourceAccessRows(
  rows: LevelResourceAccessRow[] | null | undefined,
): LevelResourceAccessRow[] {
  const byResource = new Map((rows ?? []).map((row) => [row.resource, row]))
  return CABINET_RESOURCES.map((resource) => {
    const existing = byResource.get(resource)
    return {
      resource,
      visibility_statuses: existing?.visibility_statuses?.length
        ? [...existing.visibility_statuses]
        : ['active', 'suspended'],
      content_statuses: existing?.content_statuses?.length
        ? [...existing.content_statuses]
        : ['active'],
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
